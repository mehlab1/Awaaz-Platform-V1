import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const raw = req.headers['x-organization-id'];
    const orgId = Array.isArray(raw) ? raw[0] : raw;
    if (typeof orgId === 'string' && orgId.length > 0) {
      req.organizationId = orgId;
    }
    next();
  }
}
