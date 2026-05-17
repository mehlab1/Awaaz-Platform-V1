import { Module } from '@nestjs/common';

import { LiveKitBrowserTestService } from './livekit-browser-test.service';

@Module({
  providers: [LiveKitBrowserTestService],
  exports: [LiveKitBrowserTestService],
})
export class LiveKitModule {}
