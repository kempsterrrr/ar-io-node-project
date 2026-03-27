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
      <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Verify Arweave Data</h1>
        <p className="mb-6 text-gray-600">
          Enter a transaction ID to produce cryptographic proof of existence, integrity, and
          authorship.
        </p>

        <div className="space-y-4">
          <div>
            <label htmlFor="txId" className="mb-1 block text-sm font-medium text-gray-700">
              Transaction ID
            </label>
            <input
              id="txId"
              type="text"
              value={txId}
              onChange={(e) => setTxId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && handleVerify()}
              placeholder="e.g. 4jBV3ofWh41KhuTs2pFvj-KBZWUkbrbCYlJH0vLA6LM"
              className="w-full rounded-md border border-gray-300 px-4 py-2.5 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={loading}
            />
          </div>

          {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          <button
            onClick={handleVerify}
            disabled={loading}
            className="w-full rounded-md bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
