import { ProviderCredentialMode } from '@prisma/client';
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

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

export class BillingReportQueryDto {
  @IsOptional()
  @IsString()
  @Matches(YYYY_MM_DD, { message: 'dateFrom must be yyyy-MM-dd' })
  dateFrom?: string;

  @IsOptional()
  @IsString()
  @Matches(YYYY_MM_DD, { message: 'dateTo must be yyyy-MM-dd' })
  dateTo?: string;

  @IsOptional()
  @IsString()
  providerId?: string;

  @IsOptional()
  @IsEnum(ProviderCredentialMode)
  credentialMode?: ProviderCredentialMode;
}

export class BillingRecentCallsQueryDto extends BillingReportQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}