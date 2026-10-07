import { useCallback, useEffect, useState } from "react";
import type { SewingBatchDetailDto } from "@apparelflow/shared";
import { ApiError } from "@/lib/api";
import { getSewingBatch, startSewing } from "@/lib/endpoints";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TrafficLight } from "./TrafficLight";
import { WastageBadge } from "./WastageBadge";

interface SewingBatchDetailProps {
  orderId: number;
  onBack: () => void;
}

export function SewingBatchDetail({ orderId, onBack }: SewingBatchDetailProps) {
  const [order, setOrder] = useState<SewingBatchDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    return getSewingBatch(orderId)
      .then((res) => {
        setOrder(res.order);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        setLoadError(
          err instanceof ApiError ? err.message : "Failed to load batch.",
        );
      })
      .finally(() => setLoading(false));
  }, [orderId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function handleStart() {
    if (!order) return;
    setActionError(null);
    setStarting(true);
    try {
      await startSewing(order.id);
      await load();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Unexpected error. Try again.",
      );
      // Refresh anyway — the 409 path means the batch was already started by
      // someone else, and we want the UI to reflect that.
      void load();
    } finally {
      setStarting(false);
    }
  }

  if (loading) return <p className="text-muted-foreground">Loading batch…</p>;

  if (loadError || !order) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={onBack}>
          ← Back to queue
        </Button>
        <Alert variant="destructive">
          <AlertDescription>{loadError ?? "Batch not found"}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const approvedLog =
    order.verificationLogs.find((l) => l.decision === "APPROVED") ?? null;
  const wastagePct = approvedLog?.wastagePct ?? null;

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-2">
          ← Back to queue
        </Button>
        <h2 className="text-2xl font-semibold">Batch Detail</h2>
        <p className="text-sm text-muted-foreground">
          {order.orderNo} · {order.recipe.name} · Target {order.targetQty} units
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Verification Attribution</CardTitle>
            <CardDescription>
              Immutable audit record. Written at approval time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {approvedLog ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Verified by</span>
                  <span className="font-medium">
                    {approvedLog.verifierName ?? "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Verified at</span>
                  <span className="font-mono text-xs">
                    {new Date(approvedLog.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Fabric wastage</span>
                  {wastagePct !== null ? (
                    <WastageBadge
                      wastagePct={wastagePct}
                      wastageCap={order.recipe.wastageCap}
                    />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fabric roll</span>
                  <span className="font-mono text-xs">
                    {order.fabricRollId}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Actual fabric used
                  </span>
                  <span className="font-mono text-xs">
                    {order.actualFabricYds} yds
                  </span>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">
                No approval log found — this should not be possible for a
                VERIFIED batch.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Assembly Status</CardTitle>
            <CardDescription>Release to the sewing floor.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {order.sewingStartedAt ? (
              <div className="space-y-2">
                <p className="text-emerald-700 font-medium">
                  ✓ Sewing assembly in progress
                </p>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Started at</span>
                  <span className="font-mono text-xs">
                    {new Date(order.sewingStartedAt).toLocaleString()}
                  </span>
                </div>
              </div>
            ) : (
              <>
                <p className="text-muted-foreground">
                  This batch is verified but not yet on the assembly line.
                </p>
                <Button
                  onClick={() => void handleStart()}
                  disabled={starting}
                  className="w-full"
                >
                  {starting ? "Starting…" : "Start Sewing Assembly"}
                </Button>
              </>
            )}
            {actionError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Component Verification</CardTitle>
          <CardDescription>
            Physical counts recorded by the Cutting Verifier.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="hidden md:grid grid-cols-12 gap-3 pb-2 border-b text-xs uppercase text-muted-foreground">
            <div className="col-span-6">Component</div>
            <div className="col-span-2 text-right">Expected</div>
            <div className="col-span-2 text-right">Actual</div>
            <div className="col-span-2 text-right">Status</div>
          </div>
          {order.verificationItems.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-12 items-center gap-3 py-3 border-b last:border-b-0"
            >
              <div className="col-span-6 text-sm font-medium">
                {item.componentName}
              </div>
              <div className="col-span-2 text-right font-mono text-sm">
                {item.expectedQty}
              </div>
              <div className="col-span-2 text-right font-mono text-sm">
                {item.actualQty ?? "—"}
              </div>
              <div className="col-span-2 flex justify-end">
                <TrafficLight status={item.status} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {order.verificationLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Audit Log History</CardTitle>
            <CardDescription>
              Every decision ever recorded against this order, newest first.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {order.verificationLogs.map((log) => (
              <div
                key={log.id}
                className="rounded-md border p-3 text-sm space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={
                      log.decision === "APPROVED"
                        ? "font-medium text-emerald-700"
                        : "font-medium text-red-700"
                    }
                  >
                    {log.decision}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  By {log.verifierName ?? "—"} · Wastage{" "}
                  {log.wastagePct.toFixed(2)}%
                </p>
                {log.rejectionNote && (
                  <p className="text-xs rounded bg-red-50 border border-red-200 p-2 text-red-900">
                    {log.rejectionNote}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
