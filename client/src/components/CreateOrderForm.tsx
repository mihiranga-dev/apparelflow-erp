import { useMemo, useState, type FormEvent } from "react";
import type { CreateOrderRequest, RecipeDto } from "@apparelflow/shared";
import { ApiError } from "@/lib/api";
import { createOrder } from "@/lib/endpoints";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CreateOrderFormProps {
  recipes: RecipeDto[];
  onCreated: () => void;
  onCancel: () => void;
}

interface FormState {
  recipeId: string;
  targetQty: string;
  fabricRollId: string;
  actualFabricYds: string;
}

type FormField = keyof FormState;
type FieldErrors = Partial<Record<FormField, string>>;

const INITIAL: FormState = {
  recipeId: "",
  targetQty: "",
  fabricRollId: "",
  actualFabricYds: "",
};

// Only digits. Used to reject negative signs, decimals, and non-numeric input
// before it ever reaches the server.
const INTEGER_RE = /^\d+$/;
// Up to 2 decimal places, mandatory integer part. Rejects "-5", ".5", "5."
const DECIMAL_RE = /^\d+(\.\d{1,2})?$/;

/**
 * Field-level validation. Pure function — no state, no side effects, easy to
 * unit-test if we ever extract it. Returns an error map; empty map means valid.
 */
function validateField(
  field: FormField,
  value: string,
  recipes: RecipeDto[],
): string | undefined {
  switch (field) {
    case "recipeId": {
      if (!value) return "Select a recipe.";
      const exists = recipes.some((r) => String(r.id) === value);
      if (!exists) return "Unknown recipe.";
      return undefined;
    }
    case "targetQty": {
      if (value.trim() === "") return "Target quantity is required.";
      if (!INTEGER_RE.test(value)) return "Whole number greater than zero.";
      const n = Number(value);
      if (n <= 0) return "Must be at least 1.";
      if (n > 100_000) return "Maximum 100,000 per batch.";
      return undefined;
    }
    case "fabricRollId": {
      if (!value.trim()) return "Fabric roll ID is required.";
      if (value.trim().length > 64) return "Maximum 64 characters.";
      return undefined;
    }
    case "actualFabricYds": {
      if (value.trim() === "") return "Actual fabric used is required.";
      if (!DECIMAL_RE.test(value)) return "Positive number, up to 2 decimals.";
      const n = Number(value);
      if (n <= 0) return "Must be greater than zero.";
      return undefined;
    }
  }
}

