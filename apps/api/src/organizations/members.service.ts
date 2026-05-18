import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClerkClient } from '@clerk/backend';
import { AuditAction, Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { toClerkOrganizationRole } from '../clerk/clerk-invite-role';
import { normalizeEmail } from '../clerk/clerk-user';
import { PrismaService } from '../prisma/prisma.service';
import type { InviteMemberDto } from './dto/invite-member.dto';

@Injectable()
export class MembersService {
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

  async listMembers(organizationId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      membershipId: m.id,
      userId: m.userId,
      role: m.role,
      email: m.user.email,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
    }));
  }

  async invite(
    organizationId: string,
    inviterUserId: string,
    dto: InviteMemberDto,
  ) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org?.clerkOrganizationId) {
      throw new BadRequestException('Organization missing Clerk linkage');
    }

    const email = normalizeEmail(dto.email);

    try {
      const invitation =
        await this.clerkClient().organizations.createOrganizationInvitation({
          organizationId: org.clerkOrganizationId,
          emailAddress: email,
          role: toClerkOrganizationRole(dto.role),
          inviterUserId,
        });

      const pending = await this.prisma.$transaction(async (tx) => {
        const created = await tx.pendingInvitation.create({
          data: {
            organizationId: org.id,
            email,
            role: dto.role,
            clerkInviteId: invitation.id,
          },
        });
        await this.audit.record(
          {
            organizationId: org.id,
            actorUserId: inviterUserId,
            action: AuditAction.INVITED,
            entityType: 'PendingInvitation',
            entityId: created.id,
            metadata: {
              email: created.email,
              role: created.role,
            },
          },
          tx,
        );
        return created;
      });

      return {
        id: pending.id,
        email: pending.email,
        role: pending.role,
        clerkInviteId: pending.clerkInviteId,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Invitation already pending for email');
      }
      throw error;
    }
  }

  async listPendingInvitations(organizationId: string) {
    return this.prisma.pendingInvitation.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async cancelInvitation(
    organizationId: string,
    actorUserId: string,
    invitationId: string,
  ): Promise<{ ok: true }> {
    const pending = await this.prisma.pendingInvitation.findFirst({
      where: { id: invitationId, organizationId },
    });
    if (!pending) {
      throw new NotFoundException('Invitation not found');
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (org?.clerkOrganizationId && pending.clerkInviteId) {
      await this.clerkClient().organizations.revokeOrganizationInvitation({
        organizationId: org.clerkOrganizationId,
        invitationId: pending.clerkInviteId,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.pendingInvitation.delete({
        where: { id: pending.id },
      });
      await this.audit.record(
        {
          organizationId,
          actorUserId,
          action: AuditAction.REVOKED,
          entityType: 'PendingInvitation',
          entityId: pending.id,
          metadata: {
            email: pending.email,
            role: pending.role,
            clerkInviteIdPresent: Boolean(pending.clerkInviteId),
          },
        },
        tx,
      );
    });
    return { ok: true };
  }

  async resendInvitation(
    organizationId: string,
    invitationId: string,
    inviterUserId: string,
  ) {
    const pending = await this.prisma.pendingInvitation.findFirst({
      where: { id: invitationId, organizationId },
    });
    if (!pending) {
      throw new NotFoundException('Invitation not found');
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org?.clerkOrganizationId) {
      throw new BadRequestException('Organization missing Clerk linkage');
    }

    if (pending.clerkInviteId) {
      await this.clerkClient().organizations.revokeOrganizationInvitation({
        organizationId: org.clerkOrganizationId,
        invitationId: pending.clerkInviteId,
      });
    }

    const invitation =
      await this.clerkClient().organizations.createOrganizationInvitation({
        organizationId: org.clerkOrganizationId,
        emailAddress: pending.email,
        role: toClerkOrganizationRole(pending.role),
        inviterUserId,
      });

    return this.prisma.pendingInvitation.update({
      where: { id: pending.id },
      data: { clerkInviteId: invitation.id },
    });
  }
}
