import { Request, Response } from 'express';
import { FineSettings } from '../models/FineSettings';
import { MysqlDataSource } from '../config/data-source';
import { Car } from '../models/Car';
import { IssueFineDto } from '../dtos/parkingInspector/issue-fine.dto';
import { Fine } from '../models/Fine';
import moment from 'moment-timezone';
import { ParkingSpot } from '../models/ParkingSpot';
import { FineStatus } from '../enums/fine-status.enum';
import { User } from '../models/User';
import { Notification } from '../models/Notification';
import { NotificationType } from '../enums/notification-type.enum';
import { publisherClient } from '../config/redis';
import { ParkingRental } from '../models/ParkingRental';
import redisClient from '../config/redis';

const issueFine = async (
  req: Request<{}, {}, IssueFineDto>,
  res: Response
): Promise<void> => {
  try {
    const { licensePlate, parkingSpotId } = req.body;
    const user = req.user as User;

    await MysqlDataSource.transaction(async transactionalEntityManager => {
      const fineSettings = await transactionalEntityManager.find(FineSettings, {
        order: { createdAt: 'DESC' },
        take: 1,
      });
      const fineSetting = fineSettings[0];

      if (!fineSetting) {
        throw new Error('Fine settings are not configured.');
      }

      const car = await transactionalEntityManager.findOne(Car, {
        where: { licensePlate, isDeleted: false },
      });

      const fine = new Fine();
      fine.licensePlate = licensePlate;
      fine.amount = fineSetting.amount;
      fine.parkingSpotId = parkingSpotId;
      fine.issuedAt = moment().utc().toDate();
      fine.issuedById = user.id;

      if (car) {
        fine.userId = car.userId;
        fine.carId = car.id;

        const notification = new Notification();
        notification.userId = car.userId;
        notification.message = `A fine has been issued to your vehicle ${licensePlate}. Tap here to pay it.`;
        notification.type = NotificationType.FINE_ISSUED;
        notification.createdAt = moment().utc().toDate();
        notification.isRead = false;
        notification.parkingSpotId = parkingSpotId;

        await transactionalEntityManager.save(Notification, notification);

        const parkingRental: ParkingRental = new ParkingRental();
        parkingRental.userId = car.userId;
        parkingRental.carId = car.id;
        parkingRental.parkingSpotId = parkingSpotId;
        parkingRental.expired = false;
        parkingRental.minutes = 24 * 60;
        parkingRental.totalCost = fineSetting.amount;
        parkingRental.startTime = moment().utc().toDate();
        parkingRental.endTime = moment().add(24, 'hours').utc().toDate();

        await transactionalEntityManager.save(ParkingRental, parkingRental);

        await transactionalEntityManager.update(Car, car.id, {
          isParked: true,
        });

        await transactionalEntityManager.update(ParkingSpot, parkingSpotId, {
          isOccupied: true,
        });

        await publisherClient.publish(
          'notification',
          JSON.stringify({
            id: notification.id,
            userId: notification.userId,
            parkingSpotId: notification.parkingSpotId,
            message: notification.message,
            type: notification.type,
            createdAt: notification.createdAt,
          })
        );
      }

      await transactionalEntityManager.save(Fine, fine);
    });

    // Sync with Redis
    const parkingSpotsData = await redisClient.get('parkingSpots');
    const parkingSpots = JSON.parse(parkingSpotsData) as ParkingSpot[];
    const updatedParkingSpots = parkingSpots.map(s =>
      s.id === parkingSpotId ? { ...s, isOccupied: true } : s
    );
    await redisClient.set('parkingSpots', JSON.stringify(updatedParkingSpots));

    req.flash('success', 'Fine issued successfully');
    return res.status(200).redirect('/parking-inspector/fines');
  } catch (error) {
    req.flash(
      'error',
      error.message || 'An error occurred while issuing the fine'
    );
    return res.status(500).redirect('/parking-inspector/fines');
  }
};

const getFines = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user as User;
    const fines = await MysqlDataSource.getRepository(Fine).find({
      where: { issuedById: user.id },
      order: { issuedAt: 'DESC' },
      take: 3,
    });

    const parkingSpots = await MysqlDataSource.getRepository(ParkingSpot).find({
      where: { isDeleted: false },
      relations: ['zone'],
      order: { id: 'ASC' },
    });

    return res.status(200).render('pages/parking-inspector/fines', {
      fines,
      parkingSpots: JSON.stringify(parkingSpots),
    });
  } catch (error) {
    req.flash('error', 'An error occurred while loading the page');
    return res
      .status(200)
      .render('pages/parking-inspector/fines', { fines: [], parkingSpots: [] });
  }
};

const cancelIssuedFine = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const fine = await MysqlDataSource.getRepository(Fine).findOne({
      where: { id },
    });

    if (!fine) {
      req.flash('error', 'Fine not found');
      return res.status(404).redirect('/parking-inspector/fines');
    }

    await MysqlDataSource.getRepository(Fine).update(fine.id, {
      status: FineStatus.CANCELED,
    });

    req.flash('success', 'Fine canceled successfully');
    return res.status(200).redirect('/parking-inspector/fines');
  } catch (error) {
    req.flash('error', 'An error occurred while canceling the fine');
    return res.status(500).redirect('/parking-inspector/fines');
  }
};

export default { issueFine, getFines, cancelIssuedFine };
