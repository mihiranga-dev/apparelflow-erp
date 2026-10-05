import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function App() {
  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">ApparelFlow ERP</h1>
        <p className="text-sm text-muted-foreground">Scaffold smoke test.</p>
        <div className="space-y-2">
          <Label htmlFor="smoke">Contrast check</Label>
          <Input
            id="smoke"
            placeholder="Type here — text must be dark on light"
          />
        </div>
        <Button className="w-full">Verify toolchain</Button>
      </div>
    </main>
  );
}

export default App;
