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
      {/*
        Explicit max-width + responsive horizontal padding replaces the
        `container` utility, which — after the Tailwind v4 migration — no longer
        carries the 2rem mobile padding we declared in the v3 config. Without
        this, content butts against the viewport edges on phones.
      */}
      <header className="border-b bg-card">
        <div className="mx-auto w-full max-w-7xl flex min-h-16 flex-col gap-2 px-4 py-3 sm:px-6 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">ApparelFlow ERP</h1>
            <p className="text-xs text-muted-foreground truncate">
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
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {children}
      </main>
    </div>
  );
}
