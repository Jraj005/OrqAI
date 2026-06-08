/**
 * Priority Lane Test — Task 1, Phase 2
 *
 * Strategy:
 *   1. Pause both queues via Redis (BullMQ .pause() is Redis-backed — affects all consumers)
 *   2. Enqueue 5 DEFAULT jobs, then 2 HIGH jobs via the HTTP API
 *   3. Resume both queues
 *   4. Poll until all 7 jobs reach a terminal state
 *   5. Assert: both HIGH jobs have an updated_at BEFORE the last DEFAULT job completes
 *
 * Requires: server running on :3000, worker running, Redis + Postgres reachable.
 * Run: node tests/priority.test.js
 */

import 'dotenv/config';
import { highQueue, defaultQueue } from '../src/queues/jobQueue.js';

const BASE = 'http://localhost:3000';
const TERMINAL = new Set(['COMPLETED', 'FAILED', 'DEAD_LETTERED']);
const POLL_INTERVAL_MS = 150;
const POLL_TIMEOUT_MS = 15_000;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function post(body) {
  const res = await fetch(`${BASE}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST /jobs failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function getJob(id) {
  const res = await fetch(`${BASE}/jobs/${id}`);
  return res.json();
}

async function pollUntilDone(ids, timeoutMs = POLL_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  const done = new Map();

  while (done.size < ids.length) {
    if (Date.now() > deadline) {
      const pending = ids.filter(id => !done.has(id));
      throw new Error(`Timed out waiting for jobs: ${pending.join(', ')}`);
    }

    for (const id of ids) {
      if (done.has(id)) continue;
      const job = await getJob(id);
      if (TERMINAL.has(job.status)) done.set(id, job);
    }

    if (done.size < ids.length) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  return done; // Map<id, job>
}

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

// ── Test ─────────────────────────────────────────────────────────────────────

console.log('\n── Priority Lane Test ──────────────────────────────────────────');
console.log('   Pausing queues via Redis…');

await highQueue.pause();
await defaultQueue.pause();
console.log('   Both queues paused. Enqueuing jobs…');

const ts = Date.now();
const defaultIds = [];
const highIds = [];

// 5 DEFAULT jobs first
for (let i = 0; i < 5; i++) {
  const job = await post({
    type: 'LLM',
    priority: 'DEFAULT',
    payload: { seq: i },
    idempotency_key: `priority-test-default-${ts}-${i}`,
  });
  defaultIds.push(job.id);
}

// 2 HIGH jobs after (enqueued later, but should process first)
for (let i = 0; i < 2; i++) {
  const job = await post({
    type: 'LLM',
    priority: 'HIGH',
    payload: { seq: i },
    idempotency_key: `priority-test-high-${ts}-${i}`,
  });
  highIds.push(job.id);
}

console.log(`   Enqueued: 5 DEFAULT [${defaultIds.map(id => id.slice(0,8)).join(', ')}]`);
console.log(`             2 HIGH   [${highIds.map(id => id.slice(0,8)).join(', ')}]`);
console.log('   Resuming queues…');

await highQueue.resume();
await defaultQueue.resume();

console.log('   Queues resumed. Polling for completion…');

const allIds = [...defaultIds, ...highIds];
const results = await pollUntilDone(allIds);

// ── Assertions ────────────────────────────────────────────────────────────────
const allJobs = allIds.map(id => results.get(id));

check('All 7 jobs completed', allJobs.every(j => j.status === 'COMPLETED'),
  allJobs.filter(j => j.status !== 'COMPLETED').map(j => `${j.id.slice(0,8)}=${j.status}`).join(', '));

// Get the latest updated_at among HIGH jobs (the slower of the two HIGH jobs)
const highFinishTime = Math.max(...highIds.map(id => new Date(results.get(id).updated_at).getTime()));

// Get the latest updated_at among DEFAULT jobs
const defaultFinishTime = Math.max(...defaultIds.map(id => new Date(results.get(id).updated_at).getTime()));

// At least one DEFAULT job must have finished AFTER all HIGH jobs
// (In practice, HIGH queue drains before DEFAULT queue begins draining)
// We assert: the HIGH jobs' last completion is before some DEFAULT jobs
const defaultFinishTimes = defaultIds.map(id => new Date(results.get(id).updated_at).getTime());
const defaultsFinishedAfterHighs = defaultFinishTimes.filter(t => t >= highFinishTime).length;

check(
  'HIGH jobs drained before DEFAULT queue fully drained',
  defaultsFinishedAfterHighs >= 1,
  `${defaultsFinishedAfterHighs} DEFAULT job(s) finished after the last HIGH job`
);

check(
  'Both HIGH jobs started before last DEFAULT job finished',
  highIds.every(id => new Date(results.get(id).updated_at).getTime() <= defaultFinishTime),
  'HIGH job completed after all DEFAULT jobs'
);

// Timing summary
console.log('\n   Completion timeline (updated_at):');
const timeline = allIds
  .map(id => ({ id: id.slice(0, 8), priority: highIds.includes(id) ? 'HIGH   ' : 'DEFAULT', t: new Date(results.get(id).updated_at).getTime() }))
  .sort((a, b) => a.t - b.t);
for (const { id, priority, t } of timeline) {
  console.log(`     [${priority}] ${id}  +${t - timeline[0].t}ms`);
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
await highQueue.close();
await defaultQueue.close();

console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
