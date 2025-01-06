import { Request, Response } from 'express';
import redisClient from '../config/redis';
import { MysqlDataSource } from '../config/data-source';
import { ParkingSpot } from '../models/ParkingSpot';
import { User } from '../models/User';
import { Car } from '../models/Car';
import { ParkingRental } from '../models/ParkingRental';
import { GeoReplyWith } from 'redis';
import { EntityManager, In, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Transaction } from '../models/Transaction';
import { TransactionType } from '../enums/transaction-type.enum';
import moment from 'moment-timezone';
import { NearbyParkingSpotsDto } from '../dtos/client/nearby-parking-spots.dto';
import { RentParkingSpotDto } from '../dtos/client/rent-parking-spot.dto';
import { Fine } from '../models/Fine';
import { FineStatus } from '../enums/fine-status.enum';
import { SpotIdOptionalDto } from '../dtos/client/spot-id-optional.dto';

const getHome = async (req: Request, res: Response): Promise<void> => {
  res.render('home');
};

async function syncParkingSpotsToRedis(parkingSpots: ParkingSpot[]) {
  for (const spot of parkingSpots) {
    await redisClient.geoAdd('parkingSpots', {
      longitude: spot.longitude,
      latitude: spot.latitude,
      member: spot.id,
    });
  }
}

const getMap = async (
  req: Request<{}, {}, {}, SpotIdOptionalDto>,
  res: Response
): Promise<void> => {
  const user = req.user as User;
  const spotId = req.query.spotId ?? null;

  const parkingSpots = await MysqlDataSource.getRepository(ParkingSpot).find({
    where: { isDeleted: false },
    relations: ['zone'],
  });

  syncParkingSpotsToRedis(parkingSpots);

  let cars: Car[] = [];
  let userRentals: ParkingRental[] = [];

  if (user) {
    cars = await MysqlDataSource.getRepository(Car).find({
      where: { userId: user.id, isDeleted: false },
    });

    userRentals = await MysqlDataSource.getRepository(ParkingRental).find({
      where: {
        user: { id: user.id },
        startTime: LessThanOrEqual(moment.utc().toDate()),
        endTime: MoreThanOrEqual(moment.utc().toDate()),
        expired: false,
      },
      select: ['parkingSpotId'],
    });
  }

  return res.render('map', {
    parkingSpots: JSON.stringify(parkingSpots),
    userRentals: JSON.stringify(userRentals),
    cars,
    spotId,
  });
};

const getNearbyParkingSpots = async (
  req: Request<{}, {}, {}, NearbyParkingSpotsDto>,
  res: Response
): Promise<void> => {
  const lat = req.query.lat;
  const lng = req.query.lng;
  const radius = req.query.radius;

  const spots = await redisClient.geoSearchWith(
    'parkingSpots',
    { longitude: lng, latitude: lat },
    { radius: radius, unit: 'km' },
    [GeoReplyWith.COORDINATES]
  );

  const parkingSpots = await MysqlDataSource.getRepository(ParkingSpot).find({
    where: {
      id: In(spots.map(spot => spot.member)),
      isDeleted: false,
    },
    relations: ['zone'],
  });
  res.json(parkingSpots);
};

async function getTodaysParkingDuration(
  userId: string,
  parkingSpotId: string,
  transactionalEntityManager: EntityManager
) {
  const today = moment().startOf('day').utc();
  const tomorrow = moment().endOf('day').utc();

  const zoneId = (
    await transactionalEntityManager.findOne(ParkingSpot, {
      where: { id: parkingSpotId },
      select: { zoneId: true },
    })
  ).zoneId;

  const todaysRentals = await transactionalEntityManager.find(ParkingRental, {
    where: {
      userId: userId,
      parkingSpot: {
        zoneId,
      },
      startTime: MoreThanOrEqual(today.toDate()),
      endTime: LessThanOrEqual(tomorrow.toDate()),
    },
  });

  return todaysRentals.reduce(
    (total: number, rental: ParkingRental) => total + rental.minutes,
    0
  );
}

