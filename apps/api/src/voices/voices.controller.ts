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
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Request, Response } from 'express';

import { Roles } from '../common/roles.decorator';
import { ListVoicesQueryDto } from './dto/list-voices-query.dto';
import { VoicePreviewDto } from './dto/voice-preview.dto';
import { VoicesService } from './voices.service';


function organizationIdFromRequest(req: Request): string {
  const organizationId = (req as any).organizationId;
  if (!organizationId) {
    throw new ForbiddenException('Missing organization context');
  }
  return organizationId;
}

@ApiTags('Voices')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-organization-id',
  required: true,
  description: 'Organization ID used to scope tenant requests.',
})
@ApiResponse({ status: 401, description: 'Missing or invalid bearer token.' })
@ApiResponse({
  status: 403,
  description: 'Missing organization access or insufficient role.',
})
@Controller('api/v1/voices')
export class VoicesController {
  constructor(private readonly voices: VoicesService) {}

  @Get()
  @ApiOperation({ summary: 'List available voices' })
  @Roles(Role.VIEWER)
  list(@Req() req: Request, @Query() query: ListVoicesQueryDto) {
    return this.voices.list({
      organizationId: organizationIdFromRequest(req),
      providerId: query.providerId,
    });
  }

  @Post('sync')
  @ApiOperation({ summary: 'Sync provider voices' })
  @Roles(Role.ADMIN)
  sync(@Req() req: Request, @Query() query: ListVoicesQueryDto) {
    return this.voices.sync({
      organizationId: organizationIdFromRequest(req),
      providerId: query.providerId,
    });
  }

  @Post('preview')
  @HttpCode(200)
  @ApiOperation({ summary: 'Generate a voice preview' })
  @Roles(Role.VIEWER)
  async preview(
    @Req() req: Request,
    @Body() dto: VoicePreviewDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const preview = await this.voices.preview(dto.voiceId, organizationIdFromRequest(req));
    res.set({
      'Cache-Control': 'no-store',
      'Content-Length': preview.audio.byteLength.toString(),
      'Content-Type': preview.contentType,
    });
    return new StreamableFile(Buffer.from(preview.audio));
  }
}
