import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
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
import { CallsService } from './calls.service';
import { ListCallsQueryDto } from './dto/list-calls.query.dto';

function organizationIdFromRequest(req: Request): string {
  const organizationId = req.organizationId;
  if (!organizationId) {
    throw new ForbiddenException('Missing organization context');
  }
  return organizationId;
}

@ApiTags('Calls')
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
@Controller('api/v1/calls')
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Get()
  @ApiOperation({ summary: 'List calls' })
  @Roles(Role.VIEWER)
  list(@Req() req: Request, @Query() query: ListCallsQueryDto) {
    return this.calls.listPaged(organizationIdFromRequest(req), query);
  }

  @Get(':id/recording')
  @ApiOperation({ summary: 'Get call recording playback URL' })
  @Roles(Role.VIEWER)
  recordingPlayback(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    return this.calls.getRecordingPlaybackUrl(
      organizationIdFromRequest(req),
      id,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get call details' })
  @Roles(Role.VIEWER)
  detail(@Req() req: Request, @Param('id') id: string) {
    return this.calls.getDetailWithRelations(
      organizationIdFromRequest(req),
      id,
    );
  }
}
