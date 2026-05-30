import { join } from 'path';
import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { AgentsController } from './agents/agents.controller';
import { AgentsModule } from './agents/agents.module';
import { AnalyticsController } from './analytics/analytics.controller';
import { AnalyticsModule } from './analytics/analytics.module';
import { ApiKeysController } from './api-keys/api-keys.controller';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { AppController } from './app.controller';
import { BillingModule } from './billing/billing.module';
import { CallsController } from './calls/calls.controller';
import { CallsModule } from './calls/calls.module';
import { ClerkAuthMiddleware } from './auth/clerk-auth.middleware';
import { RolesGuard } from './common/roles.guard';
import { PerformanceMiddleware } from './common/performance.middleware';
import { TenantMiddleware } from './common/tenant.middleware';
import { InternalModule } from './internal/internal.module';
import { InvitationsController } from './organizations/invitations.controller';
import { MembersController } from './organizations/members.controller';
import { OrganizationsController } from './organizations/organizations.controller';
import { OrganizationsModule } from './organizations/organizations.module';
import { PhoneNumbersController } from './phone-numbers/phone-numbers.controller';
import { PhoneNumbersModule } from './phone-numbers/phone-numbers.module';
import {
  PluginCredentialsController,
  PluginsCatalogController,
} from './plugins/plugins.controller';
import { PluginsModule } from './plugins/plugins.module';
import { PrismaModule } from './prisma/prisma.module';
import { VoicesController } from './voices/voices.controller';
import { VoicesModule } from './voices/voices.module';
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
    AnalyticsModule,
    ApiKeysModule,
    BillingModule,
    CallsModule,
    PhoneNumbersModule,
    VoicesModule,
    PluginsModule,
    InternalModule,
  ],
  controllers: [AppController],
  providers: [
    PerformanceMiddleware,
    ClerkAuthMiddleware,
    TenantMiddleware,
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(PerformanceMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });

    // Clerk webhooks use Svix signatures only; never JWT — exclude alone was brittle with `forRoutes('*')`.
    consumer.apply(ClerkAuthMiddleware).forRoutes(
      OrganizationsController,
      MembersController,
      InvitationsController,
      AgentsController,
      AnalyticsController,
      ApiKeysController,
      CallsController,
      PhoneNumbersController,
      VoicesController,
      PluginsCatalogController,
      PluginCredentialsController,
    );

    // Tenant header required only on org-scoped routes — same `forRoutes('*')` + exclude
    // pattern can still hit webhooks → 403 Missing organization.
    consumer.apply(TenantMiddleware).forRoutes(
      {
        path: 'api/v1/organizations/:id',
        method: RequestMethod.PATCH,
      },
      MembersController,
      InvitationsController,
      AgentsController,
      AnalyticsController,
      ApiKeysController,
      CallsController,
      PhoneNumbersController,
      VoicesController,
      PluginsCatalogController,
      PluginCredentialsController,
    );
  }
}
