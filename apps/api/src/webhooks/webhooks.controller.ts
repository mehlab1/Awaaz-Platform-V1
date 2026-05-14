import type { RawBodyRequest } from '@nestjs/common/interfaces/http/raw-body-request.interface';

import {
  BadRequestException,
  Controller,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post('clerk')
  async clerk(@Req() req: RawBodyRequest<Request>) {
    const raw = req.rawBody;
    if (!raw) {
      throw new BadRequestException('Missing raw body');
    }
    return this.webhooks.handle(raw.toString('utf8'), req.headers);
  }
}
