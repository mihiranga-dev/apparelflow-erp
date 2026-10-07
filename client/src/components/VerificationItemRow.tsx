import { useState } from "react";
import type { ComponentStatus, VerificationItemDto } from "@apparelflow/shared";
import { Input } from "@/components/ui/input";
import { TrafficLight } from "./TrafficLight";

interface VerificationItemRowProps {
  item: VerificationItemDto;
  componentName: string;
  piecesPerGarment: number;
  disabled: boolean;
  onSave: (itemId: number, actualQty: number) => Promise<void>;
}

export function VerificationItemRow({
  item,
  componentName,
  piecesPerGarment,
  disabled,
  onSave,
}: VerificationItemRowProps) {
  // Local buffer so typing does not fire a request per keystroke.
  const [draft, setDraft] = useState<string>(
    item.actualQty === null ? "" : String(item.actualQty),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty =
    draft !== (item.actualQty === null ? "" : String(item.actualQty));

  function handleChange(v: string) {
    setError(null);
    // Only digits allowed. Rejects "-", ".", "e", letters, empty-with-spaces.
    if (v !== "" && !/^\d+$/.test(v)) {
      setError("Whole numbers only");
      return;
    }
    setDraft(v);
  }

  async function commit() {
    if (!isDirty) return;
    if (draft === "") {
      setError("Count is required");
      return;
    }

    const n = Number(draft);
    if (!Number.isInteger(n) || n < 0) {
      setError("Must be a non-negative whole number");
      return;
    }

    setSaving(true);
    try {
      await onSave(item.id, n);
    } catch {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  }

  // Live preview of the traffic light for the draft value, so the verifier
  // sees the color change before committing. Server still owns truth.
  const previewStatus: ComponentStatus | null =
    draft === ""
      ? item.status
      : Number(draft) === item.expectedQty
        ? "GREEN"
        : Number(draft) > item.expectedQty
          ? "YELLOW"
          : "RED";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-12 items-start sm:items-center gap-2 sm:gap-3 py-3 border-b last:border-b-0">
      <div className="col-span-1 sm:col-span-5">
        <p className="text-sm font-medium text-foreground">{componentName}</p>
        <p className="text-xs text-muted-foreground">
          {piecesPerGarment} pcs / garment
        </p>
      </div>

      <div className="col-span-1 sm:col-span-2 sm:text-right">
        <p className="font-mono text-sm">{item.expectedQty}</p>
        <p className="text-xs text-muted-foreground">expected</p>
      </div>

      <div className="col-span-1 sm:col-span-3">
        <Input
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commit();
          }}
          placeholder={disabled ? "—" : "count"}
          inputMode="numeric"
          disabled={disabled || saving}
          aria-invalid={Boolean(error)}
        />
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
        {isDirty && !error && (
          <p className="text-xs text-muted-foreground mt-1">
            Press Enter or click away to save
          </p>
        )}
      </div>

      <div className="col-span-1 sm:col-span-2 flex sm:justify-end">
        <TrafficLight status={previewStatus} />
      </div>
    </div>
  );
}
