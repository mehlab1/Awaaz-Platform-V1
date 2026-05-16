import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { CallDirection } from '@prisma/client';

export class StartCallDto {
  @IsString()
  liveKitRoomId!: string;

  @IsString()
  agentId!: string;

  @IsString()
  organizationId!: string;

  @IsEnum(CallDirection)
  direction!: CallDirection;

  @IsOptional()
  @IsString()
  fromNumber?: string;

  @IsOptional()
  @IsString()
  toNumber?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
