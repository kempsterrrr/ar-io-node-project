import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib';
import {
  METHODOLOGY_TIER_1,
  METHODOLOGY_TIER_2,
  existenceStatement,
  authorshipStatement,
  integrityStatement,
  bundleStatement,
} from './templates.js';
import type { VerificationResult } from '../types.js';

const MARGIN = 50;
const PAGE_WIDTH = 595; // A4
const PAGE_HEIGHT = 842;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

/**
 * Generate an unsigned PDF attestation certificate for a verification result.
 */
export async function generatePdf(result: VerificationResult): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  // --- Header ---
  y = drawText(page, 'Verification Certificate', fontBold, 20, MARGIN, y, rgb(0.1, 0.1, 0.1));
  y -= 8;

  const tierLabel =
    result.tier === 'full' ? 'Full Verification (Tier 1)' : 'Basic Verification (Tier 2)';
  y = drawText(
    page,
    tierLabel,
    fontBold,
    12,
    MARGIN,
    y,
    result.tier === 'full' ? rgb(0.0, 0.5, 0.0) : rgb(0.7, 0.5, 0.0)
  );
  y -= 16;

  y = drawText(
    page,
    `Verification ID: ${result.verificationId}`,
    fontRegular,
    9,
    MARGIN,
    y,
    rgb(0.3, 0.3, 0.3)
  );
  y -= 4;
  y = drawText(page, `Date: ${result.timestamp}`, fontRegular, 9, MARGIN, y, rgb(0.3, 0.3, 0.3));
  y -= 4;
  y = drawText(page, `Transaction: ${result.txId}`, fontRegular, 9, MARGIN, y, rgb(0.3, 0.3, 0.3));
  y -= 20;

  // --- Divider ---
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });
  y -= 20;

  // --- Methodology ---
  y = drawText(page, 'Methodology', fontBold, 13, MARGIN, y, rgb(0.1, 0.1, 0.1));
  y -= 8;

  const methodology = result.tier === 'full' ? METHODOLOGY_TIER_1 : METHODOLOGY_TIER_2;
  const methodResult = drawWrappedText(
    page,
    doc,
    methodology,
    fontRegular,
    9,
    MARGIN,
    y,
    CONTENT_WIDTH,
    13,
    rgb(0.2, 0.2, 0.2)
  );
  page = methodResult.page;
  y = methodResult.y;
  y -= 20;

  // --- Statement of Facts ---
  y = drawText(page, 'Statement of Facts', fontBold, 13, MARGIN, y, rgb(0.1, 0.1, 0.1));
  y -= 10;

  const facts = [
    existenceStatement(result.txId, result.existence.blockHeight, result.existence.blockTimestamp),
    authorshipStatement(result.owner.address, result.owner.signatureValid),
    integrityStatement(result.tier, result.integrity.hash),
    bundleStatement(result.bundle.isBundled, result.bundle.rootTransactionId),
  ].filter(Boolean);

  for (const fact of facts) {
    if (y < MARGIN + 60) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    const factResult = drawWrappedText(
      page,
      doc,
      fact,
      fontRegular,
      9,
      MARGIN,
      y,
      CONTENT_WIDTH,
      13,
      rgb(0.15, 0.15, 0.15)
    );
    page = factResult.page;
    y = factResult.y;
    y -= 12;
  }
  y -= 8;

  // --- Evidence Summary Table ---
  if (y < MARGIN + 160) {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  }

  y = drawText(page, 'Evidence Summary', fontBold, 13, MARGIN, y, rgb(0.1, 0.1, 0.1));
  y -= 14;

  const rows = buildEvidenceRows(result);
  // Table header
  y = drawTableRow(
    page,
    fontBold,
    9,
    MARGIN,
    y,
    ['Check', 'Result', 'Detail'],
    [160, 80, CONTENT_WIDTH - 240],
    rgb(0.9, 0.9, 0.9)
  );

  for (const row of rows) {
    if (y < MARGIN + 30) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    y = drawTableRow(page, fontRegular, 8, MARGIN, y, row, [160, 80, CONTENT_WIDTH - 240], null);
  }
  y -= 20;

  // --- Cryptographic Proof Appendix ---
  if (y < MARGIN + 120) {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  }

  y = drawText(page, 'Cryptographic Proof Appendix', fontBold, 13, MARGIN, y, rgb(0.1, 0.1, 0.1));
  y -= 10;

  const appendixLines = [
    `Transaction ID: ${result.txId}`,
    `Verification Tier: ${result.tier === 'full' ? 'Full (Tier 1)' : 'Basic (Tier 2)'}`,
    result.existence.blockHeight ? `Block Height: ${result.existence.blockHeight}` : null,
    result.existence.blockId ? `Block ID: ${result.existence.blockId}` : null,
    result.existence.blockTimestamp ? `Block Timestamp: ${result.existence.blockTimestamp}` : null,
    result.owner.address ? `Owner Address: ${result.owner.address}` : null,
    result.integrity.hash ? `SHA-256 Data Hash: ${result.integrity.hash}` : null,
  ].filter(Boolean) as string[];

  for (const line of appendixLines) {
    if (y < MARGIN + 20) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    y = drawText(page, line, fontRegular, 8, MARGIN, y, rgb(0.3, 0.3, 0.3));
    y -= 4;
  }

  // Tags
  if (result.metadata.tags.length > 0) {
    y -= 8;
    if (y < MARGIN + 20) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    y = drawText(page, 'Transaction Tags:', fontBold, 8, MARGIN, y, rgb(0.3, 0.3, 0.3));
    y -= 4;
    for (const tag of result.metadata.tags.slice(0, 20)) {
      if (y < MARGIN + 20) {
        page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
      }
      const tagText = `  ${tag.name}: ${tag.value}`;
      y = drawText(page, tagText.substring(0, 100), fontRegular, 7, MARGIN, y, rgb(0.4, 0.4, 0.4));
      y -= 2;
    }
  }

  return doc.save();
}

