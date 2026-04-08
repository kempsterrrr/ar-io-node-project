import type { VerificationResult } from '../api/client';

interface Props {
  result: VerificationResult;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function contentLabel(ct: string | null): string {
  if (!ct) return 'data';
  if (ct.startsWith('image/')) return ct.replace('image/', '').toUpperCase() + ' image';
  if (ct.startsWith('video/')) return ct.replace('video/', '').toUpperCase() + ' video';
  if (ct === 'application/pdf') return 'PDF document';
  if (ct.startsWith('text/')) return 'text file';
  return 'file';
}

export default function PlainSummary({ result }: Props) {
  const parts: string[] = [];

  const type = contentLabel(result.metadata.contentType);
  const size = result.metadata.dataSize ? ` (${formatSize(result.metadata.dataSize)})` : '';
  parts.push(`This ${type}${size}`);

  if (result.existence.blockTimestamp) {
    parts.push(`was stored on Arweave on ${formatDate(result.existence.blockTimestamp)}`);
  } else if (result.existence.status === 'confirmed') {
    parts.push('is confirmed on Arweave');
  } else {
    parts.push('was found on the Arweave network');
  }

  if (result.owner.address) {
    const addr = result.owner.address;
    const short = `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
    if (result.authenticity.signatureValid) {
      parts.push(`and signed by wallet ${short}`);
    } else {
      parts.push(`by wallet ${short}`);
    }
  }

  if (result.authenticity.status === 'signature_verified') {
    parts.push('and has not been modified since');
  }

  return <p className="text-sm leading-relaxed text-ario-black/70">{parts.join(' ')}.</p>;
}
