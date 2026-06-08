import { z } from 'zod';
import * as jobRepository from '../repositories/jobRepository.js';
import { enqueueJob } from '../queues/jobQueue.js';
import { getRetryConfig } from '../config/retryConfig.js';

const createJobSchema = z.object({
  type: z.enum(['EMBEDDING', 'LLM', 'DOCUMENT_PROCESS']),
  priority: z.enum(['HIGH', 'DEFAULT']).default('DEFAULT'),
  payload: z.record(z.string(), z.unknown()),
  idempotency_key: z.string().min(1).optional(),
});

export async function createJob(input) {
  const data = createJobSchema.parse(input);

  // Idempotency check — return existing job if key already seen
  if (data.idempotency_key) {
    const existing = await jobRepository.findJobByIdempotencyKey(data.idempotency_key);
    if (existing) return { job: existing, created: false };
  }

  // max_attempts comes from retryConfig — not overridable per-request
  const { max_attempts } = getRetryConfig(data.type);

  const job = await jobRepository.insertJob({
    type: data.type,
    status: 'PENDING',
    priority: data.priority,
    payload: data.payload,
    max_attempts,
    idempotency_key: data.idempotency_key ?? null,
  });

  await enqueueJob(job);

  return { job, created: true };
}

export async function getJobById(id) {
  const job = await jobRepository.findJobById(id);
  if (!job) {
    const err = new Error('Job not found');
    err.statusCode = 404;
    throw err;
  }
  return job;
}

export async function listJobs(filters) {
  return jobRepository.listJobs(filters);
}

export async function retryJob(id) {
  const job = await jobRepository.findJobById(id);

  if (!job) {
    const err = new Error('Job not found');
    err.statusCode = 404;
    throw err;
  }

  if (job.status !== 'DEAD_LETTERED') {
    const err = new Error(`Cannot retry a job with status '${job.status}' — only DEAD_LETTERED jobs can be retried`);
    err.statusCode = 409;
    throw err;
  }

  // Reset DB state — idempotency_key preserved by resetJobForRetry (not touched)
  const updated = await jobRepository.resetJobForRetry(id);

  // Re-enqueue with same priority; retry config re-read from retryConfig.js
  await enqueueJob(updated);

  return updated;
}
