import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { BillingService } from './billing.service';

@Module({
  imports: [PrismaModule],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}