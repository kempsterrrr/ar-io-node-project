import type { VerificationResult } from '../api/client';

interface Props {
  result: VerificationResult;
}

interface Step {
  label: string;
  detail: string | null;
  status: 'complete' | 'partial' | 'unavailable';
}

function buildSteps(result: VerificationResult): Step[] {
  const steps: Step[] = [];

  // 1. Origin / Authorship
  steps.push({
    label: 'Signed',
    detail: result.authenticity.signatureValid
      ? 'Signature verified'
      : result.owner.address
        ? 'Owner identified'
        : 'Unknown',
    status: result.authenticity.signatureValid
      ? 'complete'
      : result.owner.address
        ? 'partial'
        : 'unavailable',
  });

  // 2. Bundle (if applicable)
  if (result.bundle.isBundled) {
    steps.push({
      label: 'Bundled',
      detail: 'In a bundle',
      status: 'complete',
    });
  }

  // 3. Block confirmation
  steps.push({
    label: 'Confirmed',
    detail: result.existence.blockHeight
      ? `Block ${result.existence.blockHeight.toLocaleString()}`
      : result.existence.status === 'pending'
        ? 'Pending'
        : 'Not found',
    status:
      result.existence.status === 'confirmed'
        ? 'complete'
        : result.existence.status === 'pending'
          ? 'partial'
          : 'unavailable',
  });

  // 4. Gateway delivery
  const hops = result.gatewayAssessment.hops;
  steps.push({
    label: 'Delivered',
    detail: hops !== null ? `${hops} hop${hops !== 1 ? 's' : ''}` : 'Gateway',
    status: hops !== null ? 'complete' : 'partial',
  });

  // 5. Verification
  steps.push({
    label: 'Verified',
    detail:
      result.authenticity.status === 'signature_verified'
        ? 'Authentic'
        : result.authenticity.status === 'hash_verified'
          ? 'Hash match'
          : 'Unverified',
    status:
      result.authenticity.status === 'signature_verified'
        ? 'complete'
        : result.authenticity.status === 'hash_verified'
          ? 'partial'
          : 'unavailable',
  });

  return steps;
}

const STATUS_DOT: Record<Step['status'], string> = {
  complete: 'bg-ario-primary',
  partial: 'bg-ario-primary/60',
  unavailable: 'bg-ario-black/20',
};

const STATUS_LINE: Record<Step['status'], string> = {
  complete: 'bg-ario-primary',
  partial: 'bg-ario-primary/30',
  unavailable: 'bg-ario-black/10',
};

export default function ProvenanceChain({ result }: Props) {
  const steps = buildSteps(result);

  return (
    <div className="rounded-2xl border border-ario-border bg-ario-card p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-medium text-ario-black/50">Provenance chain</h3>
      <div className="flex items-start gap-0">
        {steps.map((step, i) => (
          <div key={i} className="flex flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              {i > 0 && <div className={`h-0.5 flex-1 ${STATUS_LINE[step.status]}`} />}
              <div
                className={`relative z-10 h-3 w-3 shrink-0 rounded-full ${STATUS_DOT[step.status]}`}
              />
              {i < steps.length - 1 && (
                <div className={`h-0.5 flex-1 ${STATUS_LINE[steps[i + 1].status]}`} />
              )}
            </div>
            <p className="mt-2 text-xs font-semibold text-ario-black/70">{step.label}</p>
            {step.detail && (
              <p className="mt-0.5 text-[10px] leading-tight text-ario-black/40">{step.detail}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
