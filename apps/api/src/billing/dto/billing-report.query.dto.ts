import { ProviderCredentialMode } from '@prisma/client';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiPropertyOptional({
    example: '2026-06-01',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  })
  @IsOptional()
  @IsString()
  @Matches(YYYY_MM_DD, { message: 'dateFrom must be yyyy-MM-dd' })
  dateFrom?: string;

  @ApiPropertyOptional({
    example: '2026-06-30',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  })
  @IsOptional()
  @IsString()
  @Matches(YYYY_MM_DD, { message: 'dateTo must be yyyy-MM-dd' })
  dateTo?: string;

  @ApiPropertyOptional({ example: 'openai' })
  @IsOptional()
  @IsString()
  providerId?: string;

  @ApiPropertyOptional({ enum: ProviderCredentialMode })
  @IsOptional()
  @IsEnum(ProviderCredentialMode)
  credentialMode?: ProviderCredentialMode;
}

export class BillingRecentCallsQueryDto extends BillingReportQueryDto {
  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
