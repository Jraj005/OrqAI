/**
 * Migration: create jobs table
 * Uses .cjs extension so node-pg-migrate can require() it
 * even though the project is "type": "module".
 */

/** @type {import('node-pg-migrate').ColumnDefinitions | undefined} */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = function (pgm) {
    pgm.createTable('jobs', {
        id: {
            type: 'uuid',
            primaryKey: true,
            default: pgm.func('gen_random_uuid()'),
        },
        type: {
            type: 'text',
            notNull: true,
            check: "type IN ('EMBEDDING', 'LLM', 'DOCUMENT_PROCESS')",
        },
        status: {
            type: 'text',
            notNull: true,
            default: 'PENDING',
            check: "status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTERED')",
        },
        priority: {
            type: 'text',
            notNull: true,
            default: 'DEFAULT',
            check: "priority IN ('HIGH', 'DEFAULT')",
        },
        payload: {
            type: 'jsonb',
            notNull: true,
        },
        result: {
            type: 'jsonb',
        },
        attempts: {
            type: 'integer',
            notNull: true,
            default: 0,
        },
        max_attempts: {
            type: 'integer',
            notNull: true,
            default: 3,
        },
        idempotency_key: {
            type: 'text',
            unique: true,
        },
        created_at: {
            type: 'timestamptz',
            notNull: true,
            default: pgm.func('now()'),
        },
        updated_at: {
            type: 'timestamptz',
            notNull: true,
            default: pgm.func('now()'),
        },
    });

    pgm.createIndex('jobs', ['status', 'type', 'priority']);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = function (pgm) {
    pgm.dropTable('jobs');
};
