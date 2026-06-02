import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CallEventDto } from './dto/call-event.dto';
import { EndCallDto } from './dto/end-call.dto';
import { StartCallDto } from './dto/start-call.dto';
import { InternalAuthGuard } from './internal-auth.guard';
import { InternalService } from './internal.service';

@ApiTags('Internal')
@ApiHeader({
  name: 'x-worker-secret',
  required: true,
  description: 'Worker shared secret.',
})
@ApiResponse({ status: 403, description: 'Missing or invalid worker secret.' })
@Controller('internal')
@UseGuards(InternalAuthGuard)
export class InternalController {
  constructor(private readonly internal: InternalService) {}

  @Get('agents/:id/config')
  @ApiOperation({ summary: 'Get internal agent runtime config' })
  getAgentConfig(@Param('id') id: string) {
    return this.internal.getAgentConfig(id);
  }

  @Post('calls/start')
  @ApiOperation({ summary: 'Start internal call tracking' })
  startCall(@Body() dto: StartCallDto) {
    return this.internal.startCall(dto);
  }

  @Post('calls/:id/end')
  @ApiOperation({ summary: 'End internal call tracking' })
  endCall(@Param('id') id: string, @Body() dto: EndCallDto) {
    return this.internal.endCall(id, dto);
  }

  @Post('calls/:id/events')
  @ApiOperation({ summary: 'Record an internal call event' })
  emitEvent(@Param('id') id: string, @Body() dto: CallEventDto) {
    return this.internal.emitEvent(id, dto);
  }

  @Get('worker/heartbeat')
  @ApiOperation({ summary: 'Check worker heartbeat' })
  heartbeat() {
    return this.internal.heartbeat();
  }
}