const rentParkingSpot = async (
  req: Request<{}, {}, RentParkingSpotDto>,
  res: Response
): Promise<void> => {
  try {
    const userId = (req.user as User).id;
    const user = await MysqlDataSource.getRepository(User).findOne({
      where: { id: userId },
    });

    const { parkingDuration, carId, parkingSpotId } = req.body;

    if (!parkingSpotId || !carId) {
      req.flash(
        'error',
        parkingSpotId ? 'Car not found.' : 'Parking spot not found.'
      );
      return res.status(400).redirect('/map');
    }

    let licensePlate: string;
    let rentalEndTime: string;
    let parkingAmount: number;

    await MysqlDataSource.transaction(async transactionalEntityManager => {
      const car = await transactionalEntityManager.findOne(Car, {
        where: { id: carId, userId: userId, isParked: false },
      });

      if (!car) {
        throw new Error('Car not found.');
      }

      const parkingSpot = await transactionalEntityManager.findOne(
        ParkingSpot,
        {
          where: { id: parkingSpotId, isOccupied: false },
          relations: ['zone'],
        }
      );

      if (!parkingSpot) {
        throw new Error('Parking spot not available.');
      }

      const activeFine = await transactionalEntityManager.findOne(Fine, {
        where: {
          parkingSpotId: parkingSpotId,
          carId: carId,
          status: In([FineStatus.ISSUED, FineStatus.PAID]),
          issuedAt: MoreThanOrEqual(moment().subtract(24, 'hours').toDate()),
        },
      });

      if (activeFine) {
        throw new Error(
          `A parking ticket has been issued for this parking spot and is valid until ${moment(activeFine.issuedAt).add(24, 'hours').format('llll')}.`
        );
      }

      const todaysDuration = await getTodaysParkingDuration(
        userId,
        parkingSpotId,
        transactionalEntityManager
      );

      if (parkingDuration === -1) {
        if (!parkingSpot.zone.dailyPassCost) {
          throw new Error('Daily parking is not available in this zone.');
        }
        parkingAmount = parkingSpot.zone.dailyPassCost;
      } else {
        const isExtension =
          todaysDuration >= (parkingSpot.zone.maxParkingDuration || 24 * 60);

        if (isExtension) {
          if (!parkingSpot.zone.maxExtensionDuration) {
            throw new Error('Parking extension is not available in this zone.');
          }

          if (
            todaysDuration + parkingDuration >
            (parkingSpot.zone.maxParkingDuration || 0) +
              parkingSpot.zone.maxExtensionDuration
          ) {
            throw new Error(
              `Maximum parking duration exceeded. You can extend for up to ${parkingSpot.zone.maxExtensionDuration} minutes.`
            );
          }

          parkingAmount =
            (parkingDuration / 60) * (parkingSpot.zone.extensionCost || 0);
        } else {
          if (
            parkingSpot.zone.maxParkingDuration &&
            todaysDuration + parkingDuration >
              parkingSpot.zone.maxParkingDuration
          ) {
            throw new Error(
              `Maximum parking duration exceeded. You can park for up to ${parkingSpot.zone.maxParkingDuration - todaysDuration} more minutes.`
            );
          }

          parkingAmount = (parkingDuration / 60) * parkingSpot.zone.baseCost;
        }
      }

      if (user.credit < parkingAmount) {
        throw new Error('Insufficient credit.');
      }

      await transactionalEntityManager.update(User, user.id, {
        credit: user.credit - parkingAmount,
      });

      const rental = new ParkingRental();
      rental.user = user;
      rental.car = car;
      rental.parkingSpot = parkingSpot;
      rental.minutes = parkingDuration === -1 ? 24 * 60 : parkingDuration;
      rental.totalCost = parkingAmount;
      rental.startTime = moment().utc().toDate();
      rental.endTime = moment().utc().add(rental.minutes, 'minutes').toDate();

      await transactionalEntityManager.save(ParkingRental, rental);
      await transactionalEntityManager.update(ParkingSpot, parkingSpot.id, {
        isOccupied: true,
      });
      await transactionalEntityManager.update(Car, car.id, { isParked: true });

      const newTransaction = new Transaction();
      newTransaction.user = user;
      newTransaction.transactionType = TransactionType.PARKING_RENTAL;
      newTransaction.amount = parkingAmount;
      await transactionalEntityManager.save(Transaction, newTransaction);

      licensePlate = car.licensePlate;
      rentalEndTime = moment(rental.endTime).format('lll');
    });

    // Sync with redis
    await redisClient.setEx(`user:${user.id}`, 3600, JSON.stringify(user));

    req.flash(
      'success',
      `Parking ticket purchased for ${licensePlate}. Cost: €${parkingAmount.toFixed(2)}. Valid until ${rentalEndTime}.`
    );
    return res.status(201).redirect('/map');
  } catch (error: unknown) {
    const err = error as Error;
    req.flash(
      'error',
      err.message || 'An error occurred while renting parking spot.'
    );

    if (err.message === 'Insufficient credit.') {
      return res.status(200).redirect('/client/payments');
    }

    return res.redirect('/map');
  }
};

const unparkSpot = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.user as User).id;
    const { spotId } = req.params;

    await MysqlDataSource.transaction(async transactionalEntityManager => {
      const rental = await transactionalEntityManager.findOne(ParkingRental, {
        where: {
          parkingSpotId: spotId,
          userId: userId,
          expired: false,
          endTime: MoreThanOrEqual(moment().utc().toDate()),
        },
        relations: ['car', 'parkingSpot'],
      });

      if (!rental) {
        throw new Error('Active parking rental not found.');
      }

      await transactionalEntityManager.update(ParkingRental, rental.id, {
        expired: true,
        endTime: moment().utc().toDate(),
      });

      await transactionalEntityManager.update(
        ParkingSpot,
        rental.parkingSpot.id,
        {
          isOccupied: false,
        }
      );

      await transactionalEntityManager.update(Car, rental.car.id, {
        isParked: false,
      });
    });

    req.flash('success', 'Parking session ended successfully.');
    return res.status(200).redirect('/map');
  } catch (error: unknown) {
    const err = error as Error;
    req.flash(
      'error',
      err.message || 'An error occurred while ending parking session.'
    );
    return res.redirect('/map');
  }
};

export default {
  getHome,
  getMap,
  rentParkingSpot,
  getNearbyParkingSpots,
  unparkSpot,
};
