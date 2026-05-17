import { Module } from '@nestjs/common';

import { PhoneNumbersController } from './phone-numbers.controller';
import { LiveKitSipService } from './livekit-sip.service';
import { PhoneNumbersService } from './phone-numbers.service';

@Module({
  controllers: [PhoneNumbersController],
  providers: [LiveKitSipService, PhoneNumbersService],
})
export class PhoneNumbersModule {}
