import type { IncomingHttpHeaders } from 'http';

import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  DeletedObjectJSON,
  OrganizationInvitationJSON,
  OrganizationMembershipJSON,
  UserJSON,
  WebhookEvent,
} from '@clerk/backend';
import { Role } from '@prisma/client';
import { Webhook } from 'svix';

import { mapClerkMembershipRoleToDbRole } from '../clerk/clerk-invite-role';
import {
  normalizeEmail,
  primaryEmailFromUserJson,
} from '../clerk/clerk-user';
import { PrismaService } from '../prisma/prisma.service';

function svixHeaderPayload(headers: IncomingHttpHeaders): {
  id: string;
  timestamp: string;
  signature: string;
} {
  const pick = (key: string): string | undefined => {
    const value = headers[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const id = pick('svix-id');
  const timestamp = pick('svix-timestamp');
  const signature = pick('svix-signature');
  if (!id || !timestamp || !signature) {
    throw new BadRequestException('Missing Svix signature headers');
  }
  return { id, timestamp, signature };
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handle(
    rawBody: string,
    headers: IncomingHttpHeaders,
  ): Promise<{ ok: true }> {
    const secret = this.config.get<string>('CLERK_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error('CLERK_WEBHOOK_SECRET is not configured');
      throw new BadRequestException('Webhook not configured');
    }

    const { id, timestamp, signature } = svixHeaderPayload(headers);
    const wh = new Webhook(secret);

    let evt: WebhookEvent;
    try {
      evt = wh.verify(rawBody, {
        'svix-id': id,
        'svix-timestamp': timestamp,
        'svix-signature': signature,
      }) as WebhookEvent;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Svix verify failed: ${message}`);
      throw new UnauthorizedException('Invalid webhook signature');
    }

    await this.dispatch(evt);
    return { ok: true };
  }

  private async dispatch(evt: WebhookEvent): Promise<void> {
    switch (evt.type) {
      case 'user.created':
        await this.onUserCreated(evt.data);
        return;
      case 'user.updated':
        await this.onUserUpdated(evt.data);
        return;
      case 'user.deleted':
        await this.onUserDeleted(evt.data);
        return;
      case 'organizationInvitation.accepted':
        await this.onOrganizationInvitationAccepted(evt.data);
        return;
      case 'organizationMembership.created':
      case 'organizationMembership.updated':
        await this.onOrganizationMembershipUpserted(evt.data);
        return;
      default:
        return;
    }
  }

  private roleFromClerkWhenSpecific(clerkRole: string): Role | null {
    const role = mapClerkMembershipRoleToDbRole(clerkRole);
    return role === Role.VIEWER && clerkRole === 'org:member' ? null : role;
  }

  private async consumePendingInvitesForNewUser(
    clerkUserId: string,
    emailNormalized: string,
  ): Promise<void> {
    const pendings = await this.prisma.pendingInvitation.findMany({
      where: { email: emailNormalized },
      orderBy: { createdAt: 'asc' },
    });
    if (pendings.length === 0) {
      return;
    }
    const chosen = pendings[0];
    await this.prisma.$transaction([
      this.prisma.membership.upsert({
        where: {
          userId_organizationId: {
            userId: clerkUserId,
            organizationId: chosen.organizationId,
          },
        },
        create: {
          userId: clerkUserId,
          organizationId: chosen.organizationId,
          role: chosen.role,
        },
        update: { role: chosen.role },
      }),
      this.prisma.pendingInvitation.delete({ where: { id: chosen.id } }),
    ]);
  }

  private async onUserCreated(data: UserJSON): Promise<void> {
    const email = primaryEmailFromUserJson(data);
    await this.prisma.user.upsert({
      where: { id: data.id },
      create: {
        id: data.id,
        email,
        firstName: data.first_name,
        lastName: data.last_name,
        imageUrl: data.image_url,
      },
      update: {
        email,
        firstName: data.first_name,
        lastName: data.last_name,
        imageUrl: data.image_url,
      },
    });

    if (email) {
      await this.consumePendingInvitesForNewUser(
        data.id,
        normalizeEmail(email),
      );
    }
  }

  private async onUserUpdated(data: UserJSON): Promise<void> {
    const email = primaryEmailFromUserJson(data);
    await this.prisma.user.upsert({
      where: { id: data.id },
      create: {
        id: data.id,
        email,
        firstName: data.first_name,
        lastName: data.last_name,
        imageUrl: data.image_url,
      },
      update: {
        email,
        firstName: data.first_name,
        lastName: data.last_name,
        imageUrl: data.image_url,
      },
    });
  }

  private async onUserDeleted(data: DeletedObjectJSON): Promise<void> {
    const id = data.id;
    if (typeof id !== 'string' || id.length === 0) {
      return;
    }
    await this.prisma.user.updateMany({
      where: { id },
      data: {
        email: null,
        firstName: null,
        lastName: null,
        imageUrl: null,
      },
    });
  }

  private async onOrganizationInvitationAccepted(
    data: OrganizationInvitationJSON,
  ): Promise<void> {
    const email = normalizeEmail(data.email_address);
    const org = await this.prisma.organization.findUnique({
      where: { clerkOrganizationId: data.organization_id },
    });
    if (!org) {
      this.logger.warn(
        `No DB organization for Clerk org ${data.organization_id}`,
      );
      return;
    }

    const pending = await this.prisma.pendingInvitation.findUnique({
      where: {
        organizationId_email: { organizationId: org.id, email },
      },
    });

    const user = await this.prisma.user.findFirst({
      where: { email },
    });

    if (!user) {
      return;
    }

    const existingMembership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: org.id,
        },
      },
      select: { role: true },
    });

    const finalRole =
      pending?.role ??
      existingMembership?.role ??
      this.roleFromClerkWhenSpecific(String(data.role));

    if (!finalRole) {
      this.logger.warn(
        `No DB role source for accepted invitation ${data.id}; leaving membership unchanged`,
      );
      return;
    }

    await this.prisma.membership.upsert({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: org.id,
        },
      },
      create: {
        userId: user.id,
        organizationId: org.id,
        role: finalRole,
      },
      update: { role: finalRole },
    });

    await this.prisma.pendingInvitation.deleteMany({
      where: {
        organizationId: org.id,
        email,
      },
    });
  }

  private async onOrganizationMembershipUpserted(
    data: OrganizationMembershipJSON,
  ): Promise<void> {
    const email = normalizeEmail(data.public_user_data.identifier);
    const org = await this.prisma.organization.findUnique({
      where: { clerkOrganizationId: data.organization.id },
    });
    if (!org) {
      this.logger.warn(
        `No DB organization for Clerk org ${data.organization.id}`,
      );
      return;
    }

    const pending = await this.prisma.pendingInvitation.findUnique({
      where: {
        organizationId_email: { organizationId: org.id, email },
      },
    });

    const existingMembership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: data.public_user_data.user_id,
          organizationId: org.id,
        },
      },
      select: { role: true },
    });

    const finalRole =
      pending?.role ??
      existingMembership?.role ??
      this.roleFromClerkWhenSpecific(String(data.role));

    if (!finalRole) {
      this.logger.warn(
        `No DB role source for Clerk membership ${data.id}; skipping membership sync`,
      );
      return;
    }

    await this.prisma.user.upsert({
      where: { id: data.public_user_data.user_id },
      create: {
        id: data.public_user_data.user_id,
        email,
        firstName: data.public_user_data.first_name,
        lastName: data.public_user_data.last_name,
        imageUrl: data.public_user_data.image_url,
      },
      update: {
        email,
        firstName: data.public_user_data.first_name,
        lastName: data.public_user_data.last_name,
        imageUrl: data.public_user_data.image_url,
      },
    });

    await this.prisma.membership.upsert({
      where: {
        userId_organizationId: {
          userId: data.public_user_data.user_id,
          organizationId: org.id,
        },
      },
      create: {
        userId: data.public_user_data.user_id,
        organizationId: org.id,
        role: finalRole,
      },
      update: { role: finalRole },
    });

    await this.prisma.pendingInvitation.deleteMany({
      where: {
        organizationId: org.id,
        email,
      },
    });
  }
}
