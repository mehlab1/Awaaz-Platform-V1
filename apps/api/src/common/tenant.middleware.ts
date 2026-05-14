import {
  ForbiddenException,
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const raw = req.headers['x-organization-id'];
    const orgId = Array.isArray(raw) ? raw[0] : raw;

    if (typeof orgId !== 'string' || orgId.length === 0) {
      throw new ForbiddenException('Missing organization');
    }

    const userId = req.user?.id;
    if (!userId) {
      throw new ForbiddenException('Missing user context');
    }

    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: { userId, organizationId: orgId },
      },
    });

    if (!membership) {
      throw new ForbiddenException('Not a member');
    }

    req.organizationId = orgId;
    req.userRole = membership.role as Role;
    next();
  }
}
