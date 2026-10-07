import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ApprovalBlockedResponse,
  OrderVerificationDetailDto,
} from "@apparelflow/shared";
import { ApiError } from "@/lib/api";
import {
  approveOrder,
  getVerificationOrder,
  rejectOrder,
  updateVerificationItem,
} from "@/lib/endpoints";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VerificationItemRow } from "./VerificationItemRow";

interface VerificationTerminalProps {
  orderId: number;
  onBack: () => void;
}

export function VerificationTerminal({
  orderId,
  onBack,
}: VerificationTerminalProps) {
  const [order, setOrder] = useState<OrderVerificationDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);

  /**
   * Ids of rows with unsaved edits. Approval is blocked while this is non-empty,
   * because the server's view of those components is stale — we cannot safely
   * judge the batch until every count is committed.
   */
  const [dirtyItemIds, setDirtyItemIds] = useState<Set<number>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    return getVerificationOrder(orderId)
      .then((res) => {
        setOrder(res.order);
        setDirtyItemIds(new Set());
        setLoadError(null);
      })
      .catch((err: unknown) => {
        setLoadError(
          err instanceof ApiError ? err.message : "Failed to load order.",
        );
      })
      .finally(() => setLoading(false));
  }, [orderId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // ─── Derived state ──────────────────────────────────────────────────────────

  const componentNameById = useMemo(() => {
    if (!order) return new Map<number, string>();
    return new Map(order.recipe.components.map((c) => [c.id, c.componentName]));
  }, [order]);

  const piecesPerGarmentById = useMemo(() => {
    if (!order) return new Map<number, number>();
    return new Map(
      order.recipe.components.map((c) => [c.id, c.piecesPerGarment]),
    );
  }, [order]);

  const handleDirtyChange = useCallback((itemId: number, isDirty: boolean) => {
    setDirtyItemIds((prev) => {
      const next = new Set(prev);
      if (isDirty) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }, []);

  /**
   * Approval gate. Mirrors the server's hard stop PLUS blocks on the two
   * client-only conditions the server cannot see:
   *   - unsaved edits (dirty rows)
   *   - locally cleared counts that have not been committed back to null
   *
   * The server independently re-derives the shortage and uncounted checks,
   * so a bypassed client cannot approve a bad batch — this gate exists purely
   * so the UI never *offers* an action that will be rejected.
   */
  const approveDisabledReason = useMemo(() => {
    if (!order) return "Order not loaded";
    if (order.status !== "PENDING_VERIFICATION")
      return "Order is no longer pending";

    if (dirtyItemIds.size > 0) {
      return `${dirtyItemIds.size} unsaved count${dirtyItemIds.size > 1 ? "s" : ""}`;
    }

    const uncounted = order.verificationItems.filter(
      (i) => i.actualQty === null,
    );
    if (uncounted.length > 0)
      return `${uncounted.length} component(s) uncounted`;

    const shortages = order.verificationItems.filter((i) => i.status === "RED");
    if (shortages.length > 0) return `${shortages.length} component(s) short`;

    return null;
  }, [order, dirtyItemIds]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  async function handleSaveCount(itemId: number, actualQty: number) {
    const res = await updateVerificationItem(itemId, actualQty);
    setOrder((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        verificationItems: prev.verificationItems.map((i) =>
          i.id === itemId
            ? {
                ...i,
                actualQty: res.item.actualQty,
                status: res.item.status as typeof i.status,
              }
            : i,
        ),
      };
    });
  }

  async function handleApprove() {
    if (!order) return;
    if (approveDisabledReason) {
      // Belt and braces — the button is disabled, but a keyboard-triggered
      // submit or programmatic call should still be refused client-side.
      setActionError(`Cannot approve: ${approveDisabledReason}`);
      return;
    }
    setActionError(null);
    setSubmitting(true);
    try {
      await approveOrder(order.id);
      onBack();
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.details as ApprovalBlockedResponse | undefined;
        const names = body?.details?.componentNames?.join(", ");
        setActionError(names ? `${err.message} — ${names}` : err.message);
        void load();
      } else {
        setActionError("Unexpected error. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject() {
    if (!order) return;
    setRejectError(null);
    if (!rejectNote.trim()) {
      setRejectError("A reason is required to reject this batch.");
      return;
    }
    setSubmitting(true);
    try {
      await rejectOrder(order.id, rejectNote.trim());
      setRejectOpen(false);
      onBack();
    } catch (err) {
      setRejectError(
        err instanceof ApiError ? err.message : "Unexpected error. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return <p className="text-muted-foreground">Loading terminal…</p>;
  }

  if (loadError || !order) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={onBack}>
          ← Back to queue
        </Button>
        <Alert variant="destructive">
          <AlertDescription>{loadError ?? "Order not found"}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const expectedTotal = order.verificationItems.reduce(
    (sum, i) => sum + i.expectedQty,
    0,
  );
  const actualTotal = order.verificationItems.reduce(
    (sum, i) => sum + (i.actualQty ?? 0),
    0,
  );
  const countedItems = order.verificationItems.filter(
    (i) => i.actualQty !== null,
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={onBack} className="mb-2">
            ← Back to queue
          </Button>
          <h2 className="text-2xl font-semibold">Verification Terminal</h2>
          <p className="text-sm text-muted-foreground">
            {order.orderNo} · {order.recipe.name} · Target {order.targetQty}{" "}
            units
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Order Summary</CardTitle>
          <CardDescription>
            Roll {order.fabricRollId} · Submitted{" "}
            {new Date(order.createdAt).toLocaleString()}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Components counted</p>
            <p className="font-mono font-medium">
              {countedItems} / {order.verificationItems.length}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">
              Actual / Expected pieces
            </p>
            <p className="font-mono font-medium">
              {actualTotal} / {expectedTotal}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Fabric used</p>
            <p className="font-mono font-medium">{order.actualFabricYds} yds</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Component Verification</CardTitle>
          <CardDescription>
            Enter the physical count for each cut part. Press Enter or click
            away to save each count.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="hidden md:grid grid-cols-12 gap-3 pb-2 border-b text-xs uppercase text-muted-foreground">
            <div className="col-span-5">Component</div>
            <div className="col-span-2 text-right">Expected</div>
            <div className="col-span-3">Actual count</div>
            <div className="col-span-2 text-right">Status</div>
          </div>
          {order.verificationItems.map((item) => (
            <VerificationItemRow
              key={item.id}
              item={item}
              componentName={
                componentNameById.get(item.componentId) ?? "Unknown"
              }
              piecesPerGarment={piecesPerGarmentById.get(item.componentId) ?? 1}
              disabled={order.status !== "PENDING_VERIFICATION"}
              onSave={handleSaveCount}
              onDirtyChange={handleDirtyChange}
            />
          ))}
        </CardContent>
      </Card>

      {actionError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="text-sm">
              {approveDisabledReason ? (
                <p className="text-destructive font-medium">
                  ⛔ Cannot approve — {approveDisabledReason}
                </p>
              ) : (
                <p className="text-emerald-700 font-medium">
                  ✓ All components verified. Batch may proceed.
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setRejectNote("");
                  setRejectError(null);
                  setRejectOpen(true);
                }}
                disabled={submitting}
              >
                Reject Batch
              </Button>
              <Button
                onClick={() => void handleApprove()}
                disabled={Boolean(approveDisabledReason) || submitting}
              >
                {submitting ? "Processing…" : "Approve Batch"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Batch</DialogTitle>
            <DialogDescription>
              Explain what is wrong. This note is permanently recorded against{" "}
              {order.orderNo}
              and the batch returns to the Cutting Supervisor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Reason (required)</Label>
              <Textarea
                id="reason"
                rows={4}
                value={rejectNote}
                onChange={(e) => {
                  setRejectNote(e.target.value);
                  if (rejectError) setRejectError(null);
                }}
                placeholder="e.g. Cuff count short by 3 pieces; sleeves have a fabric flaw."
                aria-invalid={Boolean(rejectError)}
              />
              {rejectError && (
                <p className="text-sm text-destructive">{rejectError}</p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setRejectOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleReject()}
                disabled={submitting}
              >
                {submitting ? "Rejecting…" : "Confirm Rejection"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
