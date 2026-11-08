"use client";

import * as React from "react";
import { Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useAppStore } from "@/lib/store";
import { apiFetch } from "./lib";

export function LoginView() {
  const setUser = useAppStore((s) => s.setUser);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await apiFetch<{ user: any }>(
        "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify({ email, password }),
        }
      );
      setUser(data.user);
      toast.success(`Selamat datang, ${data.user.name}!`);
    } catch (err: any) {
      toast.error(err?.message || "Gagal masuk");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-gradient-animated relative min-h-screen w-full overflow-hidden flex items-center justify-center p-4">
      {/* grid overlay */}
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-60" />
      {/* ambient glows */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-emerald-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-cyan-500/20 blur-3xl" />

      <Card className="relative z-10 w-full max-w-md p-8 gap-6 border border-border/60 backdrop-blur-md bg-card/80 shadow-2xl">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30">
            <ShieldCheck className="h-7 w-7 text-emerald-400" />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-semibold tracking-tight text-foreground">
              MVMP
            </p>
            <p className="text-xs text-muted-foreground">
              Multi VPN Management Panel
            </p>
          </div>
        </div>

        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Panel Administrasi
          </h1>
          <p className="text-sm text-muted-foreground">
            Masuk untuk mengelola VPN multi-server
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-xs text-muted-foreground">
              Email
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@mvmp.id"
                className="pl-9"
                autoComplete="email"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-xs text-muted-foreground">
              Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-9 pr-9"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPw ? "Sembunyikan password" : "Tampilkan password"}
              >
                {showPw ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full"
            size="lg"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Masuk
          </Button>
        </form>

        <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-center">
          <p className="text-xs text-muted-foreground">
            Demo credentials are configured via environment variables.
          </p>
        </div>
      </Card>
    </div>
  );
}
