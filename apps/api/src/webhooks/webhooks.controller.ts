import type { RawBodyRequest } from '@nestjs/common/interfaces/http/raw-body-request.interface';

import {
  BadRequestException,
  Controller,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { LiveKitWebhooksService } from './livekit-webhooks.service';
import { WebhooksService } from './webhooks.service';

@ApiTags('Webhooks')
@ApiResponse({ status: 400, description: 'Missing or invalid webhook body.' })
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly webhooks: WebhooksService,
    private readonly liveKitWebhooks: LiveKitWebhooksService,
  ) {}

  @Post('clerk')
  @ApiOperation({ summary: 'Receive Clerk webhook events' })
  async clerk(@Req() req: RawBodyRequest<Request>) {
    const raw = req.rawBody;
    if (!raw) {
      throw new BadRequestException('Missing raw body');
    }
    return this.webhooks.handle(raw.toString('utf8'), req.headers);
  }

  @Post('livekit')
  @ApiOperation({ summary: 'Receive LiveKit webhook events' })
  async livekit(@Req() req: RawBodyRequest<Request>) {
    const raw = req.rawBody;
    if (!raw) {
      throw new BadRequestException('Missing raw body');
    }
    return this.liveKitWebhooks.handle(raw.toString('utf8'), req.headers);
  }
}
