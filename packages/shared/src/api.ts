import type { UserRole } from "./roles";
import type {
  ComponentStatus,
  OrderStatus,
  VerificationDecision,
} from "./status";

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

export interface VerificationItemDto {
  id: number;
  componentId: number;
  componentName: string;
  expectedQty: number;
  actualQty: number | null;
  status: ComponentStatus | null;
}

export interface CuttingOrderDto {
  id: number;
  orderNo: string;
  recipeId: number;
  recipeName: string;
  targetQty: number;
  fabricRollId: string;
  actualFabricYds: number;
  status: OrderStatus;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
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
