import { pool } from '../db/pool.js';

/**
 * @param {object} job
 * @param {string} job.type
 * @param {string} job.status
 * @param {string} job.priority
 * @param {object} job.payload
 * @param {number} job.max_attempts
 * @param {string|null} job.idempotency_key
 */
export async function insertJob(job) {
    const { type, status, priority, payload, max_attempts, idempotency_key } = job;
    const { rows } = await pool.query(
        `INSERT INTO jobs (type, status, priority, payload, max_attempts, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
        [type, status, priority, JSON.stringify(payload), max_attempts, idempotency_key ?? null]
    );
    return rows[0];
}

export async function findJobById(id) {
    const { rows } = await pool.query('SELECT * FROM jobs WHERE id = $1', [id]);
    return rows[0] ?? null;
}

export async function findJobByIdempotencyKey(key) {
    const { rows } = await pool.query('SELECT * FROM jobs WHERE idempotency_key = $1', [key]);
    return rows[0] ?? null;
}

export async function listJobs({ status, type, priority } = {}) {
    const conditions = [];
    const values = [];

    if (status) { conditions.push(`status = $${values.push(status)}`); }
    if (type) { conditions.push(`type = $${values.push(type)}`); }
    if (priority) { conditions.push(`priority = $${values.push(priority)}`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
        `SELECT * FROM jobs ${where} ORDER BY created_at DESC LIMIT 50`,
        values
    );
    return rows;
}

export async function updateJobStatus(id, status, extra = {}) {
    const setClauses = ['status = $2', 'updated_at = now()'];
    const values = [id, status];

    if (extra.result !== undefined) {
        setClauses.push(`result = $${values.push(JSON.stringify(extra.result))}`);
    }
    if (extra.incrementAttempts) {
        setClauses.push('attempts = attempts + 1');
    }

    const { rows } = await pool.query(
        `UPDATE jobs SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
        values
    );
    return rows[0];
}

/**
 * Reset a DEAD_LETTERED job for retry.
 * Preserves: id, type, priority, payload, idempotency_key, max_attempts, created_at.
 * Resets:    status → PENDING, attempts → 0, result → NULL.
 * @param {string} id
 */
export async function resetJobForRetry(id) {
    const { rows } = await pool.query(
        `UPDATE jobs
         SET status = 'PENDING',
             attempts = 0,
             result = NULL,
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [id]
    );
    return rows[0] ?? null;
}