export function CreateOrderForm({
  recipes,
  onCreated,
  onCancel,
}: CreateOrderFormProps) {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedRecipe = useMemo(
    () => recipes.find((r) => String(r.id) === form.recipeId) ?? null,
    [recipes, form.recipeId],
  );

  // Exact label shown in the Select trigger. Rendering the label explicitly
  // (instead of relying on Radix to reverse-lookup the item) fixes the case
  // where a controlled value renders as its raw string before the item mounts.
  const selectedRecipeLabel = selectedRecipe
    ? `${selectedRecipe.name} (${selectedRecipe.recipeCode})`
    : undefined;

  // ─── Field update helper: sets the value AND clears that field's error ─────

  function updateField(field: FormField, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) return prev; // nothing to clear — keep identity
      const next = { ...prev };
      delete next[field];
      return next;
    });
    // Clear any server-side error banner on the first edit after a failed submit.
    if (submitError) setSubmitError(null);
  }

  // ─── Live previews ──────────────────────────────────────────────────────────

  const targetQty = INTEGER_RE.test(form.targetQty)
    ? Number(form.targetQty)
    : 0;

  const componentPreview = useMemo(() => {
    if (!selectedRecipe || targetQty <= 0) return [];
    return selectedRecipe.components.map((c) => ({
      name: c.componentName,
      expected: targetQty * c.piecesPerGarment,
    }));
  }, [selectedRecipe, targetQty]);

  const actualYds = DECIMAL_RE.test(form.actualFabricYds)
    ? Number(form.actualFabricYds)
    : 0;

  const wastagePreview = useMemo(() => {
    if (!selectedRecipe || targetQty <= 0 || actualYds <= 0) return null;
    const expectedFabric = targetQty * selectedRecipe.stdFabricYards;
    if (expectedFabric <= 0) return null;
    const pct = ((actualYds - expectedFabric) / expectedFabric) * 100;
    return {
      expectedFabric,
      pct,
      exceedsCap: pct > selectedRecipe.wastageCap,
    };
  }, [selectedRecipe, targetQty, actualYds]);

  // ─── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);

    // Validate every field at submit-time. Per-field errors already cleared on
    // edit; this pass catches fields the user never touched.
    const fields: FormField[] = [
      "recipeId",
      "targetQty",
      "fabricRollId",
      "actualFabricYds",
    ];
    const next: FieldErrors = {};
    for (const f of fields) {
      const err = validateField(f, form[f], recipes);
      if (err) next[f] = err;
    }

    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    const payload: CreateOrderRequest = {
      recipeId: Number(form.recipeId),
      targetQty: Number(form.targetQty),
      fabricRollId: form.fabricRollId.trim(),
      actualFabricYds: Number(form.actualFabricYds),
    };

    setSubmitting(true);
    try {
      await createOrder(payload);
      onCreated();
    } catch (err) {
      if (err instanceof ApiError) setSubmitError(err.message);
      else setSubmitError("Unexpected error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="recipeId">Production Recipe</Label>
        <Select
          value={form.recipeId || undefined}
          onValueChange={(v) => updateField("recipeId", v ?? "")}
        >
          <SelectTrigger id="recipeId" className="w-full">
            <SelectValue placeholder="Select a recipe…">
              {selectedRecipeLabel}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {recipes.map((r) => (
              <SelectItem key={r.id} value={String(r.id)}>
                {r.name} ({r.recipeCode})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.recipeId && (
          <p className="text-sm text-destructive">{errors.recipeId}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="targetQty">Target Quantity</Label>
          <Input
            id="targetQty"
            inputMode="numeric"
            value={form.targetQty}
            onChange={(e) => updateField("targetQty", e.target.value)}
            placeholder="e.g. 50"
            aria-invalid={Boolean(errors.targetQty)}
          />
          {errors.targetQty && (
            <p className="text-sm text-destructive">{errors.targetQty}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="fabricRollId">Fabric Roll ID</Label>
          <Input
            id="fabricRollId"
            value={form.fabricRollId}
            onChange={(e) => updateField("fabricRollId", e.target.value)}
            placeholder="e.g. FAB-ROLL-882"
            aria-invalid={Boolean(errors.fabricRollId)}
          />
          {errors.fabricRollId && (
            <p className="text-sm text-destructive">{errors.fabricRollId}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="actualFabricYds">Actual Fabric Used (yards)</Label>
        <Input
          id="actualFabricYds"
          inputMode="decimal"
          value={form.actualFabricYds}
          onChange={(e) => updateField("actualFabricYds", e.target.value)}
          placeholder="e.g. 95.50"
          aria-invalid={Boolean(errors.actualFabricYds)}
        />
        {errors.actualFabricYds && (
          <p className="text-sm text-destructive">{errors.actualFabricYds}</p>
        )}
      </div>

      {/* Live multiplier preview */}
      {componentPreview.length > 0 && (
        <div className="rounded-md border bg-muted/40 p-4">
          <p className="text-sm font-medium mb-2">Expected Component Counts</p>
          <ul className="space-y-1 text-sm">
            {componentPreview.map((c) => (
              <li key={c.name} className="flex justify-between">
                <span className="text-muted-foreground">{c.name}</span>
                <span className="font-mono font-medium">{c.expected} pcs</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Live wastage preview */}
      {wastagePreview && (
        <div
          className={`rounded-md border p-4 text-sm ${
            wastagePreview.exceedsCap
              ? "border-destructive/50 bg-destructive/10 text-destructive"
              : "bg-muted/40"
          }`}
        >
          <div className="flex justify-between">
            <span>Expected fabric</span>
            <span className="font-mono">
              {wastagePreview.expectedFabric.toFixed(2)} yds
            </span>
          </div>
          <div className="flex justify-between">
            <span>Wastage</span>
            <span className="font-mono">{wastagePreview.pct.toFixed(2)}%</span>
          </div>
          {wastagePreview.exceedsCap && selectedRecipe && (
            <p className="mt-2 text-xs">
              ⚠ Exceeds recipe cap of {selectedRecipe.wastageCap.toFixed(2)}%
            </p>
          )}
        </div>
      )}

      {submitError && (
        <Alert variant="destructive">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Submit to QC"}
        </Button>
      </div>
    </form>
  );
}
