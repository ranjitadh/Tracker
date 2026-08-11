import { useState } from "react";
import { AlertCircle, Eye, EyeOff, Fingerprint, ShieldCheck, Timer } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { isSupabaseConfigured } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);

  const [email, setEmail] = useState("admin@admin.com");
  const [password, setPassword] = useState("admin123");
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await login(email, password);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="grid w-full max-w-4xl gap-8 md:grid-cols-2 md:items-center">
        <div className="hidden md:block">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15">
              <Timer className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-lg font-bold">Time Tracker</div>
              <div className="text-xs text-muted-foreground">Transparent work tracking</div>
            </div>
          </div>
          <h1 className="text-3xl font-bold leading-tight">
            Track time you can be
            <br />
            <span className="text-primary">proud of.</span>
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Everything you see is visible to you first. Screenshots show a preview the moment
            they're taken, the tray icon always reflects your tracking state, and you can pause
            or stop at any time.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
            {[
              "No keystroke content, passwords, or clipboard ever recorded",
              "Aggregate activity counts only — never raw input",
              "Screenshots encrypted locally before upload",
              "Works offline, syncs when you reconnect",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <Card className="w-full max-w-sm border-border bg-surface md:ml-auto">
          <CardHeader>
            <CardTitle className="text-xl">Sign in</CardTitle>
            <CardDescription>
              {isSupabaseConfigured
                ? (<>Sign in with your account credentials (<code className="rounded bg-surface-hover px-1.5 py-0.5 text-xs">admin@admin.com</code> / <code className="rounded bg-surface-hover px-1.5 py-0.5 text-xs">admin123</code>).</>)
                : (<>Demo mode — <code className="rounded bg-surface-hover px-1.5 py-0.5 text-xs">admin@admin.com</code> with password <code className="rounded bg-surface-hover px-1.5 py-0.5 text-xs">admin123</code>.</>)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert className="mb-4 border-danger/30 bg-danger/5">
                <AlertCircle className="h-4 w-4 text-danger" />
                <AlertTitle>Sign-in failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                ) : (
                  <Fingerprint className="h-4 w-4" />
                )}
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
