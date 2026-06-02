import { Controller, ForbiddenException, Get, Query, Req } from '@nestjs/common';
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

@ApiTags('Billing')
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
@Controller('api/v1/billing')
export class BillingController {
  constructor(private readonly billing: BillingReportingService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get billing summary' })
  @Roles(Role.VIEWER)
  summary(@Req() req: Request, @Query() query: BillingReportQueryDto) {
    return this.billing.summary(organizationIdFromRequest(req), query);
  }

  @Get('usage-breakdown')
  @ApiOperation({ summary: 'Get billing usage breakdown' })
  @Roles(Role.VIEWER)
  usageBreakdown(@Req() req: Request, @Query() query: BillingReportQueryDto) {
    return this.billing.usageBreakdown(organizationIdFromRequest(req), query);
  }

  @Get('provider-breakdown')
  @ApiOperation({ summary: 'Get provider cost breakdown' })
  @Roles(Role.VIEWER)
  providerBreakdown(@Req() req: Request, @Query() query: BillingReportQueryDto) {
    return this.billing.providerBreakdown(organizationIdFromRequest(req), query);
  }

  @Get('credential-mode-breakdown')
  @ApiOperation({ summary: 'Get credential mode cost breakdown' })
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

  @Get('pipeline-component-breakdown')
  @ApiOperation({ summary: 'Get pipeline component cost breakdown' })
  @Roles(Role.VIEWER)
  pipelineComponentBreakdown(
    @Req() req: Request,
    @Query() query: BillingReportQueryDto,
  ) {
    return this.billing.pipelineComponentBreakdown(
      organizationIdFromRequest(req),
      query,
    );
  }

  @Get('agent-breakdown')
  @ApiOperation({ summary: 'Get agent cost breakdown' })
  @Roles(Role.VIEWER)
  agentBreakdown(@Req() req: Request, @Query() query: BillingReportQueryDto) {
    return this.billing.agentBreakdown(organizationIdFromRequest(req), query);
  }

  @Get('recent-calls')
  @ApiOperation({ summary: 'List recent billable calls' })
  @Roles(Role.VIEWER)
  recentCalls(@Req() req: Request, @Query() query: BillingRecentCallsQueryDto) {
    return this.billing.recentCalls(organizationIdFromRequest(req), query);
  }
}
