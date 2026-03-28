export interface VerificationResult {
  verificationId: string;
  timestamp: string;
  txId: string;
  tier: 'full' | 'basic';
  existence: {
    status: 'confirmed' | 'pending' | 'not_found';
    blockHeight: number | null;
    blockTimestamp: string | null;
    blockId: string | null;
    confirmations: number | null;
  };
  owner: {
    address: string | null;
    publicKey: string | null;
    signatureValid: boolean | null;
  };
  integrity: {
    status: 'verified' | 'unavailable';
    hash: string | null;
    onChainDigest: string | null;
    match: boolean | null;
    deepVerification: boolean;
  };
  metadata: {
    dataSize: number | null;
    contentType: string | null;
    tags: Array<{ name: string; value: string }>;
  };
  bundle: {
    isBundled: boolean;
    rootTransactionId: string | null;
  };
  links: {
    dashboard: string | null;
    pdf: string | null;
    rawData: string | null;
  };
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export async function verifyTransaction(txId: string): Promise<VerificationResult> {
  const res = await fetch(`${BASE}/api/v1/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getVerification(id: string): Promise<VerificationResult> {
  const res = await fetch(`${BASE}/api/v1/verify/${id}`);
  if (!res.ok) {
    throw new Error(`Verification not found`);
  }
  return res.json();
}

export function getPdfUrl(id: string): string {
  return `${BASE}/api/v1/verify/${id}/pdf`;
}
