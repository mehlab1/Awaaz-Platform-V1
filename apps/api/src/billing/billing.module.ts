import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { BillingController } from './billing.controller';
import { BillingAttributionService } from './billing-attribution.service';
import { BillingReportingService } from './billing-reporting.service';
import { BillingService } from './billing.service';

@Module({
  imports: [PrismaModule],
  controllers: [BillingController],
  providers: [BillingService, BillingAttributionService, BillingReportingService],
  exports: [BillingService, BillingAttributionService, BillingReportingService],
})
export class BillingModule {}