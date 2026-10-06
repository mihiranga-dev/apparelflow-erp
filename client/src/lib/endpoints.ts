import type {
  AuthUser,
  CreateOrderRequest,
  CuttingOrderDto,
  OrderVerificationDetailDto,
  OrderWithRecipeDto,
  RecipeDto,
} from "@apparelflow/shared";
import { apiFetch } from "./api";

export function listRecipes(): Promise<{ recipes: RecipeDto[] }> {
  return apiFetch("/api/recipes");
}

export function listOrders(): Promise<{ orders: OrderWithRecipeDto[] }> {
  return apiFetch("/api/orders");
}

export function createOrder(
  payload: CreateOrderRequest,
): Promise<{ order: CuttingOrderDto }> {
  return apiFetch("/api/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getMe(): Promise<{ user: AuthUser }> {
  return apiFetch("/auth/me");
}

export function getVerificationOrder(
  orderId: number,
): Promise<{ order: OrderVerificationDetailDto }> {
  return apiFetch(`/api/verification/orders/${orderId}`);
}

export function updateVerificationItem(
  itemId: number,
  actualQty: number,
): Promise<{ item: { id: number; actualQty: number; status: string } }> {
  return apiFetch(`/api/verification-items/${itemId}`, {
    method: "PUT",
    body: JSON.stringify({ actualQty }),
  });
}

export function approveOrder(orderId: number): Promise<{
  order: CuttingOrderDto;
  wastagePct: number;
  logId: number;
}> {
  return apiFetch(`/api/verification/orders/${orderId}/approve`, {
    method: "POST",
  });
}

export function rejectOrder(
  orderId: number,
  rejectionNote: string,
): Promise<{
  order: CuttingOrderDto;
  wastagePct: number;
  logId: number;
}> {
  return apiFetch(`/api/verification/orders/${orderId}/reject`, {
    method: "POST",
    body: JSON.stringify({ rejectionNote }),
  });
}
