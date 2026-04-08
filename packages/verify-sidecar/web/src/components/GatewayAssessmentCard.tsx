import { useState } from 'react';
import type { VerificationResult } from '../api/client';

interface Props {
  assessment: VerificationResult['gatewayAssessment'];
}

interface TooltipBadgeProps {
  label: string;
  active: boolean;
  tooltip: string;
}

function TooltipBadge({ label, active, tooltip }: TooltipBadgeProps) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-block">
      <span
        className={`inline-flex cursor-help items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
          active
            ? 'border-green-200 bg-green-100 text-green-800'
            : 'border-ario-black/10 bg-white/60 text-ario-black/40'
        }`}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        {active && <span>&#10003;</span>}
        {label}
      </span>
      {show && (
        <div className="absolute bottom-full left-1/2 z-10 mb-2 w-60 -translate-x-1/2 rounded-xl bg-ario-black px-3 py-2 text-xs leading-relaxed text-white shadow-lg">
          {tooltip}
          <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-ario-black" />
        </div>
      )}
    </div>
  );
}

export default function GatewayAssessmentCard({
  assessment,
  checksPass,
}: Props & { checksPass?: boolean }) {
  const [hopsTooltip, setHopsTooltip] = useState(false);

  const hasAny =
    assessment.trusted !== null ||
    assessment.hops !== null ||
    // Only show verified/stable when our own checks didn't fully pass
    (!checksPass && (assessment.verified !== null || assessment.stable !== null));

  if (!hasAny) return null;

  return (
    <div className="rounded-2xl border border-ario-border bg-ario-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <h3 className="mb-3 text-sm font-medium text-ario-black/50">Gateway signals</h3>
      <div className="flex flex-wrap gap-2">
        {assessment.trusted !== null && (
          <TooltipBadge
            label="Trusted source"
            active={assessment.trusted}
            tooltip="Data came from a known bundler or direct peer. Untrusted data may have been relayed through unknown intermediaries."
          />
        )}
        {!checksPass && assessment.verified !== null && (
          <TooltipBadge
            label="Gateway verified"
            active={assessment.verified}
            tooltip="Whether this gateway has completed its own internal verification. This is a processing flag. Your data may still be fully verified by the checks above."
          />
        )}
        {!checksPass && assessment.stable !== null && (
          <TooltipBadge
            label="Block finalized"
            active={assessment.stable}
            tooltip="Whether the block is considered finalized by this gateway. Recent blocks may not yet be marked stable even though they have many confirmations."
          />
        )}
        {assessment.hops !== null && (
          <div className="relative inline-block">
            <span
              className="inline-flex cursor-help items-center gap-1 rounded-full border border-ario-primary/20 bg-ario-primary/10 px-2.5 py-1 text-xs font-medium text-ario-primary"
              onMouseEnter={() => setHopsTooltip(true)}
              onMouseLeave={() => setHopsTooltip(false)}
            >
              {assessment.hops} hop{assessment.hops !== 1 ? 's' : ''}
            </span>
            {hopsTooltip && (
              <div className="absolute bottom-full left-1/2 z-10 mb-2 w-60 -translate-x-1/2 rounded-xl bg-ario-black px-3 py-2 text-xs leading-relaxed text-white shadow-lg">
                Number of network hops from the data source to this gateway. Fewer hops = more
                direct path.
                <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-ario-black" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
