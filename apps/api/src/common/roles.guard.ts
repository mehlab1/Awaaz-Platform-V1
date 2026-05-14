import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import type { Request } from 'express';
import { meetsMinimumRole } from './role-order';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const minimum = this.reflector.getAllAndOverride<Role | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (minimum === undefined) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const userRole = req.userRole;
    if (!userRole) {
      throw new ForbiddenException('Missing role context');
    }
    if (!meetsMinimumRole(userRole, minimum)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
