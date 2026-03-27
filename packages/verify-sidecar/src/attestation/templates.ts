export const METHODOLOGY_TIER_1 = `This certificate documents the results of independent cryptographic verification \
performed on data stored on the Arweave blockweave. The data identified by this \
transaction was independently indexed and verified by this gateway instance. \
Verification was performed by computing SHA-256 cryptographic hashes of the stored \
data and comparing them against hashes recorded on-chain at the time of storage. \
All stated facts are the result of mathematical computation and cryptographic proof. \
This service does not make interpretive claims about the data's meaning, purpose, \
or compliance with any particular regulation or requirement.`;

export const METHODOLOGY_TIER_2 = `This certificate documents the results of a basic verification performed on data \
stored on the Arweave blockweave. The data identified by this transaction has not \
been independently indexed by this gateway instance, which limits the scope of \
verification. Transaction existence, block confirmation, and authorship have been \
verified. Data integrity verification (SHA-256 hash comparison) was not performed, \
as this requires the data to be indexed by the verifying gateway. All stated facts \
are the result of cryptographic proof or direct blockchain query. This service does \
not make interpretive claims about the data's meaning, purpose, or compliance with \
any particular regulation or requirement.`;

export function existenceStatement(
  txId: string,
  blockHeight: number | null,
  blockTimestamp: string | null
): string {
  if (!blockHeight) {
    return `Transaction Existence: Arweave Transaction ${txId} was not found or is pending confirmation.`;
  }
  const ts = blockTimestamp ? ` at ${blockTimestamp}` : '';
  return `Transaction Existence: Arweave Transaction ${txId} exists on the Arweave blockweave, confirmed in block ${blockHeight.toLocaleString()}${ts}.`;
}

export function authorshipStatement(
  address: string | null,
  signatureValid: boolean | null
): string {
  if (!address) {
    return 'Authorship: Owner information unavailable.';
  }
  const sigStatus =
    signatureValid === true
      ? "The cryptographic signature has been verified as valid against the owner's public key."
      : signatureValid === false
        ? 'The cryptographic signature verification FAILED.'
        : 'Signature verification was not performed.';
  return `Authorship: The transaction was signed by wallet address ${address}. ${sigStatus}`;
}

export function integrityStatement(tier: 'full' | 'basic', hash: string | null): string {
  if (tier === 'full' && hash) {
    return `Data Integrity: The SHA-256 hash of the stored data is ${hash}. This matches the hash recorded on-chain, confirming the data has not been altered since storage.`;
  }
  return 'Data Integrity: NOT VERIFIED - this gateway has not independently indexed this data. Data integrity verification requires the data to be indexed by the verifying gateway.';
}

export function bundleStatement(isBundled: boolean, rootTxId: string | null): string {
  if (!isBundled || !rootTxId) return '';
  return `Bundle: This data item is stored inside a bundle. It is anchored to the Arweave blockchain via root transaction ${rootTxId}.`;
}
