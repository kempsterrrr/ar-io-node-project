import { Router } from 'express';
import { runVerification } from '../pipeline/orchestrator.js';
import { saveResult, getResultById, getResultsByTxId } from '../storage/cache.js';
import { generatePdf } from '../attestation/pdf-generator.js';
import { logger } from '../utils/logger.js';

const router = Router();

const TX_ID_PATTERN = /^[a-zA-Z0-9_-]{43}$/;

/**
 * POST /api/v1/verify
 * Primary verification endpoint. Accepts JSON body with txId.
 */
router.post('/', async (req, res) => {
  const { txId } = req.body;

  if (!txId || typeof txId !== 'string') {
    res.status(400).json({ error: 'txId is required' });
    return;
  }

  if (!TX_ID_PATTERN.test(txId)) {
    res.status(400).json({ error: 'Invalid transaction ID format' });
    return;
  }

  try {
    const result = await runVerification({ txId });
    saveResult(result);
    res.json(result);
  } catch (error) {
    logger.error({ error, txId }, 'Verification failed');
    res.status(500).json({ error: 'Verification failed' });
  }
});

/**
 * GET /api/v1/verify/tx/:txId
 * Returns all cached verification results for a transaction ID (most recent first).
 */
router.get('/tx/:txId', (req, res) => {
  const { txId } = req.params;

  if (!TX_ID_PATTERN.test(txId)) {
    res.status(400).json({ error: 'Invalid transaction ID format' });
    return;
  }

  const results = getResultsByTxId(txId);
  res.json({ txId, count: results.length, results });
});

/**
 * GET /api/v1/verify/:id
 * Returns a cached verification result by verification ID.
 */
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const result = getResultById(id);

  if (!result) {
    res.status(404).json({ error: 'Verification result not found' });
    return;
  }

  res.json(result);
});

/**
 * GET /api/v1/verify/:id/pdf
 * Generates and returns a PDF attestation certificate.
 */
router.get('/:id/pdf', async (req, res) => {
  const { id } = req.params;
  const result = getResultById(id);

  if (!result) {
    res.status(404).json({ error: 'Verification result not found' });
    return;
  }

  try {
    const pdfBytes = await generatePdf(result);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="verify-${result.txId.substring(0, 8)}-${id}.pdf"`
    );
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    logger.error({ error, id }, 'PDF generation failed');
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

export default router;
