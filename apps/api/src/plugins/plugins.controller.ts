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
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Request } from 'express';

import { Roles } from '../common/roles.decorator';
import { UpsertProviderCredentialDto } from './dto/upsert-provider-credential.dto';
import { PluginsService } from './plugins.service';

function organizationIdFromRequest(req: Request): string {
  const organizationId = (req as any).organizationId;
  if (!organizationId) {
    throw new ForbiddenException('Missing organization context');
  }
  return organizationId;
}

@ApiTags('Providers')
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
@Controller('api/v1/plugins')
export class PluginsCatalogController {
  constructor(private readonly plugins: PluginsService) {}

  @Get('catalog')
  @ApiOperation({ summary: 'List provider catalog' })
  @Roles(Role.VIEWER)
  catalog(@Req() req: Request) {
    return this.plugins.catalog(organizationIdFromRequest(req));
  }
}

@ApiTags('Providers')
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
@Controller('api/v1/plugin-credentials')
export class PluginCredentialsController {
  constructor(private readonly plugins: PluginsService) {}

  @Get()
  @ApiOperation({ summary: 'List provider credentials' })
  @Roles(Role.ADMIN)
  list(@Req() req: Request) {
    return this.plugins.listCredentials(organizationIdFromRequest(req));
  }

  @Put(':providerId')
  @ApiOperation({ summary: 'Create or update provider credentials' })
  @Roles(Role.ADMIN)
  upsert(
    @Req() req: Request,
    @Param('providerId') providerId: string,
    @Body() dto: UpsertProviderCredentialDto,
  ) {
    return this.plugins.upsertCredential(
      organizationIdFromRequest(req),
      (req as any).user!.id,
      providerId,
      dto,
    );
  }

  @Post(':providerId/validate')
  @ApiOperation({ summary: 'Validate provider credentials' })
  @Roles(Role.ADMIN)
  validate(@Req() req: Request, @Param('providerId') providerId: string) {
    return this.plugins.validateCredential(
      organizationIdFromRequest(req),
      (req as any).user!.id,
      providerId,
    );
  }

  @Delete(':providerId')
  @ApiOperation({ summary: 'Delete provider credentials' })
  @Roles(Role.ADMIN)
  delete(@Req() req: Request, @Param('providerId') providerId: string) {
    return this.plugins.deleteCredential(
      organizationIdFromRequest(req),
      (req as any).user!.id,
      providerId,
    );
  }
}
