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
import { Role } from '@prisma/client';
import type { Request } from 'express';

import { Roles } from '../common/roles.decorator';
import { PatchPhoneNumberDto } from './dto/patch-phone-number.dto';
import { RegisterPhoneNumberDto } from './dto/register-phone-number.dto';
import { PhoneNumbersService } from './phone-numbers.service';

function organizationIdFromRequest(req: Request): string {
  const organizationId = req.organizationId;
  if (!organizationId) {
    throw new ForbiddenException('Missing organization context');
  }
  return organizationId;
}

@Controller('api/v1/phone-numbers')
export class PhoneNumbersController {
  constructor(private readonly phoneNumbers: PhoneNumbersService) {}

  @Get()
  @Roles(Role.VIEWER)
  list(@Req() req: Request) {
    return this.phoneNumbers.list(organizationIdFromRequest(req));
  }

  @Post()
  @Roles(Role.ADMIN)
  register(@Req() req: Request, @Body() dto: RegisterPhoneNumberDto) {
    return this.phoneNumbers.register(organizationIdFromRequest(req), dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: PatchPhoneNumberDto,
  ) {
    return this.phoneNumbers.update(organizationIdFromRequest(req), id, dto);
  }

  @Post(':id/sync-dispatch-rule')
  @Roles(Role.ADMIN)
  syncDispatchRule(@Req() req: Request, @Param('id') id: string) {
    return this.phoneNumbers.syncDispatchRule(
      organizationIdFromRequest(req),
      id,
    );
  }
}
