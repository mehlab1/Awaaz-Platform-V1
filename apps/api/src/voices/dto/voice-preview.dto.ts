import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class VoicePreviewDto {
  @ApiProperty({ example: 'rime-marsh', maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  voiceId!: string;
}
