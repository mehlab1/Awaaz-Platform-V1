import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
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
import { PatchPhoneNumberDto } from './dto/patch-phone-number.dto';
import { RegisterPhoneNumberDto } from './dto/register-phone-number.dto';
import { PhoneNumbersService } from './phone-numbers.service';

function organizationIdFromRequest(req: Request): string {
  const organizationId = (req as any).organizationId;
  if (!organizationId) {
    throw new ForbiddenException('Missing organization context');
  }
  return organizationId;
}

@ApiTags('Phone Numbers')
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
@Controller('api/v1/phone-numbers')
export class PhoneNumbersController {
  constructor(private readonly phoneNumbers: PhoneNumbersService) {}

  @Get()
  @ApiOperation({ summary: 'List phone numbers' })
  @Roles(Role.VIEWER)
  list(@Req() req: Request) {
    return this.phoneNumbers.list(organizationIdFromRequest(req));
  }

  @Post()
  @ApiOperation({ summary: 'Register a phone number' })
  @Roles(Role.ADMIN)
  register(@Req() req: Request, @Body() dto: RegisterPhoneNumberDto) {
    return this.phoneNumbers.register(organizationIdFromRequest(req), dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a phone number' })
  @Roles(Role.ADMIN)
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: PatchPhoneNumberDto,
  ) {
    return this.phoneNumbers.update(
      organizationIdFromRequest(req),
      (req as any).user!.id,
      id,
      dto,
    );
  }

  @Post(':id/sync-dispatch-rule')
  @ApiOperation({ summary: 'Sync a phone number dispatch rule' })
  @Roles(Role.ADMIN)
  syncDispatchRule(@Req() req: Request, @Param('id') id: string) {
    return this.phoneNumbers.syncDispatchRule(
      organizationIdFromRequest(req),
      id,
    );
  }
}
