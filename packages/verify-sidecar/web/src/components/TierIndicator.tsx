interface Props {
  tier: 'full' | 'basic';
}

export default function TierIndicator({ tier }: Props) {
  if (tier === 'full') {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">&#10003;</span>
          <div>
            <h2 className="font-semibold text-green-800">Full Verification (Tier 1)</h2>
            <p className="text-sm text-green-700">
              This data has been independently indexed and cryptographically verified by this
              gateway.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-2">
        <span className="text-2xl">&#9888;</span>
        <div>
          <h2 className="font-semibold text-amber-800">Basic Verification (Tier 2)</h2>
          <p className="text-sm text-amber-700">
            This gateway has not independently indexed this data. Existence, block confirmation, and
            authorship have been verified. Data integrity verification is unavailable.
          </p>
        </div>
      </div>
    </div>
  );
}
