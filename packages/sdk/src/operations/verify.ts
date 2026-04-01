import type { VerifyResult } from '../types.js';
import { VerifyClient } from '../clients/verify.js';

export async function executeVerify(
  verifyClient: VerifyClient,
  txId: string
): Promise<VerifyResult> {
  return verifyClient.verify(txId);
}
