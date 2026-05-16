import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CallEventDto } from './dto/call-event.dto';
import { EndCallDto } from './dto/end-call.dto';
import { StartCallDto } from './dto/start-call.dto';
import { InternalAuthGuard } from './internal-auth.guard';
import { InternalService } from './internal.service';

@Controller('internal')
@UseGuards(InternalAuthGuard)
export class InternalController {
  constructor(private readonly internal: InternalService) {}

  @Get('agents/:id/config')
  getAgentConfig(@Param('id') id: string) {
    return this.internal.getAgentConfig(id);
  }

  @Post('calls/start')
  startCall(@Body() dto: StartCallDto) {
    return this.internal.startCall(dto);
  }

  @Post('calls/:id/end')
  endCall(@Param('id') id: string, @Body() dto: EndCallDto) {
    return this.internal.endCall(id, dto);
  }

  @Post('calls/:id/events')
  emitEvent(@Param('id') id: string, @Body() dto: CallEventDto) {
    return this.internal.emitEvent(id, dto);
  }

  @Get('worker/heartbeat')
  heartbeat() {
    return this.internal.heartbeat();
  }
}
