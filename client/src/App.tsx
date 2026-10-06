import { useAuth } from "@/lib/auth-context";
import { LoginPage } from "@/pages/LoginPage";
import { AppShell } from "@/components/AppShell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ROLE_LABELS } from "@apparelflow/shared";

function App() {
  const { user, status } = useAuth();

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading session…</p>
      </div>
    );
  }

  if (status === "anonymous" || !user) {
    return <LoginPage />;
  }

  return (
    <AppShell>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Phase 2 — Authentication verified</CardTitle>
          <CardDescription>
            The role switcher in the header issues a fresh JWT for the chosen
            persona.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <strong>Role:</strong> {ROLE_LABELS[user.role]} ({user.role})
          </p>
          <p>
            <strong>User ID:</strong> {user.id}
          </p>
          <p className="text-muted-foreground">
            Role-specific dashboards arrive in Phases 3, 4, and 5.
          </p>
        </CardContent>
      </Card>
    </AppShell>
  );
}

export default App;
