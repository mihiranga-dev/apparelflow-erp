const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

const TOKEN_STORAGE_KEY = "apparelflow.token";

export class ApiError extends Error {
  public readonly status: number;
  public readonly details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(TOKEN_STORAGE_KEY);
}

/**
 * Thin fetch wrapper that:
 *   1. Prepends the API base URL.
 *   2. Attaches the Authorization header when a token is stored.
 *   3. Parses JSON bodies defensively (empty bodies are common on errors).
 *   4. Throws a typed ApiError carrying status + server payload, so callers
 *      can branch on status codes (401 vs 403 vs 422) rather than string-matching.
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getStoredToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });

  const raw = await response.text();
  let body: unknown = null;
  if (raw.length > 0) {
    try {
      body = JSON.parse(raw);
    } catch {
      // Non-JSON response body — keep as raw string.
      body = { error: raw };
    }
  }

  if (!response.ok) {
    const errPayload = body as { error?: string; details?: unknown } | null;
    throw new ApiError(
      response.status,
      errPayload?.error ?? `Request failed with status ${response.status}`,
      errPayload?.details,
    );
  }

  return body as T;
}
