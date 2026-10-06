import { useAuth } from "@/lib/auth-context";
import { LoginPage } from "@/pages/LoginPage";
import { AppShell } from "@/components/AppShell";
import { SupervisorDashboard } from "@/pages/SupervisorDashboard";
import { VerifierDashboard } from "@/pages/VerifierDashboard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Coming in a later phase.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}

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
      {user.role === "cutting_supervisor" && <SupervisorDashboard />}
      {user.role === "cutting_verifier" && <VerifierDashboard />}
      {user.role === "sewing_supervisor" && (
        <Placeholder
          title="Sewing Queue"
          body="Verified batches and assembly handoff arrive in Phase 5."
        />
      )}
    </AppShell>
  );
}

export default App;
