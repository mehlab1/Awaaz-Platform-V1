import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ProviderCredentialMode } from '@prisma/client';

export class CreateAgentVersionDto {
  @IsString()
  @MinLength(1)
  systemPrompt!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  voiceId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  model?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  llmProviderId?: string;

  @IsOptional()
  @IsEnum(ProviderCredentialMode)
  llmCredentialMode?: ProviderCredentialMode;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  sttProviderId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  sttModel?: string;

  @IsOptional()
  @IsEnum(ProviderCredentialMode)
  sttCredentialMode?: ProviderCredentialMode;

  @IsOptional()
  @IsEnum(ProviderCredentialMode)
  ttsCredentialMode?: ProviderCredentialMode;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8192)
  maxTokens?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  firstMessage?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  endCallPhrases?: string[];
}
