import type { ComponentStatus } from "@apparelflow/shared";

interface TrafficLightProps {
  status: ComponentStatus | null;
}

/**
 * Traffic-light indicator. Color-coded with explicit text labels so the
 * signal is never color-only (accessibility). Contrast tuned for the
 * mandatory contrast audit — dark text on light backgrounds.
 */
export function TrafficLight({ status }: TrafficLightProps) {
  if (status === null) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
        <span className="h-2 w-2 rounded-full bg-gray-400" />
        Uncounted
      </span>
    );
  }

  const map: Record<
    ComponentStatus,
    { bg: string; text: string; dot: string; label: string }
  > = {
    GREEN: {
      bg: "bg-emerald-100 border-emerald-300",
      text: "text-emerald-900",
      dot: "bg-emerald-600",
      label: "Match",
    },
    YELLOW: {
      bg: "bg-amber-100 border-amber-300",
      text: "text-amber-900",
      dot: "bg-amber-500",
      label: "Excess",
    },
    RED: {
      bg: "bg-red-100 border-red-300",
      text: "text-red-900",
      dot: "bg-red-600",
      label: "Shortage",
    },
  };

  const style = map[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}
    >
      <span className={`h-2 w-2 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}
