import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
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

import { OrgRouteMatchesTenantGuard } from '../common/org-route-matches-tenant.guard';
import { Roles } from '../common/roles.decorator';
import { MembersService } from './members.service';

@ApiTags('Organizations')
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
@Controller('api/v1/organizations/:id/invitations')
@UseGuards(OrgRouteMatchesTenantGuard)
export class InvitationsController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @ApiOperation({ summary: 'List pending invitations' })
  @Roles(Role.ADMIN)
  list(@Param('id') organizationId: string) {
    return this.members.listPendingInvitations(organizationId);
  }

  @Delete(':invId')
  @ApiOperation({ summary: 'Cancel an invitation' })
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
  @ApiOperation({ summary: 'Resend an invitation' })
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
