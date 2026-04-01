import type { VerificationResult } from '../types.js';

export const METHODOLOGY_VERIFIED = `This certificate documents the results of independent cryptographic verification \
performed on data stored on the Arweave blockweave. The data identified by this \
transaction was verified by: (1) confirming transaction existence on the blockchain, \
(2) downloading the raw data and computing its SHA-256 fingerprint, and \
(3) verifying the RSA-PSS cryptographic signature against the deep hash of the data, \
proving the stated owner signed this exact data. All stated facts are the result of \
mathematical computation and cryptographic proof. This service does not make interpretive \
claims about the data's meaning, purpose, or compliance with any particular regulation.`;

export const METHODOLOGY_BASIC = `This certificate documents the results of a verification performed on data \
stored on the Arweave blockweave. The scope of verification was limited because \
either the data has not been fully indexed by this gateway or the full public key \
was not available for signature verification. All stated facts are the result of \
cryptographic proof or direct blockchain query. This service does not make interpretive \
claims about the data's meaning, purpose, or compliance with any particular regulation.`;

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

export function authenticityStatement(
  auth: VerificationResult['authenticity'],
  owner: VerificationResult['owner']
): string {
  const parts: string[] = [];

  if (auth.status === 'signature_verified') {
    parts.push('Data Authenticity: VERIFIED.');
    parts.push(
      'The RSA-PSS cryptographic signature has been verified against the deep hash of this data item.'
    );
    parts.push(
      'This confirms the stated owner signed this exact data and it has not been modified since.'
    );
  } else if (auth.status === 'hash_verified') {
    parts.push('Data Authenticity: PARTIALLY VERIFIED.');
    parts.push(`SHA-256 fingerprint independently computed: ${auth.dataHash}.`);
    if (auth.signatureSkipReason) {
      parts.push(`Signature verification was not performed: ${auth.signatureSkipReason}.`);
    }
  } else {
    parts.push(
      'Data Authenticity: UNVERIFIED. Neither signature nor hash verification could be performed.'
    );
  }

  if (owner.address) {
    const addrNote = owner.addressVerified ? ' (address derived from public key via SHA-256)' : '';
    parts.push(`Owner: ${owner.address}${addrNote}.`);
  }

  return parts.join(' ');
}

export function bundleStatement(isBundled: boolean, rootTxId: string | null): string {
  if (!isBundled || !rootTxId) return '';
  return `Bundle: This is an ANS-104 bundled data item. Its signature and integrity are verified independently. It is anchored to the Arweave blockchain via root transaction ${rootTxId}.`;
}

export function gatewayAssessmentStatement(
  assessment: VerificationResult['gatewayAssessment'],
  checksPass?: boolean
): string {
  const parts: string[] = [];

  if (!checksPass) {
    if (assessment.verified === true) parts.push('data verified');
    else if (assessment.verified === false) parts.push('data not yet verified');
    if (assessment.stable === true) parts.push('block stable');
    else if (assessment.stable === false) parts.push('block not yet stable');
  }

  if (assessment.trusted === true) parts.push('trusted source');
  if (assessment.hops !== null) parts.push(`${assessment.hops} hop(s)`);

  if (parts.length === 0) return '';
  return `Gateway Assessment: The serving gateway reports: ${parts.join(', ')}.`;
}
