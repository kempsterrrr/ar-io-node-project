interface Props {
  owner: {
    address: string | null;
    signatureValid: boolean | null;
  };
}

export default function OwnerCard({ owner }: Props) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="mb-3 text-sm font-medium text-gray-500">Who signed it?</h3>
      {owner.address ? (
        <>
          <p className="break-all font-mono text-sm text-gray-900">{owner.address}</p>
          <p className="mt-2 text-sm">
            {owner.signatureValid === true ? (
              <span className="text-green-600">Signature verified as valid</span>
            ) : owner.signatureValid === false ? (
              <span className="text-red-600">Signature verification failed</span>
            ) : (
              <span className="text-gray-400">Signature verification pending (Phase 2)</span>
            )}
          </p>
        </>
      ) : (
        <p className="text-gray-400">Owner information unavailable</p>
      )}
    </div>
  );
}
