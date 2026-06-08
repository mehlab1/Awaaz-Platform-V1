import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
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

const PROVIDER_KEY_SOURCES = [
  'finova_managed',
  'org_default',
  'agent_own',
] as const;

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

  @ApiPropertyOptional({ enum: PROVIDER_KEY_SOURCES })
  @IsOptional()
  @IsIn(PROVIDER_KEY_SOURCES)
  llmKeySource?: string;

  @ApiPropertyOptional({
    example: 'sk_provider_secret',
    maxLength: 10000,
    description: 'Write-only agent-owned LLM key when llmKeySource is agent_own.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  llmAgentKey?: string;

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

  @ApiPropertyOptional({ enum: PROVIDER_KEY_SOURCES })
  @IsOptional()
  @IsIn(PROVIDER_KEY_SOURCES)
  sttKeySource?: string;

  @ApiPropertyOptional({
    example: 'sk_provider_secret',
    maxLength: 10000,
    description: 'Write-only agent-owned STT key when sttKeySource is agent_own.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  sttAgentKey?: string;

  @ApiPropertyOptional({ enum: ProviderCredentialMode })
  @IsOptional()
  @IsEnum(ProviderCredentialMode)
  ttsCredentialMode?: ProviderCredentialMode;

  @ApiPropertyOptional({ enum: PROVIDER_KEY_SOURCES })
  @IsOptional()
  @IsIn(PROVIDER_KEY_SOURCES)
  ttsKeySource?: string;

  @ApiPropertyOptional({
    example: 'sk_provider_secret',
    maxLength: 10000,
    description: 'Write-only agent-owned TTS key when ttsKeySource is agent_own.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  ttsAgentKey?: string;

  @ApiPropertyOptional({ example: 'rime', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  fallbackTtsProviderId?: string;

  @ApiPropertyOptional({ example: 'rime-marsh', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fallbackTtsVoiceId?: string;

  @ApiPropertyOptional({ example: 'v1', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  fallbackTtsModel?: string;

  @ApiPropertyOptional({ enum: ProviderCredentialMode })
  @IsOptional()
  @IsEnum(ProviderCredentialMode)
  fallbackTtsCredentialMode?: ProviderCredentialMode;

  @ApiPropertyOptional({ enum: PROVIDER_KEY_SOURCES })
  @IsOptional()
  @IsIn(PROVIDER_KEY_SOURCES)
  fallbackTtsKeySource?: string;

  @ApiPropertyOptional({
    example: 'sk_provider_secret',
    maxLength: 10000,
    description: 'Write-only agent-owned TTS key when fallbackTtsKeySource is agent_own.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  fallbackTtsAgentKey?: string;

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