function buildEvidenceRows(result: VerificationResult): string[][] {
  const rows: string[][] = [];

  // Existence
  const existStatus =
    result.existence.status === 'confirmed'
      ? 'PASS'
      : result.existence.status === 'pending'
        ? 'PENDING'
        : 'FAIL';
  const existDetail = result.existence.blockHeight
    ? `Block ${result.existence.blockHeight}, ${result.existence.blockTimestamp ?? 'unknown time'}`
    : result.existence.status;
  rows.push(['Transaction exists', existStatus, existDetail]);

  // Integrity
  if (result.tier === 'full') {
    const intStatus = result.integrity.match ? 'PASS' : 'FAIL';
    rows.push([
      'Data integrity',
      intStatus,
      `SHA-256: ${result.integrity.hash?.substring(0, 20) ?? 'N/A'}...`,
    ]);
  } else {
    rows.push(['Data integrity', 'UNAVAILABLE', 'Data not indexed by this gateway']);
  }

  // Signature
  if (result.owner.signatureValid === true) {
    rows.push([
      'Signature valid',
      'PASS',
      `Owner: ${result.owner.address?.substring(0, 16) ?? 'N/A'}...`,
    ]);
  } else if (result.owner.signatureValid === false) {
    rows.push([
      'Signature valid',
      'FAIL',
      `Owner: ${result.owner.address?.substring(0, 16) ?? 'N/A'}...`,
    ]);
  } else {
    rows.push(['Signature valid', 'NOT CHECKED', 'Signature verification not performed']);
  }

  // Bundle
  if (result.bundle.isBundled) {
    rows.push([
      'Bundle anchored',
      'PASS',
      `Root TX: ${result.bundle.rootTransactionId?.substring(0, 16) ?? 'N/A'}...`,
    ]);
  }

  return rows;
}

// --- Drawing helpers ---

function drawText(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  x: number,
  y: number,
  color: ReturnType<typeof rgb>
): number {
  page.drawText(text, { x, y, size, font, color });
  return y - size - 2;
}

function drawWrappedText(
  page: PDFPage,
  doc: PDFDocument,
  text: string,
  font: PDFFont,
  size: number,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  color: ReturnType<typeof rgb>
): { page: PDFPage; y: number } {
  const words = text.split(' ');
  let line = '';
  let currentPage = page;
  let currentY = y;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, size);

    if (width > maxWidth && line) {
      currentPage.drawText(line, { x, y: currentY, size, font, color });
      currentY -= lineHeight;

      if (currentY < MARGIN + 20) {
        currentPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        currentY = PAGE_HEIGHT - MARGIN;
      }
      line = word;
    } else {
      line = testLine;
    }
  }

  if (line) {
    currentPage.drawText(line, { x, y: currentY, size, font, color });
    currentY -= lineHeight;
  }

  return { page: currentPage, y: currentY };
}

function drawTableRow(
  page: PDFPage,
  font: PDFFont,
  size: number,
  startX: number,
  y: number,
  cells: string[],
  colWidths: number[],
  bgColor: ReturnType<typeof rgb> | null
): number {
  const rowHeight = 18;

  if (bgColor) {
    page.drawRectangle({
      x: startX,
      y: y - rowHeight + 4,
      width: colWidths.reduce((a, b) => a + b, 0),
      height: rowHeight,
      color: bgColor,
    });
  }

  let x = startX;
  for (let i = 0; i < cells.length; i++) {
    const cellText = cells[i].substring(0, Math.floor(colWidths[i] / (size * 0.5)));
    page.drawText(cellText, {
      x: x + 4,
      y: y - rowHeight + 8,
      size,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    x += colWidths[i];
  }

  return y - rowHeight;
}
