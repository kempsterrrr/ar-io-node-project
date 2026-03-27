import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { initCache, closeCache } from './storage/cache.js';
import healthRouter from './routes/health.js';
import verifyRouter from './routes/verify.js';

const app = express();

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());

// API routes
app.use('/health', healthRouter);
app.use('/api/v1/verify', verifyRouter);

// Root endpoint - service info
app.get('/api', (_req, res) => {
  res.json({
    name: 'Verify Sidecar',
    version: '0.1.0',
    description: 'Verification and attestation service for Arweave transaction data',
    endpoints: {
      health: 'GET /health',
      verify: 'POST /api/v1/verify',
      result: 'GET /api/v1/verify/:id',
      pdf: 'GET /api/v1/verify/:id/pdf',
    },
  });
});

// Serve frontend static files if they exist
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const webDistPath = join(__dirname, '..', 'web', 'dist');

if (existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
  // SPA fallback: serve index.html for non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/health')) {
      next();
      return;
    }
    res.sendFile(join(webDistPath, 'index.html'));
  });
}

// Graceful shutdown
async function shutdown() {
  logger.info('Shutting down...');
  closeCache();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
try {
  initCache();

  app.listen(config.PORT, () => {
    logger.info(`Verify Sidecar running at http://localhost:${config.PORT}`);
  });
} catch (error) {
  logger.error({ error }, 'Failed to start server');
  process.exit(1);
}
