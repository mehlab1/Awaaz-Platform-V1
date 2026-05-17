import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class PatchAgentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
