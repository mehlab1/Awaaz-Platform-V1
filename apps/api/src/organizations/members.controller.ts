import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';

import { OrgRouteMatchesTenantGuard } from '../common/org-route-matches-tenant.guard';
import { Roles } from '../common/roles.decorator';
import { InviteMemberDto } from './dto/invite-member.dto';
import { MembersService } from './members.service';

@Controller('api/v1/organizations/:id/members')
@UseGuards(OrgRouteMatchesTenantGuard)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @Roles(Role.VIEWER)
  list(@Param('id') organizationId: string) {
    return this.members.listMembers(organizationId);
  }

  @Post('invite')
  @Roles(Role.ADMIN)
  invite(
    @Param('id') organizationId: string,
    @Req() req: Request,
    @Body() dto: InviteMemberDto,
  ) {
    return this.members.invite(organizationId, req.user!.id, dto);
  }
}
