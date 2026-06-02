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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProviderCredentialMode } from '@prisma/client';

export class CreateAgentVersionDto {
  @ApiProperty({
    example: 'You are a helpful voice agent for inbound customer calls.',
  })
  @IsString()
  @MinLength(1)
  systemPrompt!: string;

  @ApiProperty({ example: 'rime-marsh', maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  voiceId!: string;

  @ApiPropertyOptional({ example: 'gpt-4o-mini', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  model?: string;

  @ApiPropertyOptional({ example: 'openai', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  llmProviderId?: string;

  @ApiPropertyOptional({ enum: ProviderCredentialMode })
  @IsOptional()
  @IsEnum(ProviderCredentialMode)
  llmCredentialMode?: ProviderCredentialMode;

  @ApiPropertyOptional({ example: 'deepgram', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  sttProviderId?: string;

  @ApiPropertyOptional({ example: 'nova-3', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  sttModel?: string;

  @ApiPropertyOptional({ enum: ProviderCredentialMode })
  @IsOptional()
  @IsEnum(ProviderCredentialMode)
  sttCredentialMode?: ProviderCredentialMode;

  @ApiPropertyOptional({ enum: ProviderCredentialMode })
  @IsOptional()
  @IsEnum(ProviderCredentialMode)
  ttsCredentialMode?: ProviderCredentialMode;

  @ApiPropertyOptional({ example: 0.7, minimum: 0, maximum: 2 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiPropertyOptional({ example: 1024, minimum: 1, maximum: 8192 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8192)
  maxTokens?: number;

  @ApiPropertyOptional({
    example: 'Hi, thanks for calling. How can I help?',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  firstMessage?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['goodbye', 'end call'],
    maxItems: 20,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  endCallPhrases?: string[];
}
