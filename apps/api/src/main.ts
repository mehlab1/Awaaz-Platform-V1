import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap() {
  Object.defineProperty(BigInt.prototype, 'toJSON', {
    value: function toJson(this: bigint): string {
      return this.toString();
    },
    configurable: true,
    enumerable: false,
    writable: true,
  });

  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const origins = [process.env.FRONTEND_URL, 'http://localhost:3000'].filter(
    (o): o is string => Boolean(o),
  );

  app.enableCors({
    origin: origins.length ? origins : ['http://localhost:3000'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-organization-id',
      'x-worker-secret',
    ],
    credentials: true,
  });

  const port = process.env.PORT ?? '3001';
  await app.listen(parseInt(port, 10));
}

const logger = new Logger('Bootstrap');

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(message);
  process.exit(1);
});
