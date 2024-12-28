import { Request, Response } from 'express';
import redisClient from '../config/redis';
import { MysqlDataSource } from '../config/data-source';
import { ParkingSpot } from '../models/ParkingSpot';
import { User } from '../models/User';
import { Car } from '../models/Car';
import { ParkingRental } from '../models/ParkingRental';
import { GeoReplyWith } from 'redis';
import { In } from 'typeorm';
import { Transaction } from '../models/Transaction';
import { TransactionType } from '../enums/transaction-type.enum';
import moment from 'moment-timezone';

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

const getMap = async (req: Request, res: Response): Promise<void> => {
  const user = req.user as User;

  const parkingSpots = await MysqlDataSource.getRepository(ParkingSpot).find();
  syncParkingSpotsToRedis(parkingSpots);

  let cars: Car[] = [];

  if (user) {
    cars = await MysqlDataSource.getRepository(Car).find({
      where: { user: { id: user.id } },
    });
  }

  return res.render('map', {
    parkingSpots: JSON.stringify(parkingSpots),
    cars,
  });
};

const getNearbyParkingSpots = async (
  req: Request,
  res: Response
): Promise<void> => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  const radius = parseFloat(req.query.radius as string);

  const spots = await redisClient.geoSearchWith(
    'parkingSpots',
    { longitude: lng, latitude: lat },
    { radius: radius, unit: 'km' },
    [GeoReplyWith.COORDINATES]
  );

  const parkingSpots = await MysqlDataSource.getRepository(ParkingSpot).findBy({
    id: In(spots.map(spot => spot.member)),
  });
  res.json(parkingSpots);
};

const rentParkingSpot = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user as User;
    const { parkingDuration, carId, parkingSpotId } = req.body;

    if (!parkingSpotId) {
      req.flash('error', 'Parking spot not found.');
      return res.status(400).redirect('/map');
    }

    if (!carId) {
      req.flash('error', 'Car not found.');
      return res.status(400).redirect('/map');
    }

    const hoursNumber = parseInt(parkingDuration, 10);
    if (isNaN(hoursNumber) || hoursNumber < 1) {
      req.flash('error', 'Please enter a valid number of hours.');
      return res.status(400).redirect('/map');
    }

    await MysqlDataSource.transaction(async transactionalEntityManager => {
      const car = await transactionalEntityManager.findOne(Car, {
        where: { id: carId, user: { id: user.id } },
      });

      if (!car) {
        throw new Error('Car not found.');
      }

      car.isParked = true;
      await transactionalEntityManager.save(Car, car);

      const parkingSpot = await transactionalEntityManager.findOne(
        ParkingSpot,
        {
          where: { id: parkingSpotId, isOccupied: false },
        }
      );

      if (!parkingSpot) {
        throw new Error('Parking spot not available.');
      }

      const amount = parkingSpot.price * hoursNumber;

      if (user.credit < amount) {
        throw new Error('Insufficient credit.');
      }

      user.credit -= amount;
      await transactionalEntityManager.save(User, user);

      const rental = new ParkingRental();
      rental.user = user;
      rental.car = car;
      rental.parkingSpot = parkingSpot;
      rental.minutes = hoursNumber;
      rental.startTime = moment().utc().toDate();
      rental.endTime = moment().utc().add(rental.minutes, 'minutes').toDate();

      await transactionalEntityManager.save(ParkingRental, rental);

      parkingSpot.isOccupied = true;
      await transactionalEntityManager.save(ParkingSpot, parkingSpot);

      const newTransaction = new Transaction();
      newTransaction.userId = user.id;
      newTransaction.transactionType = TransactionType.PARKING_RENTAL;
      newTransaction.amount = amount;
      await transactionalEntityManager.save(Transaction, newTransaction);
    });

    // Sync with redis
    const userData = await redisClient.get(`user:${user.id}`);
    if (userData) {
      const tmpUser = JSON.parse(userData) as User;

      tmpUser.credit = user.credit;

      await redisClient.setEx(`user:${user.id}`, 3600, JSON.stringify(tmpUser));
    }

    req.flash('success', 'Parking spot rented successfully.');
    return res.status(201).redirect('/map');
  } catch (error: unknown) {
    const err = error as Error;

    if (err.message === 'Insufficient credit.') {
      req.flash('error', 'Insufficient credit.');
      return res.status(200).redirect('/client/payments');
    }

    req.flash('error', 'An error occurred while renting parking spot.');
    return res.status(500).redirect('/map');
  }
};

export default {
  getHome,
  getMap,
  rentParkingSpot,
  getNearbyParkingSpots,
};
