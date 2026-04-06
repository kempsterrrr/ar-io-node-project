import type { VerificationResult } from '../api/client';
import { getPdfUrl } from '../api/client';
import PlainSummary from './PlainSummary';
import ShareButton from './ShareButton';

interface Props {
  result: VerificationResult;
  onReverify: () => void;
  reverifying: boolean;
}

type Status = 'pass' | 'partial' | 'fail' | 'unavailable';

function getChecks(r: VerificationResult): { label: string; status: Status }[] {
  return [
    {
      label: 'On-chain',
      status:
        r.existence.status === 'confirmed'
          ? 'pass'
          : r.existence.status === 'pending'
            ? 'partial'
            : 'fail',
    },
    {
      label: 'Authentic',
      status:
        r.authenticity.status === 'signature_verified'
          ? 'pass'
          : r.authenticity.status === 'hash_verified'
            ? 'partial'
            : 'unavailable',
    },
    {
      label: 'Signed',
      status:
        r.authenticity.signatureValid === true
          ? 'pass'
          : r.owner.address
            ? 'partial'
            : 'unavailable',
    },
  ];
}

const PILL_STYLES: Record<Status, string> = {
  pass: 'bg-white/80 text-green-700',
  partial: 'bg-ario-primary/10 text-ario-primary',
  fail: 'bg-white/80 text-red-700',
  unavailable: 'bg-ario-black/5 text-ario-black/25',
};

const PILL_ICONS: Record<Status, string> = {
  pass: '\u2713',
  partial: '\u25CB',
  fail: '\u2717',
  unavailable: '\u2014',
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export default function VerificationHero({ result, onReverify, reverifying }: Props) {
  const level = result.level;
  const checks = getChecks(result);

  const LEVEL_CONFIG = {
    3: {
      border: 'border-green-200',
      bg: 'bg-green-50',
      icon: '\u2713',
      iconColor: 'text-green-600',
      headColor: 'text-green-800',
      textColor: 'text-green-700',
      title: 'Verified',
      desc: 'This data is authentic and untampered. Digital signature confirmed.',
    },
    2: {
      border: 'border-ario-primary/20',
      bg: 'bg-ario-lavender/40',
      icon: '\u2713',
      iconColor: 'text-ario-primary',
      headColor: 'text-ario-primary',
      textColor: 'text-ario-primary/70',
      title: 'Partially Verified',
      desc: 'Data fingerprint confirmed, but the digital signature could not be checked.',
    },
    1: {
      border: 'border-ario-border',
      bg: 'bg-ario-lavender/30',
      icon: '\u25CB',
      iconColor: 'text-ario-black/40',
      headColor: 'text-ario-black/70',
      textColor: 'text-ario-black/50',
      title: 'Pending',
      desc: 'Data found on the network. Full verification will be available once the gateway finishes indexing.',
    },
  };

  const cfg = LEVEL_CONFIG[level];

  return (
    <div className={`rounded-2xl border shadow-sm ${cfg.border} ${cfg.bg} p-6`}>
      {/* Top row: verdict + actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className={`shrink-0 text-3xl ${cfg.iconColor}`}>{cfg.icon}</span>
          <div>
            <h2 className={`font-heading text-xl font-extrabold tracking-tight ${cfg.headColor}`}>
              {cfg.title}
            </h2>
            <p className={`mt-0.5 text-sm ${cfg.textColor}`}>{cfg.desc}</p>
          </div>
        </div>

        {/* Actions — always visible, no scrolling needed */}
        <div className="flex shrink-0 gap-2">
          <a
            href={getPdfUrl(result.verificationId)}
            className="rounded-full bg-ario-black px-4 py-2 text-xs font-semibold text-ario-card transition-opacity hover:opacity-90"
            download
          >
            Certificate
          </a>
          <ShareButton />
          <button
            onClick={onReverify}
            disabled={reverifying}
            className="rounded-full border border-ario-border bg-white/70 px-4 py-2 text-xs font-semibold text-ario-black transition-colors hover:bg-white disabled:opacity-50"
          >
            {reverifying ? 'Verifying...' : 'Re-verify'}
          </button>
        </div>
      </div>

      {/* Trust pills */}
      <div className="mt-4 flex flex-wrap gap-2">
        {checks.map((c) => (
          <span
            key={c.label}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${PILL_STYLES[c.status]}`}
          >
            {PILL_ICONS[c.status]} {c.label}
          </span>
        ))}
      </div>

      {/* Plain-language summary — the a-ha moment */}
      <div className="mt-4">
        <PlainSummary result={result} />
      </div>

      {/* Timestamp */}
      <p className="mt-3 text-[11px] text-ario-black/30">
        Verified {relativeTime(result.timestamp)}
      </p>
    </div>
  );
}
