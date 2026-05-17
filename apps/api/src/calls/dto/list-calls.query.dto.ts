import { CallDirection, CallStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

/** Query string for `/api/v1/calls` with filters & pagination */
export class ListCallsQueryDto {
  @IsOptional()
  @IsString()
  agentId?: string;

  @IsOptional()
  @IsEnum(CallDirection)
  direction?: CallDirection;

  @IsOptional()
  @IsEnum(CallStatus)
  status?: CallStatus;

  /** Inclusive start (UTC midnight) — `yyyy-MM-dd` */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateFrom must be yyyy-MM-dd' })
  dateFrom?: string;

  /** Inclusive end (UTC end of day) — `yyyy-MM-dd` */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateTo must be yyyy-MM-dd' })
  dateTo?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  /** Fixed at 20 in product spec; capped for safety */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
