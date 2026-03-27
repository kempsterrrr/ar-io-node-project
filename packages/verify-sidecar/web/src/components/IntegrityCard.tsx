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
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="mb-3 text-sm font-medium text-gray-500">Is the data intact?</h3>
      {tier === 'full' && integrity.status === 'verified' ? (
        <>
          <div className="flex items-center gap-2">
            <span className="text-xl text-green-600">&#10003;</span>
            <span className="font-medium text-green-700">SHA-256 hash match confirmed</span>
          </div>
          {integrity.hash && (
            <p className="mt-2 break-all font-mono text-xs text-gray-500">{integrity.hash}</p>
          )}
        </>
      ) : (
        <div>
          <p className="text-amber-700">
            Data integrity verification unavailable - this gateway has not indexed this data.
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Full verification requires the data to be indexed by this gateway.
          </p>
        </div>
      )}
    </div>
  );
}
