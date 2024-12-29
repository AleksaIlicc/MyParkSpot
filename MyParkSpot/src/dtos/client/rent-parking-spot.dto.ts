import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsPositive, IsString } from 'class-validator';

type minutes = number;

export class RentParkingSpotDto {
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @IsPositive()
  @IsNotEmpty({ message: 'Parking duration is required.' })
  public readonly parkingDuration: minutes;

  @Transform(({ value }) => parseInt(value, 10))
  @IsString()
  @IsNotEmpty({ message: 'Car ID is required.' })
  public readonly carId: string;

  @Transform(({ value }) => parseInt(value, 10))
  @IsString()
  @IsNotEmpty({ message: 'Parking spot ID is required.' })
  public readonly parkingSpotId: string;
}
