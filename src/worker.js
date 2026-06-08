/**
 * worker.js — standalone worker entry point.
 * Loads env then starts the worker module.
 * Use: npm run worker
 */
import 'dotenv/config';
await import('./workers/jobWorker.js');
