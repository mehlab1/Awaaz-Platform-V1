import { Controller, Get, Post, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';

import { Roles } from '../common/roles.decorator';
import { VoicesService } from './voices.service';

@Controller('api/v1/voices')
export class VoicesController {
  constructor(private readonly voices: VoicesService) {}

  @Get()
  @Roles(Role.VIEWER)
  list(@Req() req: Request) {
    void req.organizationId;
    return this.voices.list();
  }

  @Post('sync')
  @Roles(Role.ADMIN)
  sync(@Req() req: Request) {
    void req.organizationId;
    return this.voices.sync();
  }
}
