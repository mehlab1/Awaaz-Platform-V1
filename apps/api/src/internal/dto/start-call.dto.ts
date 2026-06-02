import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CallDirection } from '@prisma/client';

export class StartCallDto {
  @ApiPropertyOptional({ example: 'call_123' })
  @IsOptional()
  @IsString()
  callId?: string;

  @ApiProperty({ example: 'room_123' })
  @IsString()
  liveKitRoomId!: string;

  @ApiPropertyOptional({ example: 'support-room-123' })
  @IsOptional()
  @IsString()
  liveKitRoomName?: string;

  @ApiProperty({ example: 'agent_123' })
  @IsString()
  agentId!: string;

  @ApiProperty({ example: 'org_123' })
  @IsString()
  organizationId!: string;

  @ApiProperty({ enum: CallDirection })
  @IsEnum(CallDirection)
  direction!: CallDirection;

  @ApiPropertyOptional({ example: '+15551234567' })
  @IsOptional()
  @IsString()
  fromNumber?: string;

  @ApiPropertyOptional({ example: '+15557654321' })
  @IsOptional()
  @IsString()
  toNumber?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
