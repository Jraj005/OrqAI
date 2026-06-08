import { Queue } from 'bullmq';
import { config } from '../config/index.js';
import { getRetryConfig } from '../config/retryConfig.js';

const connection = { url: config.REDIS_URL };

// Two named queues — priority routing happens at enqueue time
const highQueue = new Queue('jobs-high', { connection });
const defaultQueue = new Queue('jobs-default', { connection });

/**
 * Enqueue a job to the correct priority queue.
 * Retry config (attempts + backoff) is read from retryConfig.js — single source of truth.
 * @param {{ id: string, type: string, priority: string, payload: object }} job
 */
export async function enqueueJob(job) {
  const queue = job.priority === 'HIGH' ? highQueue : defaultQueue;
  const { max_attempts, backoff } = getRetryConfig(job.type);

  await queue.add(
    job.type,
    { jobId: job.id, type: job.type, payload: job.payload },
    {
      jobId: job.id,       // deduplication within BullMQ
      attempts: max_attempts,
      backoff,
    }
  );
}

export { highQueue, defaultQueue };
