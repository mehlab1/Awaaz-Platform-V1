import { Controller, ForbiddenException, Get, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';

import { Roles } from '../common/roles.decorator';
import { AnalyticsService } from './analytics.service';

function organizationIdFromRequest(req: Request): string {
  const organizationId = (req as any).organizationId;
  if (!organizationId) {
    throw new ForbiddenException('Missing organization context');
  }
  return organizationId;
}


@Controller('api/v1/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) { }

  @Get('overview')
  @Roles(Role.VIEWER)
  overview(@Req() req: Request): Promise<unknown> {
    return this.analytics.overview(organizationIdFromRequest(req));
  }

  @Get('calls-trend')
  @Roles(Role.VIEWER)
  callsTrend(@Req() req: Request): Promise<unknown> {
    return this.analytics.callsTrend(organizationIdFromRequest(req));
  }

  @Get('costs')
  @Roles(Role.VIEWER)
  costs(@Req() req: Request): Promise<unknown> {
    return this.analytics.costs(organizationIdFromRequest(req));
  }

  @Get('latency')
  @Roles(Role.VIEWER)
  latency(@Req() req: Request): Promise<unknown> {
    return this.analytics.latency(organizationIdFromRequest(req));
  }

  @Get('agents')
  @Roles(Role.VIEWER)
  agents(@Req() req: Request): Promise<unknown> {
    return this.analytics.agents(organizationIdFromRequest(req));
  }

  @Get('live')
  @Roles(Role.VIEWER)
  live(@Req() req: Request): Promise<unknown> {
    return this.analytics.live(organizationIdFromRequest(req));
  }
}
