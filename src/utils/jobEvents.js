/**
 * jobEvents.js — in-process EventEmitter for job status transitions.
 *
 * The worker emits here after every DB status update.
 * The WebSocket route subscribes and forwards events to connected clients.
 *
 * ⚠️  This only works when server + worker run in the SAME Node process.
 *     Phase 6: replace with Redis pub/sub if they are split into separate services.
 */
import { EventEmitter } from 'events';

export const jobEvents = new EventEmitter();

// Prevent memory-leak warnings when many WS clients subscribe simultaneously
jobEvents.setMaxListeners(100);

/**
 * Emit a status transition event.
 * @param {string} jobId
 * @param {string} status
 */
export function emitJobStatus(jobId, status) {
  jobEvents.emit(`job:${jobId}`, { jobId, status, timestamp: new Date().toISOString() });
}
