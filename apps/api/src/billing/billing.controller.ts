import { Controller, ForbiddenException, Get, Query, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';

import { Roles } from '../common/roles.decorator';
import { BillingReportingService } from './billing-reporting.service';
import {
  BillingRecentCallsQueryDto,
  BillingReportQueryDto,
} from './dto/billing-report.query.dto';

function organizationIdFromRequest(req: Request): string {
  const organizationId = req.organizationId;
  if (!organizationId) {
    throw new ForbiddenException('Missing organization context');
  }
  return organizationId;
}

@Controller('api/v1/billing')
export class BillingController {
  constructor(private readonly billing: BillingReportingService) {}

  @Get('summary')
  @Roles(Role.VIEWER)
  summary(@Req() req: Request, @Query() query: BillingReportQueryDto) {
    return this.billing.summary(organizationIdFromRequest(req), query);
  }

  @Get('usage-breakdown')
  @Roles(Role.VIEWER)
  usageBreakdown(@Req() req: Request, @Query() query: BillingReportQueryDto) {
    return this.billing.usageBreakdown(organizationIdFromRequest(req), query);
  }

  @Get('provider-breakdown')
  @Roles(Role.VIEWER)
  providerBreakdown(@Req() req: Request, @Query() query: BillingReportQueryDto) {
    return this.billing.providerBreakdown(organizationIdFromRequest(req), query);
  }

  @Get('credential-mode-breakdown')
  @Roles(Role.VIEWER)
  credentialModeBreakdown(
    @Req() req: Request,
    @Query() query: BillingReportQueryDto,
  ) {
    return this.billing.credentialModeBreakdown(
      organizationIdFromRequest(req),
      query,
    );
  }

  @Get('agent-breakdown')
  @Roles(Role.VIEWER)
  agentBreakdown(@Req() req: Request, @Query() query: BillingReportQueryDto) {
    return this.billing.agentBreakdown(organizationIdFromRequest(req), query);
  }

  @Get('recent-calls')
  @Roles(Role.VIEWER)
  recentCalls(@Req() req: Request, @Query() query: BillingRecentCallsQueryDto) {
    return this.billing.recentCalls(organizationIdFromRequest(req), query);
  }
}
