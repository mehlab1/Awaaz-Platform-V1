import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { PatchOrganizationDto } from './dto/patch-organization.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('Organizations')
@ApiBearerAuth()
@ApiResponse({ status: 401, description: 'Missing or invalid bearer token.' })
@Controller('api/v1/organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  @ApiOperation({ summary: 'List organizations for the current user' })
  list(@Req() req: Request) {
    return this.organizations.listForUser(req.user!.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create an organization' })
  create(@Req() req: Request, @Body() dto: CreateOrganizationDto) {
    return this.organizations.create(req.user!.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update organization details' })
  @ApiHeader({
    name: 'x-organization-id',
    required: true,
    description: 'Organization ID used to scope tenant requests.',
  })
  @ApiResponse({
    status: 403,
    description: 'Missing organization access or insufficient role.',
  })
  @UseGuards(OrgRouteMatchesTenantGuard)
  @Roles(Role.ADMIN)
  patch(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() dto: PatchOrganizationDto,
  ) {
    return this.organizations.patchName(id, req.user!.id, dto);
  }
}
