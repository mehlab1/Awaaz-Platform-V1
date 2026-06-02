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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProviderCredentialMode } from '@prisma/client';

export class UpsertProviderCredentialDto {
  @ApiProperty({ enum: ProviderCredentialMode })
  @IsEnum(ProviderCredentialMode)
  credentialMode!: ProviderCredentialMode;

  @ApiPropertyOptional({
    example: 'sk_provider_secret',
    maxLength: 10000,
    description: 'Provider API key when using customer-managed credentials.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  apiKey?: string;

  @ApiPropertyOptional({ example: 500, minimum: 0, maximum: 10000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  markupBps?: number;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
