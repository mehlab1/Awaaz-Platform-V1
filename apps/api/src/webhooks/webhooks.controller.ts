import type { RawBodyRequest } from '@nestjs/common/interfaces/http/raw-body-request.interface';

import {
  BadRequestException,
  Controller,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { LiveKitWebhooksService } from './livekit-webhooks.service';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly webhooks: WebhooksService,
    private readonly liveKitWebhooks: LiveKitWebhooksService,
  ) {}

  @Post('clerk')
  async clerk(@Req() req: RawBodyRequest<Request>) {
    const raw = req.rawBody;
    if (!raw) {
      throw new BadRequestException('Missing raw body');
    }
    return this.webhooks.handle(raw.toString('utf8'), req.headers);
  }

  @Post('livekit')
  async livekit(@Req() req: RawBodyRequest<Request>) {
    const raw = req.rawBody;
    if (!raw) {
      throw new BadRequestException('Missing raw body');
    }
    return this.liveKitWebhooks.handle(raw.toString('utf8'), req.headers);
  }
}
