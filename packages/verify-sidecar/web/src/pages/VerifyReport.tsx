import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getVerification, getPdfUrl, type VerificationResult } from '../api/client';
import TierIndicator from '../components/TierIndicator';
import ExistenceCard from '../components/ExistenceCard';
import TimestampCard from '../components/TimestampCard';
import OwnerCard from '../components/OwnerCard';
import IntegrityCard from '../components/IntegrityCard';
import MetadataCard from '../components/MetadataCard';
import BundleCard from '../components/BundleCard';

export default function VerifyReport() {
  const { id } = useParams<{ id: string }>();
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getVerification(id)
      .then(setResult)
      .catch((err) => setError(err.message));
  }, [id]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-lg border border-ario-error/30 bg-ario-error/10 p-8">
          <h2 className="text-lg font-semibold text-ario-error">Verification Not Found</h2>
          <p className="mt-2 text-ario-text-mid">{error}</p>
          <Link to="/" className="mt-4 inline-block text-ario-success hover:underline">
            Verify another transaction
          </Link>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-ario-success border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TierIndicator tier={result.tier} />

      <div className="grid gap-6 md:grid-cols-2">
        <ExistenceCard existence={result.existence} txId={result.txId} />
        <TimestampCard existence={result.existence} />
        <OwnerCard owner={result.owner} />
        <IntegrityCard integrity={result.integrity} tier={result.tier} />
        <MetadataCard metadata={result.metadata} />
        {result.bundle.isBundled && <BundleCard bundle={result.bundle} />}
      </div>

      <div className="flex gap-3">
        <a
          href={getPdfUrl(result.verificationId)}
          className="rounded-md bg-ario-success px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          download
        >
          Download Verification Certificate
        </a>
        <Link
          to="/"
          className="rounded-md border border-ario-divider bg-ario-surface px-4 py-2 text-sm font-medium text-ario-text-mid hover:bg-ario-surface-hover"
        >
          Verify Another
        </Link>
      </div>

      <div className="text-xs text-ario-text-low">
        Verification ID: {result.verificationId} | Generated: {result.timestamp}
      </div>
    </div>
  );
}
