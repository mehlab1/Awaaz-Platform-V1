import {
  Controller,
  Delete,
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
import { MembersService } from './members.service';

@Controller('api/v1/organizations/:id/invitations')
@UseGuards(OrgRouteMatchesTenantGuard)
export class InvitationsController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @Roles(Role.ADMIN)
  list(@Param('id') organizationId: string) {
    return this.members.listPendingInvitations(organizationId);
  }

  @Delete(':invId')
  @Roles(Role.ADMIN)
  cancel(
    @Param('id') organizationId: string,
    @Param('invId') invitationId: string,
    @Req() req: Request,
  ) {
    return this.members.cancelInvitation(
      organizationId,
      req.user!.id,
      invitationId,
    );
  }

  @Post(':invId/resend')
  @Roles(Role.ADMIN)
  resend(
    @Param('id') organizationId: string,
    @Param('invId') invitationId: string,
    @Req() req: Request,
  ) {
    return this.members.resendInvitation(
      organizationId,
      invitationId,
      req.user!.id,
    );
  }
}
