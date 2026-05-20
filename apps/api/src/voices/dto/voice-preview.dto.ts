import { IsString, MaxLength, MinLength } from 'class-validator';

export class VoicePreviewDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  voiceId!: string;
}
