import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Role } from '@prisma/client';

import { Roles } from '../common/roles.decorator';
import { AgentsService } from './agents.service';
import { CreateAgentVersionDto } from './dto/create-agent-version.dto';
import { CreateAgentDto } from './dto/create-agent.dto';
import { PatchAgentDto } from './dto/patch-agent.dto';

function organizationIdFromRequest(req: Request): string {
  const organizationId = (req as any).organizationId;
  if (!organizationId) {
    throw new ForbiddenException('Missing organization context');
  }
  return organizationId;
}


function parsePositiveLimit(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new BadRequestException('limit must be a positive integer');
  }
  return Math.min(parsed, 100);
}

@ApiTags('Agents')
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
@Controller('api/v1/agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get()
  @ApiOperation({ summary: 'List agents' })
  @Roles(Role.VIEWER)
  list(@Req() req: Request) {
    return this.agents.list(organizationIdFromRequest(req));
  }

  @Post()
  @ApiOperation({ summary: 'Create an agent' })
  @Roles(Role.BUILDER)
  create(@Req() req: Request, @Body() dto: CreateAgentDto) {
    return this.agents.create(
      organizationIdFromRequest(req),
      (req as any).user!.id,
      dto,
    );
  }

  @Post(':id/test-call')
  @ApiOperation({ summary: 'Start a browser test call for an agent' })
  @Roles(Role.BUILDER)
  browserTestCall(@Req() req: Request, @Param('id') id: string) {
    return this.agents.createBrowserTestCall(
      organizationIdFromRequest(req),
      id,
    );
  }

  @Post(':id/test-call/:callId/end')
  @ApiOperation({ summary: 'End a browser test call' })
  @Roles(Role.BUILDER)
  endBrowserTestCall(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('callId') callId: string,
  ) {
    return this.agents.endBrowserTestCall(
      organizationIdFromRequest(req),
      id,
      callId,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get agent details' })
  @Roles(Role.VIEWER)
  get(@Req() req: Request, @Param('id') id: string) {
    return this.agents.get(organizationIdFromRequest(req), id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an agent' })
  @Roles(Role.BUILDER)
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: PatchAgentDto,
  ) {
    return this.agents.update(
      organizationIdFromRequest(req),
      (req as any).user!.id,
      id,
      dto,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an agent' })
  @Roles(Role.ADMIN)
  delete(@Req() req: Request, @Param('id') id: string) {
    return this.agents.delete(organizationIdFromRequest(req), id);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'List agent versions' })
  @Roles(Role.VIEWER)
  listVersions(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.agents.listVersions(
      organizationIdFromRequest(req),
      id,
      { limit: parsePositiveLimit(limit) },
    );
  }

  @Post(':id/versions')
  @ApiOperation({ summary: 'Create an agent version' })
  @Roles(Role.BUILDER)
  createVersion(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: CreateAgentVersionDto,
  ) {
    return this.agents.createVersion(
      organizationIdFromRequest(req),
      (req as any).user!.id,
      id,
      dto,
    );
  }

  @Patch(':id/versions/:versionId')
  @ApiOperation({ summary: 'Update an agent version' })
  @Roles(Role.BUILDER)
  updateVersion(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Body() dto: CreateAgentVersionDto,
  ) {
    return this.agents.updateVersion(
      organizationIdFromRequest(req),
      (req as any).user!.id,
      id,
      versionId,
      dto,
    );
  }

  @Post(':id/versions/:versionId/publish')
  @ApiOperation({ summary: 'Publish an agent version' })
  @Roles(Role.BUILDER)
  publishVersion(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    return this.agents.publishVersion(
      organizationIdFromRequest(req),
      (req as any).user!.id,
      id,
      versionId,
    );
  }

  @Post(':id/versions/:versionId/restore')
  @ApiOperation({ summary: 'Restore an agent version' })
  @Roles(Role.BUILDER)
  restoreVersion(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    return this.agents.restoreVersion(
      organizationIdFromRequest(req),
      id,
      versionId,
    );
  }
}
