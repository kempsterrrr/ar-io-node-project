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
      ? 'text-ario-success'
      : existence.status === 'pending'
        ? 'text-ario-warning'
        : 'text-ario-error';

  const statusIcon =
    existence.status === 'confirmed'
      ? '&#10003;'
      : existence.status === 'pending'
        ? '&#8987;'
        : '&#10007;';

  return (
    <div className="rounded-lg border border-ario-stroke-mid bg-ario-surface p-5">
      <h3 className="mb-3 text-sm font-medium text-ario-text-low">
        Does this data exist on Arweave?
      </h3>
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
            <p className="text-sm text-ario-text-mid">
              Block {existence.blockHeight.toLocaleString()}
            </p>
          )}
          {existence.confirmations !== null && existence.confirmations > 0 && (
            <p className="text-xs text-ario-text-low">
              {existence.confirmations.toLocaleString()} confirmations
            </p>
          )}
        </div>
      </div>
      <p className="mt-3 break-all font-mono text-xs text-ario-text-low">{txId}</p>
    </div>
  );
}
