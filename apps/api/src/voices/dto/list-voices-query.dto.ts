import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ListVoicesQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  providerId?: string;
}
