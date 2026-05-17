import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';

import { Roles } from '../common/roles.decorator';
import { CallsService } from './calls.service';
import { ListCallsQueryDto } from './dto/list-calls.query.dto';

function organizationIdFromRequest(req: Request): string {
  const organizationId = req.organizationId;
  if (!organizationId) {
    throw new ForbiddenException('Missing organization context');
  }
  return organizationId;
}

@Controller('api/v1/calls')
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Get()
  @Roles(Role.VIEWER)
  list(@Req() req: Request, @Query() query: ListCallsQueryDto) {
    return this.calls.listPaged(organizationIdFromRequest(req), query);
  }

  @Get(':id/recording')
  @Roles(Role.VIEWER)
  recordingPlayback(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    return this.calls.getRecordingPlaybackUrl(
      organizationIdFromRequest(req),
      id,
    );
  }

  @Get(':id')
  @Roles(Role.VIEWER)
  detail(@Req() req: Request, @Param('id') id: string) {
    return this.calls.getDetailWithRelations(
      organizationIdFromRequest(req),
      id,
    );
  }
}
