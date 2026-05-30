import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ProviderCredentialMode } from '@prisma/client';

export class UpsertProviderCredentialDto {
  @IsEnum(ProviderCredentialMode)
  credentialMode!: ProviderCredentialMode;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  apiKey?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  markupBps?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
