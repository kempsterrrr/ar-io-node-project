interface Props {
  metadata: {
    dataSize: number | null;
    contentType: string | null;
    tags: Array<{ name: string; value: string }>;
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function MetadataCard({ metadata }: Props) {
  return (
    <div className="rounded-lg border border-ario-stroke-mid bg-ario-surface p-5">
      <h3 className="mb-3 text-sm font-medium text-ario-text-low">What is this data?</h3>
      <div className="space-y-2">
        {metadata.dataSize !== null && (
          <p className="text-sm text-ario-text-mid">
            <span className="font-medium text-ario-text-high">Size:</span>{' '}
            {formatBytes(metadata.dataSize)}
          </p>
        )}
        {metadata.contentType && (
          <p className="text-sm text-ario-text-mid">
            <span className="font-medium text-ario-text-high">Type:</span> {metadata.contentType}
          </p>
        )}
      </div>
      {metadata.tags.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-ario-success hover:underline">
            {metadata.tags.length} tag{metadata.tags.length !== 1 ? 's' : ''}
          </summary>
          <div className="mt-2 max-h-48 overflow-auto rounded border border-ario-divider bg-ario-bg p-2">
            {metadata.tags.map((tag, i) => (
              <div key={i} className="flex gap-2 py-0.5 text-xs">
                <span className="font-medium text-ario-text-mid">{tag.name}:</span>
                <span className="break-all text-ario-text-low">{tag.value}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
