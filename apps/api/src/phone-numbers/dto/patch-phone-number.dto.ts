import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class PatchPhoneNumberDto {
  @ApiPropertyOptional({ example: 'agent_123', nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  agentId?: string | null;

  @ApiPropertyOptional({
    example: 'Main support line',
    maxLength: 200,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  friendlyName?: string | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
