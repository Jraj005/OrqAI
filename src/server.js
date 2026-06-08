// Load env vars before anything else
import 'dotenv/config';

import { config } from './config/index.js';
import { buildApp } from './app.js';
import { logger } from './utils/logger.js';

const app = await buildApp();

try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    logger.info({ port: config.PORT }, 'Server listening');
} catch (err) {
    logger.fatal({ err }, 'Server failed to start');
    process.exit(1);
}
