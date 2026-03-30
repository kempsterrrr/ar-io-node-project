import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { verifyTransaction } from '../api/client';
import ProgressIndicator from '../components/ProgressIndicator';

export default function VerifyInput() {
  const [txId, setTxId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  const handleVerify = async () => {
    const trimmed = txId.trim();
    if (!trimmed) {
      setError('Please enter a transaction ID');
      return;
    }
    if (!/^[a-zA-Z0-9_-]{43}$/.test(trimmed)) {
      setError('Invalid transaction ID format (expected 43 base64url characters)');
      return;
    }

    setLoading(true);
    setError(null);
    setStep(0);

    const stepInterval = setInterval(() => {
      setStep((s) => Math.min(s + 1, 4));
    }, 800);

    try {
      const result = await verifyTransaction(trimmed);
      clearInterval(stepInterval);
      navigate(`/report/${result.verificationId}`);
    } catch (err) {
      clearInterval(stepInterval);
      setError(err instanceof Error ? err.message : 'Verification failed');
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-lg border border-ario-stroke-mid bg-ario-surface p-8">
        <h1 className="mb-2 text-2xl font-bold text-ario-text-high">Verify Arweave Data</h1>
        <p className="mb-6 text-ario-text-mid">
          Enter a transaction ID to produce cryptographic proof of existence, integrity, and
          authorship.
        </p>

        <div className="space-y-4">
          <div>
            <label htmlFor="txId" className="mb-1 block text-sm font-medium text-ario-text-mid">
              Transaction ID
            </label>
            <input
              id="txId"
              type="text"
              value={txId}
              onChange={(e) => setTxId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && handleVerify()}
              placeholder="e.g. 4jBV3ofWh41KhuTs2pFvj-KBZWUkbrbCYlJH0vLA6LM"
              className="w-full rounded-md border border-ario-divider bg-ario-bg px-4 py-2.5 font-mono text-sm text-ario-text-high placeholder-ario-text-low focus:border-ario-success focus:outline-none focus:ring-1 focus:ring-ario-success"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="rounded-md border border-ario-error/30 bg-ario-error/10 p-3 text-sm text-ario-error">
              {error}
            </div>
          )}

          <button
            onClick={handleVerify}
            disabled={loading}
            className="w-full rounded-md bg-ario-success px-4 py-2.5 font-semibold text-white hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-ario-success focus:ring-offset-2 focus:ring-offset-ario-bg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Verify'}
          </button>
        </div>

        {loading && (
          <div className="mt-6">
            <ProgressIndicator step={step} />
          </div>
        )}
      </div>
    </div>
  );
}
