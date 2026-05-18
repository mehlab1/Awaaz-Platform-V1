import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClerkClient } from '@clerk/backend';
import { AuditAction, Role } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateOrganizationDto } from './dto/create-organization.dto';
import type { PatchOrganizationDto } from './dto/patch-organization.dto';
import { allocateUniqueOrgSlug } from './org-slug';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private clerkClient() {
    const secretKey = this.config.get<string>('CLERK_SECRET_KEY');
    if (!secretKey) {
      throw new BadRequestException('Server missing Clerk configuration');
    }
    return createClerkClient({ secretKey });
  }

  async listForUser(userId: string) {
    const rows = await this.prisma.membership.findMany({
      where: { userId },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      role: m.role,
      clerkOrganizationId: m.organization.clerkOrganizationId,
    }));
  }

  async assertCanCreateOrganization(userId: string): Promise<void> {
    const membershipCount = await this.prisma.membership.count({
      where: { userId },
    });
    if (membershipCount === 0) {
      return;
    }
    const elevated = await this.prisma.membership.findFirst({
      where: {
        userId,
        role: { in: [Role.ADMIN, Role.OWNER] },
      },
    });
    if (!elevated) {
      throw new ForbiddenException(
        'Admin role required to create an organization',
      );
    }
  }

  async create(userId: string, dto: CreateOrganizationDto) {
    await this.assertCanCreateOrganization(userId);
    const slug = await allocateUniqueOrgSlug(
      this.prisma,
      dto.name,
      dto.slug,
    );

    const clerkClient = this.clerkClient();
    const clerkOrg = await clerkClient.organizations.createOrganization({
      name: dto.name,
      slug,
      createdBy: userId,
    });

    await this.prisma.user.upsert({
      where: { id: userId },
      create: { id: userId },
      update: {},
    });

    const org = await this.prisma.organization.create({
      data: {
        name: dto.name,
        slug,
        clerkOrganizationId: clerkOrg.id,
      },
    });

    await this.prisma.membership.create({
      data: {
        userId,
        organizationId: org.id,
        role: Role.OWNER,
      },
    });

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      clerkOrganizationId: org.clerkOrganizationId,
      role: Role.OWNER,
    };
  }

  async patchName(
    organizationId: string,
    actorUserId: string,
    dto: PatchOrganizationDto,
  ) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org?.clerkOrganizationId) {
      throw new BadRequestException('Organization missing Clerk linkage');
    }

    await this.clerkClient().organizations.updateOrganization(
      org.clerkOrganizationId,
      { name: dto.name },
    );

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.organization.update({
        where: { id: organizationId },
        data: { name: dto.name },
      });
      await this.audit.record(
        {
          organizationId,
          actorUserId,
          action: AuditAction.UPDATED,
          entityType: 'Organization',
          entityId: organizationId,
          metadata: {
            field: 'name',
            previousName: org.name,
            name: updated.name,
          },
        },
        tx,
      );
      return updated;
    });
  }
}
