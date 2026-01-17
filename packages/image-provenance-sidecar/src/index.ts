import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { initDatabase, closeDatabase } from './db/index.js';
import health from './routes/health.js';
import upload from './routes/upload.js';
import webhook from './routes/webhook.js';
import search from './routes/search.js';
import verify from './routes/verify.js';
import thumbnail from './routes/thumbnail.js';

const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', honoLogger());

// Routes
app.route('/health', health);
app.route('/v1/upload', upload);
app.route('/webhook', webhook);
app.route('/v1/search-similar', search);
app.route('/v1/verify-authenticity', verify);
app.route('/v1/thumbnail', thumbnail);

// Root endpoint - service info
app.get('/', (c) => {
  return c.json({
    name: 'Image Provenance Sidecar',
    version: '0.1.0',
    description: 'C2PA manifest creation, storage, and pHash similarity search for Arweave',
    endpoints: {
      health: 'GET /health',
      upload: 'POST /v1/upload',
      search: 'GET /v1/search-similar',
      verify: 'GET /v1/verify-authenticity',
      thumbnail: 'GET /v1/thumbnail',
      webhook: 'POST /webhook',
    },
  });
});

// Graceful shutdown
async function shutdown() {
  logger.info('Shutting down...');
  await closeDatabase();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
async function start() {
  try {
    // Initialize database
    await initDatabase();

    // Start HTTP server
    logger.info(`Starting server on port ${config.PORT}`);

    Bun.serve({
      port: config.PORT,
      fetch: app.fetch,
    });

    logger.info(`Image Provenance Sidecar running at http://localhost:${config.PORT}`);
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

start();
