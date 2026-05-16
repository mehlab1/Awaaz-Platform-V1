import { IsObject, IsOptional, IsString } from 'class-validator';

export class EndCallDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
