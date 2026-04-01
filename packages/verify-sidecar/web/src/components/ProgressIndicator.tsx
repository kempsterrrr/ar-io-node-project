interface Props {
  elapsed: number; // seconds since verification started
}

export default function ProgressIndicator({ elapsed }: Props) {
  // Real status messages based on actual elapsed time
  // The backend retries /tx/ every 10s up to 60s, then tries /raw/
  let message: string;
  let sub: string | null = null;

  if (elapsed < 3) {
    message = 'Locating transaction...';
  } else if (elapsed < 8) {
    message = 'Retrieving metadata and headers...';
  } else if (elapsed < 15) {
    message = 'Verifying integrity and signature...';
  } else if (elapsed < 30) {
    message = 'Waiting for gateway to index...';
    sub =
      'Your gateway is fetching this data from the network. This can take a moment for new transactions.';
  } else if (elapsed < 60) {
    message = 'Still waiting for gateway indexing...';
    sub = `${Math.round(elapsed)}s elapsed. The gateway is retrieving data from peers.`;
  } else {
    message = 'Finalizing partial result...';
    sub = 'Full metadata may not be available yet. You can re-verify later.';
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-ario-primary border-t-transparent" />
        <span className="font-medium text-ario-black">{message}</span>
      </div>
      {sub && <p className="pl-6 text-xs text-ario-black/40">{sub}</p>}
      {elapsed >= 8 && (
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-ario-black/5">
          <div
            className="h-full rounded-full bg-ario-primary/40 transition-all duration-1000"
            style={{ width: `${Math.min((elapsed / 70) * 100, 95)}%` }}
          />
        </div>
      )}
    </div>
  );
}
