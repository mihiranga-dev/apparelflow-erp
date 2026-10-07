import { useAuth } from "@/lib/auth-context";
import { LoginPage } from "@/pages/LoginPage";
import { AppShell } from "@/components/AppShell";
import { SupervisorDashboard } from "@/pages/SupervisorDashboard";
import { VerifierDashboard } from "@/pages/VerifierDashboard";
import { SewingDashboard } from "@/pages/SewingDashboard";

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
      {user.role === "sewing_supervisor" && <SewingDashboard />}
    </AppShell>
  );
}

export default App;
