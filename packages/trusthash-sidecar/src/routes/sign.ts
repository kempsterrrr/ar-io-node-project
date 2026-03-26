/**
 * COSE signing oracle routes.
 *
 * POST /sign          — sign raw COSE Sig_structure bytes
 * POST /identity/sign — verify wallet ownership + sign identity assertion payload
 * GET  /cert          — serve public X.509 certificate chain
 *
 * All endpoints return 501 when ENABLE_SIGNING is false.
 */

import { Hono } from 'hono';
import { verifyMessage } from 'ethers';
import { config } from '../config.js';
import { signCose, signDer, getCertificatePem } from '../services/signing.service.js';
import { logger } from '../utils/logger.js';

const sign = new Hono();

/**
 * POST /sign
 * Receives raw COSE Sig_structure bytes, returns ECDSA signature in IEEE P1363 format.
 */
sign.post('/sign', async (c) => {
  if (!config.ENABLE_SIGNING) {
    return c.json({ error: 'Signing is not enabled on this instance' }, 501);
  }

  const body = await c.req.arrayBuffer();

  if (!body || body.byteLength === 0) {
    return c.json({ error: 'Request body is required (COSE Sig_structure bytes)' }, 400);
  }

  try {
    const payload = Buffer.from(body);
    const format = c.req.query('format');
    const signature = format === 'der' ? await signDer(payload) : await signCose(payload);

    return new Response(signature, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': signature.length.toString(),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Signing failed');
    return c.json({ error: 'Signing failed' }, 500);
  }
});

/**
 * GET /cert
 * Returns the PEM-encoded X.509 certificate chain.
 */
sign.get('/cert', (c) => {
  if (!config.ENABLE_SIGNING) {
    return c.json({ error: 'Signing is not enabled on this instance' }, 501);
  }

  const pem = getCertificatePem();

  if (!pem) {
    return c.json({ error: 'Certificate not configured' }, 500);
  }

  return new Response(pem, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-pem-file',
    },
  });
});

/**
 * POST /identity/sign
 * Verifies wallet ownership and signs an identity assertion payload.
 *
 * The sidecar acts as a CAWG identity claims aggregator:
 * 1. Verify the wallet signature proves ownership of the claimed address
 * 2. Sign the CBOR-encoded signer_payload with the X.509 key
 * 3. Return the signature for embedding as a cawg.identity assertion
 */
sign.post('/identity/sign', async (c) => {
  if (!config.ENABLE_SIGNING) {
    return c.json({ error: 'Signing is not enabled on this instance' }, 501);
  }

  let body: {
    payload: string;
    walletAddress: string;
    walletSignature: string;
    walletMessage: string;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { payload, walletAddress, walletSignature, walletMessage } = body;

  if (!payload || !walletAddress || !walletSignature || !walletMessage) {
    return c.json(
      { error: 'Required fields: payload (base64), walletAddress, walletSignature, walletMessage' },
      400
    );
  }

  // Verify wallet ownership
  try {
    const recoveredAddress = verifyMessage(walletMessage, walletSignature);
    if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      logger.warn(
        { claimed: walletAddress, recovered: recoveredAddress },
        'Wallet signature verification failed'
      );
      return c.json({ error: 'Wallet signature does not match claimed address' }, 403);
    }
  } catch (error) {
    logger.warn({ error }, 'Invalid wallet signature');
    return c.json({ error: 'Invalid wallet signature' }, 400);
  }

  // Validate base64 format and size before decoding
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(payload)) {
    return c.json({ error: 'Payload must be valid base64' }, 400);
  }

  const maxPayloadBytes = 10 * 1024 * 1024; // 10 MB
  const estimatedBytes = Math.ceil((payload.length * 3) / 4);
  if (estimatedBytes > maxPayloadBytes) {
    return c.json({ error: 'Payload exceeds size limit' }, 413);
  }

  // Sign the payload with the X.509 key (DER format for COSE identity assertion)
  try {
    const payloadBytes = Buffer.from(payload, 'base64');
    const signature = await signDer(payloadBytes);

    logger.debug(
      { walletAddress, signatureBytes: signature.length },
      'Signed identity assertion payload'
    );

    return new Response(signature, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': signature.length.toString(),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Identity signing failed');
    return c.json({ error: 'Identity signing failed' }, 500);
  }
});

export default sign;
