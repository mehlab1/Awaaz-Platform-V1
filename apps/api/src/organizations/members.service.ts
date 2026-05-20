import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createClerkClient,
  type OrganizationInvitation,
} from '@clerk/backend';
import {
  AuditAction,
  Prisma,
  Role,
} from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { toClerkOrganizationRole } from '../clerk/clerk-invite-role';
import { normalizeEmail } from '../clerk/clerk-user';
import { PrismaService } from '../prisma/prisma.service';
import type { InviteMemberDto } from './dto/invite-member.dto';

@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private clerkClient() {
    const secretKey = this.config.get<string>('CLERK_SECRET_KEY');
    if (!secretKey) {
      this.logger.error('CLERK_SECRET_KEY is not configured for member invites');
      throw new BadRequestException('Server missing Clerk configuration');
    }
    return createClerkClient({ secretKey });
  }

  async listMembers(organizationId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: {
        organizationId,
        user: { email: { not: null } },
      },
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
    if (dto.role === Role.OWNER) {
      throw new BadRequestException('OWNER role cannot be invited');
    }

    try {
      await this.assertNotAlreadyMember(organizationId, email);

      const existingPending = await this.prisma.pendingInvitation.findUnique({
        where: {
          organizationId_email: { organizationId: org.id, email },
        },
      });
      const clerkPending = await this.findClerkPendingInvitation(
        org.clerkOrganizationId,
        email,
      );
      this.logger.log(
        `Invite preflight org=${org.id} email=${maskEmail(email)} localPending=${Boolean(existingPending)} clerkPending=${clerkPending?.id ?? 'none'}`,
      );

      if (existingPending && clerkPending) {
        const reconciled = await this.prisma.pendingInvitation.update({
          where: { id: existingPending.id },
          data: {
            role: dto.role,
            clerkInviteId: clerkPending.id,
            expiresAt: clerkTimestampToDate(clerkPending.expiresAt),
          },
        });
        this.logger.log(
          `Invite reused existing Clerk pending invitation org=${org.id} email=${maskEmail(email)} clerkInvite=${clerkPending.id} status=${clerkPending.status ?? 'unknown'}`,
        );
        return this.inviteResponse(reconciled);
      }

      if (existingPending && !clerkPending) {
        await this.prisma.pendingInvitation.delete({
          where: { id: existingPending.id },
        });
        this.logger.warn(
          `Removed stale local invitation before fresh Clerk invite org=${org.id} email=${maskEmail(email)} stalePending=${existingPending.id}`,
        );
      }

      if (!existingPending && clerkPending) {
        const recovered = await this.createPendingFromClerkInvitation(
          org.id,
          clerkPending,
          dto.role,
          inviterUserId,
        );
        this.logger.log(
          `Recovered Clerk pending invitation into DB org=${org.id} email=${maskEmail(email)} clerkInvite=${clerkPending.id} status=${clerkPending.status ?? 'unknown'}`,
        );
        return this.inviteResponse(recovered);
      }

      const clerk = this.clerkClient();
      const redirectUrl = this.invitationRedirectUrl();
      this.logger.log(
        `Creating Clerk invitation org=${org.id} clerkOrg=${org.clerkOrganizationId} email=${maskEmail(email)} role=${dto.role}${redirectUrl ? ' redirectUrl=configured' : ''}`,
      );

      const invitation = await clerk.organizations.createOrganizationInvitation({
        organizationId: org.clerkOrganizationId,
        emailAddress: email,
        role: toClerkOrganizationRole(dto.role),
        inviterUserId,
        ...(redirectUrl ? { redirectUrl } : {}),
        publicMetadata: {
          awaazOrganizationId: org.id,
          awaazRole: dto.role,
        },
      });

      this.logger.log(
        `Clerk invitation created org=${org.id} email=${maskEmail(email)} clerkInvite=${invitation.id} status=${invitation.status ?? 'unknown'} expiresAt=${invitation.expiresAt ?? 'unknown'} urlPresent=${Boolean(invitation.url)}`,
      );

      await this.verifyClerkInvitationCreated(
        org.clerkOrganizationId,
        invitation.id,
        email,
      );

      const pending = await this.persistPendingInvitation(
        org.id,
        email,
        dto.role,
        inviterUserId,
        invitation,
      );

      return this.inviteResponse(pending);
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
      this.logger.log(
        `Revoking Clerk invitation org=${organizationId} email=${maskEmail(pending.email)} clerkInvite=${pending.clerkInviteId}`,
      );
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

    await this.assertNotAlreadyMember(organizationId, pending.email);

    if (pending.clerkInviteId) {
      this.logger.log(
        `Revoking prior Clerk invitation before resend org=${organizationId} email=${maskEmail(pending.email)} clerkInvite=${pending.clerkInviteId}`,
      );
      await this.clerkClient().organizations.revokeOrganizationInvitation({
        organizationId: org.clerkOrganizationId,
        invitationId: pending.clerkInviteId,
      });
    }

    const redirectUrl = this.invitationRedirectUrl();
    const invitation =
      await this.clerkClient().organizations.createOrganizationInvitation({
        organizationId: org.clerkOrganizationId,
        emailAddress: pending.email,
        role: toClerkOrganizationRole(pending.role),
        inviterUserId,
        ...(redirectUrl ? { redirectUrl } : {}),
        publicMetadata: {
          awaazOrganizationId: organizationId,
          awaazRole: pending.role,
        },
      });
    this.logger.log(
      `Clerk invitation resent org=${organizationId} email=${maskEmail(pending.email)} clerkInvite=${invitation.id} status=${invitation.status ?? 'unknown'} urlPresent=${Boolean(invitation.url)}`,
    );

    return this.prisma.pendingInvitation.update({
      where: { id: pending.id },
      data: {
        clerkInviteId: invitation.id,
        expiresAt: clerkTimestampToDate(invitation.expiresAt),
      },
    });
  }

  private async assertNotAlreadyMember(
    organizationId: string,
    email: string,
  ): Promise<void> {
    const existing = await this.prisma.membership.findFirst({
      where: {
        organizationId,
        user: { email },
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('User is already a member of this organization');
    }
  }

  private async findClerkPendingInvitation(
    clerkOrganizationId: string,
    email: string,
  ): Promise<OrganizationInvitation | null> {
    try {
      const page = await this.clerkClient().organizations.getOrganizationInvitationList({
        organizationId: clerkOrganizationId,
        status: ['pending'],
        limit: 100,
      });
      const matched =
        page.data.find(
          (invitation) =>
            normalizeEmail(invitation.emailAddress) === email &&
            invitation.status === 'pending',
        ) ?? null;
      this.logger.log(
        `Clerk pending invite search org=${clerkOrganizationId} email=${maskEmail(email)} fetched=${page.data.length} matched=${matched?.id ?? 'none'}`,
      );
      if (page.data.length >= 100 && !matched) {
        this.logger.warn(
          `Clerk pending invite search may be truncated org=${clerkOrganizationId} email=${maskEmail(email)} fetched=${page.data.length}`,
        );
      }
      return matched;
    } catch (error: unknown) {
      this.logger.warn(
        `Could not preflight Clerk pending invitations org=${clerkOrganizationId}: ${messageOf(error)}`,
      );
      return null;
    }
  }

  private async createPendingFromClerkInvitation(
    organizationId: string,
    invitation: OrganizationInvitation,
    role: Role,
    inviterUserId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const pending = await tx.pendingInvitation.create({
        data: {
          organizationId,
          email: normalizeEmail(invitation.emailAddress),
          role,
          clerkInviteId: invitation.id,
          expiresAt: clerkTimestampToDate(invitation.expiresAt),
        },
      });
      await this.auditInvite(tx, {
        organizationId,
        inviterUserId,
        pendingId: pending.id,
        email: pending.email,
        role: pending.role,
        recovered: true,
      });
      return pending;
    });
  }

  private async persistPendingInvitation(
    organizationId: string,
    email: string,
    role: Role,
    inviterUserId: string,
    invitation: OrganizationInvitation,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const pending = await tx.pendingInvitation.upsert({
          where: {
            organizationId_email: { organizationId, email },
          },
          create: {
            organizationId,
            email,
            role,
            clerkInviteId: invitation.id,
            expiresAt: clerkTimestampToDate(invitation.expiresAt),
          },
          update: {
            role,
            clerkInviteId: invitation.id,
            expiresAt: clerkTimestampToDate(invitation.expiresAt),
          },
        });
        await this.auditInvite(tx, {
          organizationId,
          inviterUserId,
          pendingId: pending.id,
          email: pending.email,
          role: pending.role,
        });
        this.logger.log(
          `Persisted pending invite org=${organizationId} email=${maskEmail(email)} pending=${pending.id} clerkInvite=${invitation.id}`,
        );
        return pending;
      });
    } catch (error: unknown) {
      this.logger.error(
        `DB persistence failed after Clerk invite creation; revoking Clerk invite org=${organizationId} email=${maskEmail(email)} clerkInvite=${invitation.id}: ${messageOf(error)}`,
      );
      await this.revokeClerkInvitationBestEffort(
        invitation.organizationId,
        invitation.id,
      );
      throw error;
    }
  }

  private async auditInvite(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      inviterUserId: string;
      pendingId: string;
      email: string;
      role: Role;
      recovered?: boolean;
    },
  ): Promise<void> {
    await this.audit.record(
      {
        organizationId: input.organizationId,
        actorUserId: input.inviterUserId,
        action: AuditAction.INVITED,
        entityType: 'PendingInvitation',
        entityId: input.pendingId,
        metadata: {
          email: input.email,
          role: input.role,
          recoveredFromClerk: input.recovered ?? false,
        },
      },
      tx,
    );
  }

  private async verifyClerkInvitationCreated(
    clerkOrganizationId: string,
    invitationId: string,
    email: string,
  ): Promise<void> {
    const attempts = 3;
    const delayMs = 800;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const invitation = await this.clerkClient().organizations.getOrganizationInvitation({
          organizationId: clerkOrganizationId,
          invitationId,
        });
        this.logger.log(
          `Verified Clerk invitation exists email=${maskEmail(email)} clerkInvite=${invitation.id} status=${invitation.status ?? 'unknown'} urlPresent=${Boolean(invitation.url)} attempt=${attempt}`,
        );
        if (!invitation.url) {
          this.logger.warn(
            `Clerk invitation missing url (may affect immediate delivery) email=${maskEmail(email)} clerkInvite=${invitation.id} status=${invitation.status ?? 'unknown'}`,
          );
        }
        // successful verification, exit loop
        return;
      } catch (error: unknown) {
        const msg = messageOf(error);
        this.logger.warn(
          `Could not verify Clerk invitation after create email=${maskEmail(email)} clerkInvite=${invitationId} attempt=${attempt}: ${msg}`,
        );
        if (attempt < attempts) {
          // small backoff before retry
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
      }
    }
  }

  private async revokeClerkInvitationBestEffort(
    clerkOrganizationId: string,
    invitationId: string,
  ): Promise<void> {
    try {
      await this.clerkClient().organizations.revokeOrganizationInvitation({
        organizationId: clerkOrganizationId,
        invitationId,
      });
    } catch (error: unknown) {
      this.logger.warn(
        `Could not revoke orphaned Clerk invitation ${invitationId}: ${messageOf(error)}`,
      );
    }
  }

  private invitationRedirectUrl(): string | undefined {
    const raw =
      this.config.get<string>('CLERK_INVITATION_REDIRECT_URL') ??
      this.config.get<string>('FRONTEND_URL');
    const trimmed = raw?.trim();
    if (!trimmed) {
      return undefined;
    }
    try {
      const url = new URL(trimmed);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return trimmed;
      }
    } catch {
      /* fall through */
    }
    this.logger.warn(`Ignoring invalid invitation redirect URL: ${trimmed}`);
    return undefined;
  }

  private inviteResponse(pending: {
    id: string;
    email: string;
    role: Role;
    clerkInviteId: string | null;
  }) {
    return {
      id: pending.id,
      email: pending.email,
      role: pending.role,
      clerkInviteId: pending.clerkInviteId,
    };
  }
}

function clerkTimestampToDate(value: number | null | undefined): Date | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  const milliseconds = value < 100_000_000_000 ? value * 1_000 : value;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) {
    return 'invalid-email';
  }
  const visible = local.length <= 2 ? local[0] : local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(local.length - visible.length, 1))}@${domain}`;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null && 'errors' in error) {
    const errors = (error as { errors?: unknown }).errors;
    if (Array.isArray(errors) && errors.length > 0) {
      return errors
        .map((entry) => {
          if (
            typeof entry === 'object' &&
            entry !== null &&
            'message' in entry &&
            typeof (entry as { message?: unknown }).message === 'string'
          ) {
            return (entry as { message: string }).message;
          }
          return String(entry);
        })
        .join('; ');
    }
  }
  return String(error);
}
