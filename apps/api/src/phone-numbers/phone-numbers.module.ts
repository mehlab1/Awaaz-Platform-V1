import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { PhoneNumbersController } from './phone-numbers.controller';
import { LiveKitSipService } from './livekit-sip.service';
import { PhoneNumbersService } from './phone-numbers.service';

@Module({
  imports: [AuditModule],
  controllers: [PhoneNumbersController],
  providers: [LiveKitSipService, PhoneNumbersService],
})
export class PhoneNumbersModule {}
