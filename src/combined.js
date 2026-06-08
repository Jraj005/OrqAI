/**
 * combined.js — starts Fastify server + BullMQ workers in one process.
 *
 * Use this for:
 *   - Local WebSocket testing (EventEmitter works across server + worker)
 *   - Railway single-dyno deployment (npm run combined)
 *
 * Run: npm run combined
 */
import 'dotenv/config';

import { config } from './config/index.js';
import { buildApp } from './app.js';
import { logger } from './utils/logger.js';

// ── Start Fastify ─────────────────────────────────────────────────────────────
const app = buildApp();

try {
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  logger.info({ port: config.PORT }, 'Server listening');
} catch (err) {
  logger.fatal({ err }, 'Server failed to start');
  process.exit(1);
}

// ── Start workers inline (same process = shared EventEmitter) ─────────────────
const { workers } = await import('./workers/jobWorker.js');

logger.info('Combined mode: server + workers running in the same process');

// ── Graceful shutdown (SIGTERM from Railway on deploy/restart) ────────────────
async function shutdown() {
  logger.info('SIGTERM received — shutting down gracefully…');
  try {
    await Promise.all(workers.map(w => w.close()));
    await app.close();
    logger.info('Clean shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
