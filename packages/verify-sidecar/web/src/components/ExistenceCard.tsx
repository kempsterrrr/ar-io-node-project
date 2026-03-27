interface Props {
  existence: {
    status: 'confirmed' | 'pending' | 'not_found';
    blockHeight: number | null;
    confirmations: number | null;
  };
  txId: string;
}

export default function ExistenceCard({ existence, txId }: Props) {
  const statusColor =
    existence.status === 'confirmed'
      ? 'text-green-600'
      : existence.status === 'pending'
        ? 'text-amber-600'
        : 'text-red-600';

  const statusIcon =
    existence.status === 'confirmed'
      ? '&#10003;'
      : existence.status === 'pending'
        ? '&#8987;'
        : '&#10007;';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="mb-3 text-sm font-medium text-gray-500">Does this data exist on Arweave?</h3>
      <div className="flex items-center gap-2">
        <span
          className={`text-3xl ${statusColor}`}
          dangerouslySetInnerHTML={{ __html: statusIcon }}
        />
        <div>
          <p className={`font-semibold ${statusColor}`}>
            {existence.status === 'confirmed'
              ? 'Confirmed'
              : existence.status === 'pending'
                ? 'Pending'
                : 'Not Found'}
          </p>
          {existence.blockHeight && (
            <p className="text-sm text-gray-600">Block {existence.blockHeight.toLocaleString()}</p>
          )}
          {existence.confirmations !== null && existence.confirmations > 0 && (
            <p className="text-xs text-gray-500">
              {existence.confirmations.toLocaleString()} confirmations
            </p>
          )}
        </div>
      </div>
      <p className="mt-3 break-all font-mono text-xs text-gray-400">{txId}</p>
    </div>
  );
}
