// dotenv is loaded by the entry point (server.js or combined.js)

import { Worker } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { updateJobStatus } from '../repositories/jobRepository.js';
import { emitJobStatus } from '../utils/jobEvents.js';
import { handleEmbeddingJob } from '../jobs/embeddingJob.js';
import { handleLlmJob } from '../jobs/llmJob.js';
import { handleDocumentProcessJob } from '../jobs/documentProcessJob.js';

const connection = { url: config.REDIS_URL };

const HANDLERS = {
  EMBEDDING: handleEmbeddingJob,
  LLM: handleLlmJob,
  DOCUMENT_PROCESS: handleDocumentProcessJob,
};

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'DEAD_LETTERED']);

/**
 * Process a single BullMQ job.
 * Emits status events to jobEvents after each DB update so WebSocket
 * subscribers receive real-time transitions.
 */
async function processJob(bullJob) {
  const { jobId, type, payload } = bullJob.data;
  const log = logger.child({ jobId, type, bullJobId: bullJob.id });

  log.info('Job picked up — setting PROCESSING');
  await updateJobStatus(jobId, 'PROCESSING', { incrementAttempts: true });
  emitJobStatus(jobId, 'PROCESSING');

  const handler = HANDLERS[type];
  if (!handler) {
    throw new Error(`No handler registered for job type: ${type}`);
  }

  const result = await handler({ jobId, payload });

  await updateJobStatus(jobId, 'COMPLETED', { result });
  emitJobStatus(jobId, 'COMPLETED');
  log.info('Job COMPLETED');

  return result;
}

/**
 * On failure (per-attempt and final dead-letter).
 */
async function onFailed(bullJob, err) {
  const { jobId, type } = bullJob.data;
  const isFinal = bullJob.attemptsMade >= (bullJob.opts.attempts ?? 1);
  const log = logger.child({ jobId, type, attempt: bullJob.attemptsMade });

  if (isFinal) {
    log.error({ err: err.message }, 'Job DEAD_LETTERED after max attempts');
    await updateJobStatus(jobId, 'DEAD_LETTERED', {
      result: { error: err.message, attempts: bullJob.attemptsMade },
    });
    emitJobStatus(jobId, 'DEAD_LETTERED');
  } else {
    log.warn({ err: err.message }, 'Job attempt FAILED — will retry');
    await updateJobStatus(jobId, 'FAILED');
    emitJobStatus(jobId, 'FAILED');
  }
}

// ── Spin up one worker per queue ─────────────────────────────────────────────

const sharedOptions = { connection, concurrency: 5 };

const highWorker = new Worker('jobs-high', processJob, sharedOptions);
const defaultWorker = new Worker('jobs-default', processJob, sharedOptions);

highWorker.on('failed', onFailed);
defaultWorker.on('failed', onFailed);

logger.info('Workers started — listening on jobs-high and jobs-default');

export const workers = [highWorker, defaultWorker];

// ── Graceful shutdown ─────────────────────────────────────────────────────────
// Only register signal handlers when running as a standalone entry point,
// not when imported by combined.js (which registers its own shutdown).
if (process.argv[1].endsWith('jobWorker.js')) {
  async function shutdown() {
    logger.info('Shutting down workers…');
    await Promise.all(workers.map(w => w.close()));
    process.exit(0);
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
