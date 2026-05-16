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
import { AppController } from './app.controller';
import { ClerkAuthMiddleware } from './auth/clerk-auth.middleware';
import { RolesGuard } from './common/roles.guard';
import { TenantMiddleware } from './common/tenant.middleware';
import { InternalModule } from './internal/internal.module';
import { InvitationsController } from './organizations/invitations.controller';
import { MembersController } from './organizations/members.controller';
import { OrganizationsController } from './organizations/organizations.controller';
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
    InternalModule,
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
    // Clerk webhooks use Svix signatures only; never JWT — exclude alone was brittle with `forRoutes('*')`.
    consumer.apply(ClerkAuthMiddleware).forRoutes(
      OrganizationsController,
      MembersController,
      InvitationsController,
      AgentsController,
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
    );
  }
}
