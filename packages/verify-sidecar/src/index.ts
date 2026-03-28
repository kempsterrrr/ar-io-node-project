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

// API routes — mounted under a sub-router so we can serve at both '/' and '/verify/'
// This supports two access paths:
//   1. Domain access via reverse proxy that strips /verify/ prefix (e.g., nginx proxy_pass)
//   2. Direct IP access where the frontend uses /verify/ as its base path
const apiRouter = express.Router();
apiRouter.use('/health', healthRouter);
apiRouter.use('/api/v1/verify', verifyRouter);

apiRouter.get('/api', (_req, res) => {
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

app.use('/', apiRouter);
app.use('/verify', apiRouter);

// Serve frontend static files if they exist
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const webDistPath = join(__dirname, '..', 'web', 'dist');

if (existsSync(webDistPath)) {
  // Serve static assets under /verify/ (domain access) and / (direct IP access)
  app.use('/verify', express.static(webDistPath));
  app.use(express.static(webDistPath));

  // Redirect root to /verify/ for direct access
  app.get('/', (_req, res) => {
    res.redirect('/verify/');
  });

  // SPA fallback: serve index.html for non-API routes
  app.get('*', (req, res, next) => {
    if (
      req.path.startsWith('/api/') ||
      req.path.startsWith('/health') ||
      req.path.startsWith('/verify/api/') ||
      req.path.startsWith('/verify/health')
    ) {
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
