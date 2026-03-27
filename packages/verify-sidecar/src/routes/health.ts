import { Router } from 'express';
import { checkGatewayHealth } from '../gateway/client.js';

const router = Router();

router.get('/', async (_req, res) => {
  const gatewayOk = await checkGatewayHealth();
  res.json({
    status: 'ok',
    gateway: gatewayOk,
  });
});

export default router;
