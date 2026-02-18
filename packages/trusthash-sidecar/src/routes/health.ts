import { Hono } from 'hono';
import { getDatabase } from '../db/index.js';

const health = new Hono();

const VERSION = '0.1.0';

health.get('/', async (c) => {
  let dbStatus: 'healthy' | 'unhealthy' | 'unknown' = 'unknown';
  let indexedManifests = 0;

  try {
    const db = getDatabase();
    if (db) {
      // Test database connection
      const result = await db.all('SELECT COUNT(*) as count FROM manifests');
      // DuckDB returns BigInt for COUNT(*), convert to Number
      indexedManifests = Number(result[0]?.count ?? 0);
      dbStatus = 'healthy';
    }
  } catch {
    dbStatus = 'unhealthy';
  }

  const overallStatus = dbStatus === 'healthy' ? 'ok' : 'error';

  const response = {
    success: overallStatus === 'ok',
    data: {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: VERSION,
      services: {
        database: dbStatus,
      },
      stats: {
        indexedManifests,
      },
    },
  };

  const statusCode = overallStatus === 'ok' ? 200 : 503;
  return c.json(response, statusCode);
});

export default health;
