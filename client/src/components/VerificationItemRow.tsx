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
  /** Notifies the parent whenever this row's unsaved state changes. */
  onDirtyChange: (itemId: number, isDirty: boolean) => void;
}

export function VerificationItemRow({
  item,
  componentName,
  piecesPerGarment,
  disabled,
  onSave,
  onDirtyChange,
}: VerificationItemRowProps) {
  const savedString = item.actualQty === null ? "" : String(item.actualQty);
  const [draft, setDraft] = useState<string>(savedString);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty = draft !== savedString;

  function handleChange(v: string) {
    setError(null);
    // Only digits. Rejects "-", ".", "e", letters, leading spaces.
    if (v !== "" && !/^\d+$/.test(v)) {
      setError("Whole numbers only");
      return;
    }
    setDraft(v);
    // Report dirtiness based on the NEW value vs the server-saved value.
    onDirtyChange(item.id, v !== savedString);
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
      // Save succeeded — parent's optimistic update refreshed item prop and
      // this row is no longer dirty.
      onDirtyChange(item.id, false);
      setError(null);
    } catch {
      setError("Save failed");
      // Row remains dirty; approve stays blocked until the save succeeds.
    } finally {
      setSaving(false);
    }
  }

  /**
   * Traffic-light preview. Reflects the DRAFT value — never the stale saved
   * status — so an emptied input commits to Uncounted immediately, and an
   * out-of-sync count shows the user what they're actually about to submit.
   */
  const previewStatus: ComponentStatus | null =
    draft === ""
      ? null // ← Uncounted (fixes Bug A)
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
          aria-invalid={Boolean(error) || (isDirty && draft === "")}
        />
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
        {isDirty && !error && (
          <p className="text-xs text-amber-700 mt-1">
            Unsaved — press Enter or click away
          </p>
        )}
      </div>

      <div className="col-span-1 sm:col-span-2 flex sm:justify-end">
        <TrafficLight status={previewStatus} />
      </div>
    </div>
  );
}
