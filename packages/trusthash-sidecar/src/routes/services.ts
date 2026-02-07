/**
 * Services route handler.
 *
 * GET /v1/services/supportedAlgorithms - Return soft binding algorithms supported
 */

import { Hono } from 'hono';
import { SOFT_BINDING_ALG_ID } from '../services/softbinding.service.js';

const services = new Hono();

services.get('/supportedAlgorithms', (c) => {
  return c.json({
    watermarks: [],
    fingerprints: [
      {
        alg: SOFT_BINDING_ALG_ID,
      },
    ],
  });
});

export default services;
