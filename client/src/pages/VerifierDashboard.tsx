import { useCallback, useEffect, useState } from "react";
import type { OrderWithRecipeDto } from "@apparelflow/shared";
import { listOrders } from "@/lib/endpoints";
import { ApiError } from "@/lib/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { VerificationTerminal } from "@/components/VerificationTerminal";
import { Skeleton } from "@/components/ui/skeleton";

export function VerifierDashboard() {
  const [orders, setOrders] = useState<OrderWithRecipeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<number | null>(null);

  const load = useCallback(() => {
    return listOrders()
      .then((res) => {
        setOrders(res.orders);
        setError(null);
        // If the active order was just decided and is no longer pending,
        // return to the queue automatically.
        if (
          activeOrderId !== null &&
          !res.orders.some((o) => o.id === activeOrderId)
        ) {
          setActiveOrderId(null);
        }
      })
      .catch((err: unknown) => {
        setError(
          err instanceof ApiError ? err.message : "Failed to load queue.",
        );
      })
      .finally(() => setLoading(false));
  }, [activeOrderId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (activeOrderId !== null) {
    return (
      <VerificationTerminal
        orderId={activeOrderId}
        onBack={() => {
          setActiveOrderId(null);
          void load();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Cutting Verifier Workspace</h2>
        <p className="text-sm text-muted-foreground">
          Batches awaiting component verification. Approve only when every
          component is GREEN or YELLOW.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pending Verification Queue</CardTitle>
          <CardDescription>
            Only batches with status Pending QC.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No batches pending verification. New cutting orders will appear
              here.
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
                    <OrderStatusBadge status={o.status} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {o.recipe.name} · Target {o.targetQty} units · Roll{" "}
                    {o.fabricRollId}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Submitted {new Date(o.createdAt).toLocaleString()}
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
