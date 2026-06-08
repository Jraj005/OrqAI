import Fastify from 'fastify';
import { randomUUID } from 'crypto';
import fastifyWebsocket from '@fastify/websocket';
import { logger } from './utils/logger.js';
import { jobRoutes } from './routes/jobRoutes.js';
import { wsRoutes } from './routes/wsRoutes.js';

export function buildApp() {
  const app = Fastify({
    loggerInstance: logger,
    genReqId: () => randomUUID(),
  });

  // ── WebSocket support ─────────────────────────────────────────────────────
  app.register(fastifyWebsocket);

  // ── Health route ──────────────────────────────────────────────────────────
  app.get('/health', async (_req, reply) => {
    return reply.send({ status: 'ok', uptime: Math.floor(process.uptime()) });
  });

  // ── REST routes ───────────────────────────────────────────────────────────
  app.register(jobRoutes, { prefix: '/jobs' });

  // ── WebSocket routes ──────────────────────────────────────────────────────
  app.register(wsRoutes);

  return app;
}
