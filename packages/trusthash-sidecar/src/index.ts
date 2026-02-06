import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { initDatabase, closeDatabase } from './db/index.js';
import { serve } from '@hono/node-server';
import health from './routes/health.js';
import webhook from './routes/webhook.js';
import search from './routes/search.js';
import softbinding from './routes/softbinding.js';
import manifests from './routes/manifests.js';
import services from './routes/services.js';

const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', honoLogger());

// Routes
app.route('/health', health);
app.route('/webhook', webhook);
app.route('/v1/search-similar', search);
app.route('/v1/matches', softbinding);
app.route('/v1/manifests', manifests);
app.route('/v1/services', services);

// Root endpoint - service info
app.get('/', (c) => {
  return c.json({
    name: 'Trusthash Sidecar',
    version: '0.1.0',
    description: 'C2PA manifest repository, soft binding API, and pHash similarity search for Arweave',
    endpoints: {
      health: 'GET /health',
      search: 'GET /v1/search-similar',
      matches: 'GET/POST /v1/matches/*',
      manifests: 'GET /v1/manifests/:manifestId',
      services: 'GET /v1/services/supportedAlgorithms',
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

    const bun = (globalThis as { Bun?: { serve?: Function } }).Bun;
    if (bun?.serve) {
      bun.serve({
        port: config.PORT,
        fetch: app.fetch,
      });
    } else {
      serve({
        port: config.PORT,
        fetch: app.fetch,
      });
    }

    logger.info(`Trusthash Sidecar running at http://localhost:${config.PORT}`);
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

start();
