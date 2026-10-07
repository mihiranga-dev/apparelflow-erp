import { useCallback, useEffect, useState } from "react";
import type { SewingQueueItemDto } from "@apparelflow/shared";
import { getSewingQueue } from "@/lib/endpoints";
import { ApiError } from "@/lib/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SewingBatchDetail } from "@/components/SewingBatchDetail";

export function SewingDashboard() {
  const [orders, setOrders] = useState<SewingQueueItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<number | null>(null);

  const load = useCallback(() => {
    return getSewingQueue()
      .then((res) => {
        setOrders(res.orders);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof ApiError ? err.message : "Failed to load queue.",
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (activeOrderId !== null) {
    return (
      <SewingBatchDetail
        orderId={activeOrderId}
        onBack={() => {
          setActiveOrderId(null);
          void load();
        }}
      />
    );
  }

  const pendingStart = orders.filter((o) => o.sewingStartedAt === null).length;
  const inProgress = orders.filter((o) => o.sewingStartedAt !== null).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">
          Sewing Floor — Assembly Queue
        </h2>
        <p className="text-sm text-muted-foreground">
          Verified batches released for assembly. Unverified, pending, and
          rejected batches never appear here.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Awaiting assembly</CardDescription>
            <CardTitle className="text-3xl font-mono">{pendingStart}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>In progress</CardDescription>
            <CardTitle className="text-3xl font-mono">{inProgress}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Verified Batches</CardTitle>
          <CardDescription>Only orders in status VERIFIED.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No verified batches yet. Orders will appear here once a Cutting
              Verifier approves them.
            </p>
          ) : (
            <div className="space-y-3">
              {orders.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setActiveOrderId(o.id)}
                  className="w-full text-left rounded-md border p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono font-medium">{o.orderNo}</span>
                    {o.sewingStartedAt ? (
                      <span className="text-xs font-medium text-emerald-700 bg-emerald-100 border border-emerald-300 rounded-md px-2 py-0.5">
                        In Progress
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-slate-700 bg-slate-100 border border-slate-300 rounded-md px-2 py-0.5">
                        Awaiting Assembly
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {o.recipe.name} · Target {o.targetQty} units · Roll{" "}
                    {o.fabricRollId}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Verified by {o.verifierName ?? "—"}
                    {o.verifiedAt &&
                      ` · ${new Date(o.verifiedAt).toLocaleString()}`}
                    {o.wastagePct !== null &&
                      ` · ${o.wastagePct.toFixed(2)}% wastage`}
                  </p>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
