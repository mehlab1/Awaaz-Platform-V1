import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

type AuditClient = {
  auditLog: {
    create(args: Prisma.AuditLogCreateArgs): Promise<unknown>;
  };
};

export interface AuditRecordInput {
  organizationId: string;
  actorUserId?: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    input: AuditRecordInput,
    client: AuditClient = this.prisma,
  ): Promise<void> {
    await client.auditLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.actorUserId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata,
      },
    });
  }
}
