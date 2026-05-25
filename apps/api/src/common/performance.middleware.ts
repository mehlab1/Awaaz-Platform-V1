import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const DEFAULT_SLOW_REQUEST_MS = 400;

@Injectable()
export class PerformanceMiddleware implements NestMiddleware {
  private readonly logger = new Logger(PerformanceMiddleware.name);
  private readonly slowThresholdMs =
    Number(process.env.API_SLOW_REQUEST_MS) || DEFAULT_SLOW_REQUEST_MS;

  use(req: Request, res: Response, next: NextFunction): void {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1_000_000;

      if (durationMs < this.slowThresholdMs) {
        return;
      }

      this.logger.warn(
        `[slow-route] ${req.method} ${req.originalUrl} status=${res.statusCode} duration=${durationMs.toFixed(
          1,
        )}ms threshold=${this.slowThresholdMs}ms`,
      );
    });

    next();
  }
}
