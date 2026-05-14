import { join } from 'path';
import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { ClerkAuthMiddleware } from './auth/clerk-auth.middleware';
import { AgentsModule } from './agents/agents.module';
import { AppController } from './app.controller';
import { RolesGuard } from './common/roles.guard';
import { TenantMiddleware } from './common/tenant.middleware';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaModule } from './prisma/prisma.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), '..', '..', '.env'),
        join(process.cwd(), '.env'),
      ],
    }),
    PrismaModule,
    WebhooksModule,
    OrganizationsModule,
    AgentsModule,
  ],
  controllers: [AppController],
  providers: [
    ClerkAuthMiddleware,
    TenantMiddleware,
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(ClerkAuthMiddleware)
      .exclude(
        { path: 'health', method: RequestMethod.GET },
        { path: 'webhooks/clerk', method: RequestMethod.POST },
      )
      .forRoutes('*');

    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'health', method: RequestMethod.GET },
        { path: 'webhooks/clerk', method: RequestMethod.POST },
        {
          path: 'api/v1/organizations',
          method: RequestMethod.GET,
        },
        {
          path: 'api/v1/organizations',
          method: RequestMethod.POST,
        },
      )
      .forRoutes('*');
  }
}
