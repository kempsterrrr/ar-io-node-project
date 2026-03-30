interface Props {
  integrity: {
    status: 'verified' | 'unavailable';
    hash: string | null;
    match: boolean | null;
  };
  tier: 'full' | 'basic';
}

export default function IntegrityCard({ integrity, tier }: Props) {
  return (
    <div className="rounded-lg border border-ario-stroke-mid bg-ario-surface p-5">
      <h3 className="mb-3 text-sm font-medium text-ario-text-low">Is the data intact?</h3>
      {tier === 'full' && integrity.status === 'verified' ? (
        <>
          <div className="flex items-center gap-2">
            <span className="text-xl text-ario-success">&#10003;</span>
            <span className="font-medium text-ario-success">SHA-256 hash match confirmed</span>
          </div>
          {integrity.hash && (
            <p className="mt-2 break-all font-mono text-xs text-ario-text-low">{integrity.hash}</p>
          )}
        </>
      ) : (
        <div>
          <p className="text-ario-warning">
            Data integrity verification unavailable - this gateway has not indexed this data.
          </p>
          <p className="mt-2 text-sm text-ario-text-low">
            Full verification requires the data to be indexed by this gateway.
          </p>
        </div>
      )}
    </div>
  );
}
