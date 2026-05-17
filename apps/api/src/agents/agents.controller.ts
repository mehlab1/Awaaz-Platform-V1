import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';

import { Roles } from '../common/roles.decorator';
import { AgentsService } from './agents.service';
import { CreateAgentVersionDto } from './dto/create-agent-version.dto';
import { CreateAgentDto } from './dto/create-agent.dto';
import { PatchAgentDto } from './dto/patch-agent.dto';

function organizationIdFromRequest(req: Request): string {
  const organizationId = req.organizationId;
  if (!organizationId) {
    throw new ForbiddenException('Missing organization context');
  }
  return organizationId;
}

@Controller('api/v1/agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get()
  @Roles(Role.VIEWER)
  list(@Req() req: Request) {
    return this.agents.list(organizationIdFromRequest(req));
  }

  @Post()
  @Roles(Role.BUILDER)
  create(@Req() req: Request, @Body() dto: CreateAgentDto) {
    return this.agents.create(organizationIdFromRequest(req), dto);
  }

  @Post(':id/test-call')
  @Roles(Role.BUILDER)
  browserTestCall(@Req() req: Request, @Param('id') id: string) {
    return this.agents.createBrowserTestCall(
      organizationIdFromRequest(req),
      id,
    );
  }

  @Get(':id')
  @Roles(Role.VIEWER)
  get(@Req() req: Request, @Param('id') id: string) {
    return this.agents.get(organizationIdFromRequest(req), id);
  }

  @Patch(':id')
  @Roles(Role.BUILDER)
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: PatchAgentDto,
  ) {
    return this.agents.update(organizationIdFromRequest(req), id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  delete(@Req() req: Request, @Param('id') id: string) {
    return this.agents.delete(organizationIdFromRequest(req), id);
  }

  @Get(':id/versions')
  @Roles(Role.VIEWER)
  listVersions(@Req() req: Request, @Param('id') id: string) {
    return this.agents.listVersions(organizationIdFromRequest(req), id);
  }

  @Post(':id/versions')
  @Roles(Role.BUILDER)
  createVersion(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: CreateAgentVersionDto,
  ) {
    return this.agents.createVersion(organizationIdFromRequest(req), id, dto);
  }

  @Post(':id/versions/:versionId/publish')
  @Roles(Role.BUILDER)
  publishVersion(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    return this.agents.publishVersion(
      organizationIdFromRequest(req),
      id,
      versionId,
    );
  }

  @Post(':id/versions/:versionId/restore')
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
