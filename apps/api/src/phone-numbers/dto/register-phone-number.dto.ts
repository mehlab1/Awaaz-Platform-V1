import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class RegisterPhoneNumberDto {
  @ApiProperty({ example: '+15551234567', description: 'E.164 phone number.' })
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/)
  number!: string;

  @ApiPropertyOptional({ example: 'Main support line', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  friendlyName?: string;

  @ApiPropertyOptional({ example: 'PNXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  twilioSid?: string;
}
