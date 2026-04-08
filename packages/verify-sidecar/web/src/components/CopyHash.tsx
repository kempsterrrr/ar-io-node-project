import { useState, useCallback } from 'react';

interface Props {
  value: string;
  label?: string;
  truncate?: boolean;
  href?: string;
}

export default function CopyHash({ value, label, truncate = true, href }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      navigator.clipboard.writeText(value).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    },
    [value]
  );

  const display =
    truncate && value.length > 20
      ? `${value.substring(0, 12)}...${value.substring(value.length - 6)}`
      : value;

  return (
    <span className="group inline-flex items-center gap-1.5">
      {label && <span className="text-ario-black/40">{label}</span>}
      <button
        onClick={handleCopy}
        className="break-all font-mono text-ario-black/60 transition-colors hover:text-ario-primary"
        title="Click to copy"
      >
        {display}
      </button>
      <span
        className={`text-[10px] transition-opacity ${copied ? 'text-green-600 opacity-100' : 'text-ario-black/30 opacity-0 group-hover:opacity-100'}`}
      >
        {copied ? 'Copied' : 'Copy'}
      </span>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-ario-black/30 opacity-0 transition-opacity hover:text-ario-primary group-hover:opacity-100"
          title="View on Viewblock"
        >
          &#8599;
        </a>
      )}
    </span>
  );
}
