/**
 * Task 4 — WebSocket status stream test
 * Run with combined mode (server + worker same process):
 *   Terminal 1: npm run combined
 *   Terminal 2: node tests/ws.test.js
 */
import 'dotenv/config';
import { WebSocket } from 'ws';
import { highQueue } from '../src/queues/jobQueue.js';

const BASE_HTTP = 'http://localhost:3000';
const BASE_WS   = 'ws://localhost:3000';

let passed = 0, failed = 0;

function check(label, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else { console.log(`  ❌ ${label}${detail ? ': ' + detail : ''}`); failed++; }
}

async function post(body) {
  const res = await fetch(`${BASE_HTTP}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

console.log('\n── Task 4: WebSocket status stream ─────────────────────────────');

// Pause the HIGH queue so the worker doesn't pick up the job before we connect WS
await highQueue.pause();

const job = await post({
  type: 'EMBEDDING',
  priority: 'HIGH',
  payload: { test: 'websocket' },
  idempotency_key: `ws-test-${Date.now()}`,
});

check('Job created', !!job.id, JSON.stringify(job));
const jobId = job.id;

// Connect WebSocket BEFORE resuming — guarantees we catch PROCESSING event
const events = [];
let wsError = null;

await new Promise((resolve, reject) => {
  const ws = new WebSocket(`${BASE_WS}/jobs/${jobId}/status`);
  const timeout = setTimeout(() => { ws.close(); reject(new Error('Timed out')); }, 10000);

  ws.on('open', async () => {
    // Connected — now safe to resume the queue
    await highQueue.resume();
  });

  ws.on('message', (raw) => {
    const data = JSON.parse(raw.toString());
    events.push(data);
    if (['COMPLETED', 'FAILED', 'DEAD_LETTERED'].includes(data.status)) {
      clearTimeout(timeout);
      resolve();
    }
  });

  ws.on('error', (e) => { wsError = e.message; clearTimeout(timeout); reject(e); });
  ws.on('close', () => { clearTimeout(timeout); resolve(); });
});

await highQueue.close();

check('No WebSocket connection error', !wsError, wsError);
check('Received at least 1 event', events.length >= 1, `got ${events.length}`);

const subscribeAck = events.find(e => e.subscribed === true);
check('Received subscription acknowledgement', !!subscribeAck);

const statuses = events.filter(e => e.status).map(e => e.status);
check('Received PROCESSING event', statuses.includes('PROCESSING'), `got: [${statuses}]`);
check('Received COMPLETED event',  statuses.includes('COMPLETED'),  `got: [${statuses}]`);
check('All events have jobId',    events.every(e => e.subscribed || e.jobId === jobId));
check('All events have timestamp', events.every(e => !!e.timestamp));

console.log(`\n  Events received: [${statuses.join(', ')}]`);
console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
