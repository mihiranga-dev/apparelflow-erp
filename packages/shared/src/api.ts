import type { UserRole } from "./roles";
import type {
  ComponentStatus,
  OrderStatus,
  VerificationDecision,
} from "./status";

// Errors & auth

export interface ApiErrorBody {
  error: string;
  code?: string;
  details?: unknown;
}

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  role: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface SwitchRoleRequest {
  role: UserRole;
}

// Recipes

export interface RecipeComponentDto {
  id: number;
  recipeId: number;
  componentName: string;
  piecesPerGarment: number;
  imageUrl: string | null;
}

export interface RecipeDto {
  id: number;
  recipeCode: string;
  name: string;
  category: string;
  stdFabricYards: number;
  wastageCap: number;
  components: RecipeComponentDto[];
}

// Orders

export interface CuttingOrderDto {
  id: number;
  orderNo: string;
  recipeId: number;
  targetQty: number;
  fabricRollId: string;
  actualFabricYds: number;
  status: OrderStatus;
  createdBy: number;
  sewingStartedAt: string | null;
  sewingStartedBy: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Order payload returned by list/detail endpoints — the recipe is joined
 * so the client can display garment name and std fabric without a second call.
 */
export interface OrderWithRecipeDto extends CuttingOrderDto {
  recipe: RecipeDto;
}

export interface CreateOrderRequest {
  recipeId: number;
  targetQty: number;
  fabricRollId: string;
  actualFabricYds: number;
}

// Verification

export interface VerificationItemDto {
  id: number;
  componentId: number;
  componentName: string;
  expectedQty: number;
  actualQty: number | null;
  status: ComponentStatus | null;
}

/**
 * Full detail payload used by the verification terminal and sewing review —
 * joins the recipe (with components), the per-component items, and the
 * immutable audit-log history.
 */
export interface OrderVerificationDetailDto extends CuttingOrderDto {
  recipe: RecipeDto;
  verificationItems: VerificationItemDto[];
  verificationLogs: VerificationLogDto[];
}

export interface VerificationLogDto {
  id: number;
  orderId: number;
  verifierId: number;
  verifierName: string;
  decision: VerificationDecision;
  rejectionNote: string | null;
  wastagePct: number;
  createdAt: string;
}

export interface UpdateVerificationItemRequest {
  actualQty: number;
}

export interface RejectOrderRequest {
  rejectionNote: string;
}

// Approval error codes (used by client to render targeted messages)

export type ApprovalBlockReason =
  | "MISSING_ITEMS"
  | "UNCOUNTED_ITEMS"
  | "SHORTAGE";

export interface ApprovalBlockedResponse {
  error: string;
  code: ApprovalBlockReason;
  details?: {
    componentNames?: string[];
  };
}

// Sewing queue

/**
 * Sewing queue list item — order + recipe + the latest verifier decision,
 * flattened so the list view can render attribution without a second call.
 */
export interface SewingQueueItemDto extends CuttingOrderDto {
  recipe: RecipeDto;
  verifierName: string | null;
  verifiedAt: string | null;
  wastagePct: number | null;
}

/**
 * Sewing batch detail — full verification items + complete audit-log history.
 */
export interface SewingBatchDetailDto extends CuttingOrderDto {
  recipe: RecipeDto;
  verificationItems: Array<VerificationItemDto & { componentName: string }>;
  verificationLogs: VerificationLogDto[];
}
