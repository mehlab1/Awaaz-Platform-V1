import {
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
