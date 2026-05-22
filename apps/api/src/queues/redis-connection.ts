import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';

/** BullMQ worker: check stalled jobs at most once per minute (Upstash quota safety). */
export const BULLMQ_STALLED_INTERVAL_MS = 60_000;

/** BullMQ worker: fail a job after one stalled recovery attempt. */
export const BULLMQ_MAX_STALLED_COUNT = 1;

export function isRedisDisabled(value: string | undefined | null): boolean {
  const normalized = value?.trim().toLowerCase();
  return (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'on'
  );
}

export function createRedisConnection(
  url: string,
  overrides: RedisOptions = {},
): RedisOptions {
  const parsed = new URL(url);
  const isTls = parsed.protocol === 'rediss:';
  return {
    host: parsed.hostname,
    port: Number(parsed.port || (isTls ? 6380 : 6379)),
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    ...(isTls ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    enableOfflineQueue: false,
    connectTimeout: 1_000,
    retryStrategy: () => null,
    reconnectOnError: () => false,
    ...overrides,
  };
}

export async function preflightRedisUrl(redisUrl: string): Promise<boolean> {
  const client = new Redis(
    createRedisConnection(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    }),
  );
  client.on('error', () => undefined);
  try {
    await client.connect();
    await client.ping();
    return true;
  } catch {
    return false;
  } finally {
    client.disconnect();
  }
}
