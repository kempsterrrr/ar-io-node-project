interface Props {
  owner: {
    address: string | null;
    signatureValid: boolean | null;
  };
}

export default function OwnerCard({ owner }: Props) {
  return (
    <div className="rounded-lg border border-ario-stroke-mid bg-ario-surface p-5">
      <h3 className="mb-3 text-sm font-medium text-ario-text-low">Who signed it?</h3>
      {owner.address ? (
        <>
          <p className="break-all font-mono text-sm text-ario-text-high">{owner.address}</p>
          <p className="mt-2 text-sm">
            {owner.signatureValid === true ? (
              <span className="text-ario-success">Signature verified as valid</span>
            ) : owner.signatureValid === false ? (
              <span className="text-ario-error">Signature verification failed</span>
            ) : (
              <span className="text-ario-text-low">Signature not verified</span>
            )}
          </p>
        </>
      ) : (
        <p className="text-ario-text-low">Owner information unavailable</p>
      )}
    </div>
  );
}
