import {
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventType } from '@prisma/client';

export class CallEventDto {
  @ApiProperty({ enum: EventType })
  @IsEnum(EventType)
  eventType!: EventType;

  @ApiPropertyOptional({ example: 'Hello, how can I help?' })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional({ example: 'agent' })
  @IsOptional()
  @IsString()
  speaker?: string;

  @ApiPropertyOptional({ example: '2026-06-02T10:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @ApiPropertyOptional({ example: '2026-06-02T10:00:03.000Z' })
  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @ApiPropertyOptional({ example: 3000, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  durationMs?: number;

  @ApiPropertyOptional({ example: 180, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  latencyMs?: number;

  @ApiPropertyOptional({ example: 120, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  tokenCount?: number;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
