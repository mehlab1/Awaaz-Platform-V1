import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class OrgRouteMatchesTenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const routeOrgId = req.params['id'];
    const tenantOrgId = req.organizationId;
    if (!tenantOrgId || !routeOrgId || routeOrgId !== tenantOrgId) {
      throw new ForbiddenException('Organization scope mismatch');
    }
    return true;
  }
}
