import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class RegisterPhoneNumberDto {
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/)
  number!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  friendlyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  twilioSid?: string;
}
