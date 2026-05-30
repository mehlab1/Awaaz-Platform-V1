import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { BillingAttributionService } from './billing-attribution.service';
import { BillingService } from './billing.service';

@Module({
  imports: [PrismaModule],
  providers: [BillingService, BillingAttributionService],
  exports: [BillingService, BillingAttributionService],
})
export class BillingModule {}