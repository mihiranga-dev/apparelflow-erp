import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthResponse, AuthUser, UserRole } from "@apparelflow/shared";
import { apiFetch, getStoredToken, setStoredToken } from "./api";
import {
  AuthContext,
  type AuthContextValue,
  type AuthStatus,
} from "./auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  /**
   * Initial status is derived lazily from token presence:
   *   - No token → 'anonymous' immediately; the effect below has nothing to do.
   *   - Token present → 'loading' while we validate it against the server.
   *
   * This avoids a synchronous setState inside the mount effect.
   */
  const [status, setStatus] = useState<AuthStatus>(() =>
    getStoredToken() ? "loading" : "anonymous",
  );

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return; // status already 'anonymous' from lazy initialiser

    let cancelled = false;
    apiFetch<{ user: AuthUser }>("/auth/me")
      .then((res) => {
        if (cancelled) return;
        setUser(res.user);
        setStatus("authenticated");
      })
      .catch(() => {
        if (cancelled) return;
        setStoredToken(null);
        setUser(null);
        setStatus("anonymous");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiFetch<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(res.token);
    setUser(res.user);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(() => {
    setStoredToken(null);
    setUser(null);
    setStatus("anonymous");
  }, []);

  const switchRole = useCallback(async (role: UserRole) => {
    const res = await apiFetch<AuthResponse>("/auth/switch-role", {
      method: "POST",
      body: JSON.stringify({ role }),
    });
    setStoredToken(res.token);
    setUser(res.user);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, logout, switchRole }),
    [user, status, login, logout, switchRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
