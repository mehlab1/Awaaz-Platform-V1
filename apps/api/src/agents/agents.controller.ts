import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';

import { Roles } from '../common/roles.decorator';
import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';

@Controller('api/v1/agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get()
  @Roles(Role.VIEWER)
  list(@Req() req: Request) {
    const organizationId = req.organizationId;
    if (!organizationId) {
      throw new ForbiddenException('Missing organization context');
    }
    return this.agents.list(organizationId);
  }

  @Post()
  @Roles(Role.BUILDER)
  create(@Req() req: Request, @Body() dto: CreateAgentDto) {
    const organizationId = req.organizationId;
    if (!organizationId) {
      throw new ForbiddenException('Missing organization context');
    }
    return this.agents.create(organizationId, dto);
  }
}
