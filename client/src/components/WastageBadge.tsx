interface WastageBadgeProps {
  wastagePct: number;
  wastageCap: number;
}

/**
 * Wastage indicator. Red when over the recipe cap, amber when approaching
 * (within 20% of the cap), muted-green otherwise.
 */
export function WastageBadge({ wastagePct, wastageCap }: WastageBadgeProps) {
  const overCap = wastagePct > wastageCap;
  const nearCap = !overCap && wastagePct > wastageCap * 0.8;

  const cls = overCap
    ? "bg-red-100 border-red-300 text-red-900"
    : nearCap
      ? "bg-amber-100 border-amber-300 text-amber-900"
      : "bg-emerald-100 border-emerald-300 text-emerald-900";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {wastagePct.toFixed(2)}% wastage
      {overCap && (
        <span className="text-xs">· over cap ({wastageCap.toFixed(2)}%)</span>
      )}
    </span>
  );
}
