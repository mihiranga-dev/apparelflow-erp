import type { OrderStatus } from "@apparelflow/shared";
import { Badge } from "@/components/ui/badge";

const STATUS_STYLES: Record<OrderStatus, string> = {
  CUTTING_IN_PROGRESS: "bg-slate-100 text-slate-800 hover:bg-slate-100",
  PENDING_VERIFICATION: "bg-amber-100 text-amber-900 hover:bg-amber-100",
  VERIFIED: "bg-emerald-100 text-emerald-900 hover:bg-emerald-100",
  REJECTED: "bg-red-100 text-red-900 hover:bg-red-100",
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  CUTTING_IN_PROGRESS: "Cutting",
  PENDING_VERIFICATION: "Pending QC",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant="outline" className={STATUS_STYLES[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
