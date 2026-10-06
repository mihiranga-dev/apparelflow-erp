import type {
  AuthUser,
  CreateOrderRequest,
  CuttingOrderDto,
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
