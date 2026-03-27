interface Props {
  bundle: {
    isBundled: boolean;
    rootTransactionId: string | null;
  };
}

export default function BundleCard({ bundle }: Props) {
  if (!bundle.isBundled) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="mb-3 text-sm font-medium text-gray-500">Is this data inside a bundle?</h3>
      <p className="text-sm text-gray-700">
        This data item is stored inside a bundle. Its integrity is verified independently, and it is
        anchored to the blockchain through the root transaction shown below.
      </p>
      {bundle.rootTransactionId && (
        <p className="mt-2 break-all font-mono text-xs text-gray-500">
          Root TX: {bundle.rootTransactionId}
        </p>
      )}
    </div>
  );
}
