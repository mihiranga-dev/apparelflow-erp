import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { RoleSwitcher } from "./RoleSwitcher";
import { Button } from "@/components/ui/button";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="container mx-auto flex min-h-16 flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold">ApparelFlow ERP</h1>
            <p className="text-xs text-muted-foreground">
              {user.fullName} · {user.email}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            <RoleSwitcher />
            <Button variant="outline" size="sm" onClick={logout}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto py-8">{children}</main>
    </div>
  );
}
