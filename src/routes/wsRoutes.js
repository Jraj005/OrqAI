import { jobEvents } from '../utils/jobEvents.js';

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'DEAD_LETTERED']);

/**
 * WebSocket route: ws://host/jobs/:id/status
 *
 * Client connects and receives { jobId, status, timestamp } events in real time.
 * Socket closes automatically on terminal status (COMPLETED / FAILED / DEAD_LETTERED).
 *
 * ⚠️  Requires server and worker to run in the same process (uses in-process EventEmitter).
 *     See src/utils/jobEvents.js for the Phase 6 Redis pub/sub upgrade path.
 */
export async function wsRoutes(app) {
  app.get('/jobs/:id/status', { websocket: true }, (socket, req) => {
    const { id: jobId } = req.params;
    const log = req.log.child({ jobId, transport: 'websocket' });

    log.info('WebSocket client connected — subscribing to job status');

    function onStatusChange(event) {
      try {
        socket.send(JSON.stringify(event));
      } catch {
        // Client disconnected mid-send — cleanup happens in 'close' handler
      }

      if (TERMINAL_STATUSES.has(event.status)) {
        log.info({ status: event.status }, 'Terminal status reached — closing WebSocket');
        jobEvents.off(`job:${jobId}`, onStatusChange);
        socket.close();
      }
    }

    jobEvents.on(`job:${jobId}`, onStatusChange);

    // Client-initiated close: clean up listener so it doesn't leak
    socket.on('close', () => {
      log.info('WebSocket client disconnected');
      jobEvents.off(`job:${jobId}`, onStatusChange);
    });

    // Send an immediate acknowledgement so the client knows it's subscribed
    socket.send(JSON.stringify({ jobId, subscribed: true, timestamp: new Date().toISOString() }));
  });
}
