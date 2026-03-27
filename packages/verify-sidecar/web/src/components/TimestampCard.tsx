interface Props {
  existence: {
    status: string;
    blockTimestamp: string | null;
  };
}

export default function TimestampCard({ existence }: Props) {
  if (!existence.blockTimestamp) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-medium text-gray-500">When was it confirmed?</h3>
        <p className="text-gray-400">Timestamp unavailable</p>
      </div>
    );
  }

  const date = new Date(existence.blockTimestamp);
  const utc = date.toUTCString();
  const local = date.toLocaleString();

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="mb-3 text-sm font-medium text-gray-500">When was it confirmed?</h3>
      <p className="font-medium text-gray-900">{utc}</p>
      <p className="mt-1 text-sm text-gray-500">Local: {local}</p>
    </div>
  );
}
