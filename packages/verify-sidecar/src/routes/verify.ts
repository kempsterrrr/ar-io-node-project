import { Router } from 'express';
import multer from 'multer';
import { runVerification } from '../pipeline/orchestrator.js';
import { saveResult, getResultById } from '../storage/cache.js';
import { generatePdf } from '../attestation/pdf-generator.js';
import { triggerIndexing } from '../pipeline/on-demand-index.js';
import { logger } from '../utils/logger.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const TX_ID_PATTERN = /^[a-zA-Z0-9_-]{43}$/;

/**
 * POST /api/v1/verify
 * Primary verification endpoint.
 * Accepts application/json (txId only) or multipart/form-data (txId + files + receipt).
 */
router.post('/', upload.array('files', 10), async (req, res) => {
  const txId = req.body?.txId;

  if (!txId || typeof txId !== 'string') {
    res.status(400).json({ error: 'txId is required' });
    return;
  }

  if (!TX_ID_PATTERN.test(txId)) {
    res.status(400).json({ error: 'Invalid transaction ID format' });
    return;
  }

  // Collect uploaded files (if any)
  const files = (req.files as Express.Multer.File[]) ?? [];

  // Parse receipt JSON (if provided as string in body)
  let receipt: Record<string, unknown> | undefined;
  if (req.body?.receipt) {
    try {
      receipt =
        typeof req.body.receipt === 'string' ? JSON.parse(req.body.receipt) : req.body.receipt;
    } catch {
      res.status(400).json({ error: 'Invalid receipt JSON' });
      return;
    }
  }

  try {
    const result = await runVerification({ txId, files, receipt });
    saveResult(result);
    res.json(result);
  } catch (error) {
    logger.error({ error, txId }, 'Verification failed');
    res.status(500).json({ error: 'Verification failed' });
  }
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
 * POST /api/v1/verify/:id/index
 * Trigger on-demand indexing to upgrade a Tier 2 result to Tier 1.
 */
router.post('/:id/index', async (req, res) => {
  const { id } = req.params;
  const cached = getResultById(id);

  if (!cached) {
    res.status(404).json({ error: 'Verification result not found' });
    return;
  }

  if (cached.tier === 'full') {
    res.json({ message: 'Already fully verified', result: cached });
    return;
  }

  try {
    const indexed = await triggerIndexing(cached.txId);
    if (!indexed) {
      res
        .status(202)
        .json({ message: 'Indexing requested but not yet complete. Try again later.' });
      return;
    }

    // Re-run verification to get Tier 1 result
    const upgraded = await runVerification({ txId: cached.txId });
    saveResult(upgraded);
    res.json(upgraded);
  } catch (error) {
    logger.error({ error, id }, 'On-demand indexing failed');
    res.status(500).json({ error: 'Indexing failed' });
  }
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
