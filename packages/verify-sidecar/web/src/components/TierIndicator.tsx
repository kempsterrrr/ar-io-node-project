interface Props {
  tier: 'full' | 'basic';
}

export default function TierIndicator({ tier }: Props) {
  if (tier === 'full') {
    return (
      <div className="rounded-lg border border-ario-success/30 bg-ario-success/10 p-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl text-ario-success">&#10003;</span>
          <div>
            <h2 className="font-semibold text-ario-success">Full Verification (Tier 1)</h2>
            <p className="text-sm text-ario-text-mid">
              This data has been independently indexed and cryptographically verified by this
              gateway.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-ario-warning/30 bg-ario-warning/10 p-4">
      <div className="flex items-center gap-2">
        <span className="text-2xl text-ario-warning">&#9888;</span>
        <div>
          <h2 className="font-semibold text-ario-warning">Basic Verification (Tier 2)</h2>
          <p className="text-sm text-ario-text-mid">
            This gateway has not independently indexed this data. Existence, block confirmation, and
            authorship have been verified. Data integrity verification is unavailable.
          </p>
        </div>
      </div>
    </div>
  );
}
