import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class InternalAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expectedSecret = this.config.get<string>('WORKER_SECRET');
    if (!expectedSecret) {
      throw new InternalServerErrorException('Worker auth not configured');
    }

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers['x-worker-secret'];
    const providedSecret = Array.isArray(header) ? header[0] : header;
    if (!providedSecret) {
      throw new UnauthorizedException('Missing worker secret');
    }
    if (providedSecret !== expectedSecret) {
      throw new ForbiddenException('Invalid worker secret');
    }
    return true;
  }
}
