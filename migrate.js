/**
 * migrate.js — loads .env, then shells out to node-pg-migrate CLI.
 * Uses .cjs migration files because this project is "type":"module"
 * and node-pg-migrate internally requires() migration files.
 */
import { config } from 'dotenv';
import { execSync } from 'child_process';

// Load .env into process.env
config();

const direction = process.argv[2] ?? 'up';

execSync(
    `npx node-pg-migrate ${direction} -m src/db/migrations`,
    {
        stdio: 'inherit',
        // Pass env explicitly so child process sees DATABASE_URL
        env: { ...process.env },
    }
);
