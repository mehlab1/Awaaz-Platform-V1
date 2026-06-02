import {
  Body,
  Controller,
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
import { InviteMemberDto } from './dto/invite-member.dto';
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
@Controller('api/v1/organizations/:id/members')
@UseGuards(OrgRouteMatchesTenantGuard)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @ApiOperation({ summary: 'List organization members' })
  @Roles(Role.VIEWER)
  list(@Param('id') organizationId: string) {
    return this.members.listMembers(organizationId);
  }

  @Post('invite')
  @ApiOperation({ summary: 'Invite an organization member' })
  @Roles(Role.ADMIN)
  invite(
    @Param('id') organizationId: string,
    @Req() req: Request,
    @Body() dto: InviteMemberDto,
  ) {
    return this.members.invite(organizationId, req.user!.id, dto);
  }
}
