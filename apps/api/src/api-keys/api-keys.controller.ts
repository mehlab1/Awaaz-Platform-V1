import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
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
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

function organizationIdFromRequest(req: Request): string {
  const organizationId = (req as any).organizationId;
  if (!organizationId) {
    throw new ForbiddenException('Missing organization context');
  }
  return organizationId;
}

@ApiTags('API Keys')
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
@Controller('api/v1/api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  @ApiOperation({ summary: 'List API keys' })
  @Roles(Role.ADMIN)
  list(@Req() req: Request) {
    return this.apiKeys.list(organizationIdFromRequest(req));
  }

  @Post()
  @ApiOperation({ summary: 'Create an API key' })
  @Roles(Role.ADMIN)
  create(@Req() req: Request, @Body() dto: CreateApiKeyDto) {
    return this.apiKeys.create(
      organizationIdFromRequest(req),
      (req as any).user!.id,
      dto,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke an API key' })
  @Roles(Role.ADMIN)
  revoke(@Req() req: Request, @Param('id') id: string) {
    return this.apiKeys.revoke(organizationIdFromRequest(req), (req as any).user!.id, id);
  }
}
