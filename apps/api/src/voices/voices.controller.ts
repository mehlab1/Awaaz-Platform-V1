import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request, Response } from 'express';

import { Roles } from '../common/roles.decorator';
import { ListVoicesQueryDto } from './dto/list-voices-query.dto';
import { VoicePreviewDto } from './dto/voice-preview.dto';
import { VoicesService } from './voices.service';

@Controller('api/v1/voices')
export class VoicesController {
  constructor(private readonly voices: VoicesService) {}

  @Get()
  @Roles(Role.VIEWER)
  list(@Req() req: Request, @Query() query: ListVoicesQueryDto) {
    return this.voices.list({
      organizationId: req.organizationId,
      providerId: query.providerId,
    });
  }

  @Post('sync')
  @Roles(Role.ADMIN)
  sync(@Req() req: Request) {
    void req.organizationId;
    return this.voices.sync();
  }

  @Post('preview')
  @HttpCode(200)
  @Roles(Role.VIEWER)
  async preview(
    @Req() req: Request,
    @Body() dto: VoicePreviewDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const audio = await this.voices.preview(dto.voiceId, req.organizationId);
    res.set({
      'Cache-Control': 'no-store',
      'Content-Length': audio.byteLength.toString(),
      'Content-Type': 'audio/wav',
    });
    return new StreamableFile(Buffer.from(audio));
  }
}
