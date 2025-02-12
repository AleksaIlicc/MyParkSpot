import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './User';
import { ParkingSpot } from './ParkingSpot';
import { Car } from './Car';
import { ColumnDecimalTransformer } from '../utils/decimal.transformer';

@Entity({ name: 'parking_rentals' })
export class ParkingRental {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'minutes', nullable: false })
  minutes: number;

  @Column({ name: 'start_time', nullable: false, type: 'datetime' })
  startTime: Date;

  @Column({ name: 'end_time', nullable: false, type: 'datetime' })
  endTime: Date;

  @Column({ name: 'expired', nullable: false, default: false })
  expired: boolean;

  // Relation Ids

  @Column({ name: 'user_id', nullable: false })
  userId: string;

  @Column({ name: 'parking_spot_id', nullable: false })
  parkingSpotId: string;

  @Column({ name: 'car_id', nullable: false })
  carId: string;

  @Column({
    name: 'total_cost',
    nullable: false,
    type: 'decimal',
    precision: 7,
    scale: 2,
    transformer: new ColumnDecimalTransformer(),
  })
  totalCost: number;

  // Relations

  @ManyToOne(() => User, user => user.parkingRentals, {
    nullable: false,
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => ParkingSpot, parkingSpot => parkingSpot.parkingRentals, {
    nullable: false,
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'parking_spot_id' })
  parkingSpot: ParkingSpot;

  @ManyToOne(() => Car, car => car.parkingRentals, {
    nullable: false,
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'car_id' })
  car: Car;
}
