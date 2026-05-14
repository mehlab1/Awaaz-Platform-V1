import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyToken } from '@clerk/backend';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class ClerkAuthMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const authHeader = req.headers.authorization;
    const bearer =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length).trim()
        : undefined;

    if (!bearer) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const secretKey = this.config.get<string>('CLERK_SECRET_KEY');
    if (!secretKey) {
      throw new UnauthorizedException('Server missing Clerk configuration');
    }

    try {
      const verified = await verifyToken(bearer, { secretKey });
      const sub = verified.sub;
      if (typeof sub !== 'string' || sub.length === 0) {
        throw new UnauthorizedException('Invalid token subject');
      }
      req.user = { id: sub };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    next();
  }
}
