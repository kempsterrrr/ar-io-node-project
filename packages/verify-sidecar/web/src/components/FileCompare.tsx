import { useState, useCallback } from 'react';

interface Props {
  integrityHash: string | null;
}

function bufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export default function FileCompare({ integrityHash }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<{
    fileName: string;
    fileHash: string;
    match: boolean;
  } | null>(null);
  const [hashing, setHashing] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      if (!integrityHash) return;
      setHashing(true);
      setResult(null);
      try {
        const buf = await file.arrayBuffer();
        const hashBuf = await crypto.subtle.digest('SHA-256', buf);
        const fileHash = bufferToBase64Url(hashBuf);
        setResult({
          fileName: file.name,
          fileHash,
          match: fileHash === integrityHash,
        });
      } finally {
        setHashing(false);
      }
    },
    [integrityHash]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  if (!integrityHash) return null;

  return (
    <div className="rounded-2xl border border-ario-border bg-ario-card p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-medium text-ario-black/50">Compare local file</h3>
      <div
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-colors ${
          dragOver ? 'border-ario-primary bg-ario-primary/5' : 'border-ario-black/15 bg-white'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {hashing ? (
          <div className="flex items-center gap-2 text-sm text-ario-black/50">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-ario-primary border-t-transparent" />
            Computing SHA-256...
          </div>
        ) : result ? (
          <div className="w-full space-y-2 text-center">
            <p className="text-sm text-ario-black/60">{result.fileName}</p>
            {result.match ? (
              <div className="flex items-center justify-center gap-1.5 text-green-700">
                <span className="text-lg">&#10003;</span>
                <span className="font-semibold">Hash match confirmed</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-1.5 text-red-700">
                <span className="text-lg">&#10007;</span>
                <span className="font-semibold">Hash mismatch</span>
              </div>
            )}
            <p className="break-all font-mono text-xs text-ario-black/40">
              File: {result.fileHash}
            </p>
            <p className="break-all font-mono text-xs text-ario-black/40">
              On-chain: {integrityHash}
            </p>
            <button
              onClick={() => setResult(null)}
              className="mt-1 text-xs text-ario-primary hover:underline"
            >
              Compare another file
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-ario-black/50">
              Drop a file to check if it matches the stored version
            </p>
            <label className="mt-2 cursor-pointer text-xs text-ario-primary hover:underline">
              or choose a file
              <input type="file" className="hidden" onChange={onFileInput} />
            </label>
          </>
        )}
      </div>
    </div>
  );
}
