import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  RelationId,
} from 'typeorm';
import { User } from './User';
import { ParkingRental } from './ParkingRental';

@Entity({
  name: 'cars',
})
export class Car {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'license_plate', nullable: false, unique: true, length: 15 })
  licensePlate: string;

  @Column({ name: 'manufacturer', nullable: true, length: 50 })
  manufacturer: string;

  @Column({ name: 'model', nullable: true, length: 50 })
  model: string;

  @Column({ name: 'year', nullable: true })
  year: number;

  @Column({ name: 'is_parked', nullable: false, default: false })
  isParked: boolean;

  // Relation Ids

  @RelationId((car: Car) => car.user)
  userId: string;

  // Relations

  @ManyToOne(() => User, user => user.cars, {
    nullable: false,
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'user_id',
  })
  user: User;

  @OneToMany(() => ParkingRental, rental => rental.car)
  parkingRentals: ParkingRental[];
}
