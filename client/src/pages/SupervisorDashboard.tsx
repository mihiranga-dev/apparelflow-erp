import { useCallback, useEffect, useState } from "react";
import type { OrderWithRecipeDto, RecipeDto } from "@apparelflow/shared";
import { listOrders, listRecipes } from "@/lib/endpoints";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateOrderForm } from "@/components/CreateOrderForm";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";

export function SupervisorDashboard() {
  const [recipes, setRecipes] = useState<RecipeDto[]>([]);
  const [orders, setOrders] = useState<OrderWithRecipeDto[]>([]);
  // Initialised to true: the mount effect kicks off a fetch, so we're loading
  // from the first paint. `load()` never sets this to true again — refreshes
  // after order creation are silent because the existing data stays on screen.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  /**
   * No setState runs synchronously before the first await, so this function is
   * safe to invoke directly inside useEffect without tripping
   * react-hooks/set-state-in-effect.
   */
  const load = useCallback(async () => {
    try {
      const [r, o] = await Promise.all([listRecipes(), listOrders()]);
      setRecipes(r.recipes);
      setOrders(o.orders);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">
            Cutting Supervisor Dashboard
          </h2>
          <p className="text-sm text-muted-foreground">
            Create cutting orders and track their verification progress.
          </p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          disabled={recipes.length === 0}
        >
          + New Cutting Order
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Production Recipes</CardTitle>
          <CardDescription>
            Pre-seeded Bill of Materials. Selecting one multiplies its
            components by your target quantity.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {recipes.map((r) => (
              <div key={r.id} className="rounded-md border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {r.recipeCode}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {r.category} · {r.stdFabricYards} yds/pc · wastage cap{" "}
                  {r.wastageCap}%
                </p>
                <ul className="text-xs space-y-0.5">
                  {r.components.map((c) => (
                    <li key={c.id} className="flex justify-between">
                      <span className="text-muted-foreground">
                        {c.componentName}
                      </span>
                      <span className="font-mono">{c.piecesPerGarment}×</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">My Cutting Orders</CardTitle>
          <CardDescription>Only orders you created are shown.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No orders yet. Click “New Cutting Order” to submit your first
              batch to QC.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order No</TableHead>
                  <TableHead>Recipe</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Roll</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono">{o.orderNo}</TableCell>
                    <TableCell>{o.recipe.name}</TableCell>
                    <TableCell>{o.targetQty}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {o.fabricRollId}
                    </TableCell>
                    <TableCell>
                      <OrderStatusBadge status={o.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Cutting Order</DialogTitle>
            <DialogDescription>
              Submitting sends the batch straight to the QC verification
              terminal.
            </DialogDescription>
          </DialogHeader>
          <CreateOrderForm
            recipes={recipes}
            onCreated={() => {
              setDialogOpen(false);
              void load();
            }}
            onCancel={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
