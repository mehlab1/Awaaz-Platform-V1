import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { LiveKitBrowserTestService } from './livekit-browser-test.service';
import { LiveKitEgressService } from './livekit-egress.service';

@Module({
  imports: [PrismaModule, StorageModule],
  providers: [LiveKitBrowserTestService, LiveKitEgressService],
  exports: [LiveKitBrowserTestService, LiveKitEgressService],
})
export class LiveKitModule {}
