/**
 * Phase 1.8 — BullMQ smoke test against REDIS_URL (Upstash: use rediss://).
 * Run from repo root:
 *   pnpm --filter @awaaz/api exec dotenv -e ../../.env -- ts-node scripts/bullmq-smoke.ts
 */
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

async function main(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL is not set');
  }

  const useTls = url.startsWith('rediss://');
  const connection = new Redis(url, {
    ...(useTls ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  const queueName = `awaaz-phase1-smoke-${Date.now()}`;
  const queue = new Queue(queueName, { connection });

  let resolveDone!: () => void;
  let rejectDone!: (reason: Error) => void;
  const finished = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  const worker = new Worker(
    queueName,
    async (job) => {
      if (job.name !== 'ping') {
        throw new Error(`unexpected job name: ${job.name}`);
      }
      return { ok: true };
    },
    { connection },
  );

  const timeout = setTimeout(() => {
    rejectDone(new Error('timeout waiting for job completion'));
  }, 15_000);

  worker.on('completed', () => {
    clearTimeout(timeout);
    resolveDone();
  });

  worker.on('failed', (_job, err) => {
    clearTimeout(timeout);
    rejectDone(err instanceof Error ? err : new Error(String(err)));
  });

  await queue.add('ping', { at: new Date().toISOString() });
  await finished;

  await worker.close();
  await queue.close();
  connection.disconnect();
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
