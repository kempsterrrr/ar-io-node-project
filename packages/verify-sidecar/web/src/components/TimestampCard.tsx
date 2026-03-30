interface Props {
  existence: {
    status: string;
    blockTimestamp: string | null;
  };
}

export default function TimestampCard({ existence }: Props) {
  if (!existence.blockTimestamp) {
    return (
      <div className="rounded-lg border border-ario-stroke-mid bg-ario-surface p-5">
        <h3 className="mb-3 text-sm font-medium text-ario-text-low">When was it confirmed?</h3>
        <p className="text-ario-text-low">Timestamp unavailable</p>
      </div>
    );
  }

  const date = new Date(existence.blockTimestamp);
  const utc = date.toUTCString();
  const local = date.toLocaleString();

  return (
    <div className="rounded-lg border border-ario-stroke-mid bg-ario-surface p-5">
      <h3 className="mb-3 text-sm font-medium text-ario-text-low">When was it confirmed?</h3>
      <p className="font-medium text-ario-text-high">{utc}</p>
      <p className="mt-1 text-sm text-ario-text-low">Local: {local}</p>
    </div>
  );
}
