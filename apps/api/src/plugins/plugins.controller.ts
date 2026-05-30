import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';

import { Roles } from '../common/roles.decorator';
import { UpsertProviderCredentialDto } from './dto/upsert-provider-credential.dto';
import { PluginsService } from './plugins.service';

function organizationIdFromRequest(req: Request): string {
  const organizationId = req.organizationId;
  if (!organizationId) {
    throw new ForbiddenException('Missing organization context');
  }
  return organizationId;
}

@Controller('api/v1/plugins')
export class PluginsCatalogController {
  constructor(private readonly plugins: PluginsService) {}

  @Get('catalog')
  @Roles(Role.VIEWER)
  catalog(@Req() req: Request) {
    return this.plugins.catalog(organizationIdFromRequest(req));
  }
}

@Controller('api/v1/plugin-credentials')
export class PluginCredentialsController {
  constructor(private readonly plugins: PluginsService) {}

  @Get()
  @Roles(Role.ADMIN)
  list(@Req() req: Request) {
    return this.plugins.listCredentials(organizationIdFromRequest(req));
  }

  @Put(':providerId')
  @Roles(Role.ADMIN)
  upsert(
    @Req() req: Request,
    @Param('providerId') providerId: string,
    @Body() dto: UpsertProviderCredentialDto,
  ) {
    return this.plugins.upsertCredential(
      organizationIdFromRequest(req),
      req.user!.id,
      providerId,
      dto,
    );
  }

  @Post(':providerId/validate')
  @Roles(Role.ADMIN)
  validate(@Req() req: Request, @Param('providerId') providerId: string) {
    return this.plugins.validateCredential(
      organizationIdFromRequest(req),
      req.user!.id,
      providerId,
    );
  }

  @Delete(':providerId')
  @Roles(Role.ADMIN)
  delete(@Req() req: Request, @Param('providerId') providerId: string) {
    return this.plugins.deleteCredential(
      organizationIdFromRequest(req),
      req.user!.id,
      providerId,
    );
  }
}
