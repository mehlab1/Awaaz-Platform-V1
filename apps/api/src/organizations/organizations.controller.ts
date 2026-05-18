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
import type { Request } from 'express';
import { Role } from '@prisma/client';

import { OrgRouteMatchesTenantGuard } from '../common/org-route-matches-tenant.guard';
import { Roles } from '../common/roles.decorator';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { PatchOrganizationDto } from './dto/patch-organization.dto';
import { OrganizationsService } from './organizations.service';

@Controller('api/v1/organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  list(@Req() req: Request) {
    return this.organizations.listForUser(req.user!.id);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateOrganizationDto) {
    return this.organizations.create(req.user!.id, dto);
  }

  @Patch(':id')
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
