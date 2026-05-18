import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { InvitationsController } from './invitations.controller';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [AuditModule],
  controllers: [
    OrganizationsController,
    MembersController,
    InvitationsController,
  ],
  providers: [OrganizationsService, MembersService],
})
export class OrganizationsModule {}
