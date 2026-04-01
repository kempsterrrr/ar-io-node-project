import { useState, useCallback } from 'react';

export default function ShareButton() {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  return (
    <button
      onClick={handleCopy}
      className="rounded-full border border-ario-border bg-white/70 px-4 py-2 text-xs font-semibold text-ario-black transition-colors hover:bg-white"
    >
      {copied ? '\u2713 Link copied' : 'Share report'}
    </button>
  );
}
