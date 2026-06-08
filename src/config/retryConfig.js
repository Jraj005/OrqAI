/**
 * Retry configuration per job type — single source of truth.
 *
 * max_attempts: how many total attempts before DEAD_LETTERED
 * delay:        base backoff delay in ms (exponential: delay * 2^attempt)
 *
 * Worker reads max_attempts for the dead-letter check.
 * Queue reads the full config at enqueue time (BullMQ stores it on the job).
 */
export const RETRY_CONFIG = {
  EMBEDDING: {
    max_attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
  },
  LLM: {
    max_attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  },
  DOCUMENT_PROCESS: {
    max_attempts: 2,
    backoff: { type: 'exponential', delay: 500 },
  },
};

/**
 * Convenience getter — throws if type is unknown.
 * @param {string} type
 */
export function getRetryConfig(type) {
  const cfg = RETRY_CONFIG[type];
  if (!cfg) throw new Error(`No retry config for job type: ${type}`);
  return cfg;
}
