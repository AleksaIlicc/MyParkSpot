import 'reflect-metadata';
import { DataSource } from 'typeorm';

export const MysqlDataSource = new DataSource({
  type: 'mysql',
  host: process.env.MYSQL_HOST,
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  username: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  synchronize: true,
  timezone: 'Z',
  logging: false,
  entities: [__dirname + '/../models/*.ts'],
});
