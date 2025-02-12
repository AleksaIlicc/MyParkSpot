import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Car } from './Car';
import { ParkingRental } from './ParkingRental';
import { Transaction } from './Transaction';
import { ColumnDecimalTransformer } from '../utils/decimal.transformer';
import { UserRole } from '../enums/user-role.enum';
import { Fine } from './Fine';
import { Notification } from './Notification';

@Entity({
  name: 'users',
})
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'first_name', nullable: false, length: 20 })
  firstName: string;

  @Column({ name: 'last_name', nullable: false, length: 20 })
  lastName: string;

  @Column({ name: 'username', unique: true, nullable: false, length: 20 })
  username: string;

  @Column({ name: 'email', unique: true, nullable: false, length: 100 })
  email: string;

  @Column({ name: 'password', nullable: false, length: 100 })
  password: string;

  @Column({
    name: 'role',
    nullable: false,
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  @Column({
    name: 'credit',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    nullable: false,
    transformer: new ColumnDecimalTransformer(),
  })
  credit: number;

  @CreateDateColumn({
    name: 'registration_date',
    type: 'datetime',
    nullable: false,
  })
  registrationDate: Date;

  @Column({
    name: 'is_deleted',
    type: 'boolean',
    nullable: false,
    default: false,
  })
  isDeleted: boolean;

  // Relations

  @OneToMany(() => Car, car => car.user)
  cars: Car[];

  @OneToMany(() => ParkingRental, rental => rental.user)
  parkingRentals: ParkingRental[];

  @OneToMany(() => Transaction, transaction => transaction.user)
  transactions: Transaction[];

  @OneToMany(() => Fine, fine => fine.user)
  fines: Fine[];

  @OneToMany(() => Fine, fine => fine.issuedBy)
  issuedFines: Fine[];

  @OneToMany(() => Notification, notification => notification.user)
  notifications: Notification[];
}
