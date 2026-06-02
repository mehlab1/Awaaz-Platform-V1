import { Controller, ForbiddenException, Get, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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


@ApiTags('Analytics')
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
@Controller('api/v1/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) { }

  @Get('overview')
  @ApiOperation({ summary: 'Get analytics overview' })
  @Roles(Role.VIEWER)
  overview(@Req() req: Request): Promise<unknown> {
    return this.analytics.overview(organizationIdFromRequest(req));
  }

  @Get('calls-trend')
  @ApiOperation({ summary: 'Get calls trend analytics' })
  @Roles(Role.VIEWER)
  callsTrend(@Req() req: Request): Promise<unknown> {
    return this.analytics.callsTrend(organizationIdFromRequest(req));
  }

  @Get('costs')
  @ApiOperation({ summary: 'Get cost analytics' })
  @Roles(Role.VIEWER)
  costs(@Req() req: Request): Promise<unknown> {
    return this.analytics.costs(organizationIdFromRequest(req));
  }

  @Get('latency')
  @ApiOperation({ summary: 'Get latency analytics' })
  @Roles(Role.VIEWER)
  latency(@Req() req: Request): Promise<unknown> {
    return this.analytics.latency(organizationIdFromRequest(req));
  }

  @Get('agents')
  @ApiOperation({ summary: 'Get agent analytics' })
  @Roles(Role.VIEWER)
  agents(@Req() req: Request): Promise<unknown> {
    return this.analytics.agents(organizationIdFromRequest(req));
  }

  @Get('live')
  @ApiOperation({ summary: 'Get live analytics' })
  @Roles(Role.VIEWER)
  live(@Req() req: Request): Promise<unknown> {
    return this.analytics.live(organizationIdFromRequest(req));
  }
}
