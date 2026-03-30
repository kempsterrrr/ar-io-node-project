const STEPS = [
  'Locating transaction...',
  'Retrieving metadata...',
  'Verifying data integrity...',
  'Checking signature...',
  'Generating report...',
];

interface Props {
  step: number;
}

export default function ProgressIndicator({ step }: Props) {
  return (
    <div className="space-y-2">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          {i < step ? (
            <span className="text-ario-success">&#10003;</span>
          ) : i === step ? (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-ario-success border-t-transparent" />
          ) : (
            <span className="inline-block h-4 w-4 rounded-full border-2 border-ario-divider" />
          )}
          <span className={i <= step ? 'text-ario-text-high' : 'text-ario-text-low'}>{label}</span>
        </div>
      ))}
    </div>
  );
}
