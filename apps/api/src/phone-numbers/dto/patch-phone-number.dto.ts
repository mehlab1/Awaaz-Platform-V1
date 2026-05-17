import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class PatchPhoneNumberDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  agentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  friendlyName?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
