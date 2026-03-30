interface Props {
  bundle: {
    isBundled: boolean;
    rootTransactionId: string | null;
  };
}

export default function BundleCard({ bundle }: Props) {
  if (!bundle.isBundled) return null;

  return (
    <div className="rounded-lg border border-ario-stroke-mid bg-ario-surface p-5">
      <h3 className="mb-3 text-sm font-medium text-ario-text-low">Is this data inside a bundle?</h3>
      <p className="text-sm text-ario-text-mid">
        This data item is stored inside a bundle. Its integrity is verified independently, and it is
        anchored to the blockchain through the root transaction shown below.
      </p>
      {bundle.rootTransactionId && (
        <p className="mt-2 break-all font-mono text-xs text-ario-text-low">
          Root TX: {bundle.rootTransactionId}
        </p>
      )}
    </div>
  );
}
