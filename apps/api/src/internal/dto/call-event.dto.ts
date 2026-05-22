import {
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { EventType } from '@prisma/client';

export class CallEventDto {
  @IsEnum(EventType)
  eventType!: EventType;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  speaker?: string;

  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationMs?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  latencyMs?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  tokenCount?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
