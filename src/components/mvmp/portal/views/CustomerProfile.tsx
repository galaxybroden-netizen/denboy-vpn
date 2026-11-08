"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  Phone,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "../../PageHeader";
import { StatusBadge } from "../../StatusBadge";
import { EmptyState, apiFetch } from "../../lib";
import { formatDate } from "@/lib/utils-mvmp";

interface ProfileData {
  profile: {
    id: string;
    customerCode: string;
    name: string;
    email: string;
    phone?: string | null;
    status: string;
  };
  activeAccounts: Array<{
    id: string;
    username: string;
    status: string;
    expiresAt: string;
    server: { name: string; countryCode?: string };
    protocol: { displayName: string; engine: string };
  }>;
}

export function CustomerProfile() {
  const { data, isLoading } = useQuery<ProfileData>({
    queryKey: ["customer-dashboard"],
    queryFn: () => apiFetch("/api/portal/customer/dashboard"),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const { profile, activeAccounts } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profil Saya"
        description="Kelola informasi akun pelanggan Anda"
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Profile card */}
        <Card className="p-6 gap-4 lg:col-span-2">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/30">
              <UserIcon className="h-7 w-7 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold text-foreground truncate">
                  {profile.name}
                </h2>
                <StatusBadge status={profile.status} />
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                {profile.customerCode}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 pt-4 border-t border-border">
            <InfoRow
              icon={Mail}
              label="Email"
              value={profile.email}
            />
            <InfoRow
              icon={Phone}
              label="Telepon"
              value={profile.phone || "-"}
            />
            <InfoRow
              icon={ShieldCheck}
              label="Status"
              value={<StatusBadge status={profile.status} />}
            />
            <InfoRow
              icon={KeyRound}
              label="Kode Pelanggan"
              value={
                <span className="font-mono text-sm">{profile.customerCode}</span>
              }
            />
          </div>
        </Card>

        {/* Change password card */}
        <Card className="p-6 gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">
              Ganti Password
            </h3>
            <p className="text-xs text-muted-foreground">
              Tingkatkan keamanan akun Anda
            </p>
          </div>
          <ChangePasswordForm />
        </Card>
      </div>

      {/* Active subscriptions */}
      <Card className="p-6 gap-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground">
            Akun VPN Aktif
          </h3>
          <p className="text-xs text-muted-foreground">
            {activeAccounts.length} akun terhubung dengan profil Anda
          </p>
        </div>

        {activeAccounts.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Tidak ada akun VPN aktif"
            description="Beli paket untuk membuat akun VPN pertama Anda."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {activeAccounts.map((acc) => (
              <div
                key={acc.id}
                className="rounded-md border border-border bg-muted/20 p-3 flex items-center gap-3"
              >
                <span className="text-base">
                  {acc.server.countryCode
                    ? flagFor(acc.server.countryCode)
                    : "🌐"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-mono font-medium text-foreground truncate">
                    {acc.username}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {acc.protocol.displayName} · {acc.server.name}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-muted-foreground">
                    Kedaluwarsa
                  </p>
                  <p className="text-xs font-medium text-foreground">
                    {formatDate(acc.expiresAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function flagFor(code: string) {
  const flags: Record<string, string> = {
    ID: "🇮🇩",
    SG: "🇸🇬",
    US: "🇺🇸",
    NL: "🇳🇱",
    DE: "🇩🇪",
    JP: "🇯🇵",
    HK: "🇭🇰",
    IN: "🇮🇳",
  };
  return flags[code.toUpperCase()] || "🌐";
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}

function ChangePasswordForm() {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!current || !next || !confirm) {
      toast.error("Lengkapi semua field");
      return;
    }
    if (next !== confirm) {
      toast.error("Password baru tidak cocok");
      return;
    }
    if (next.length < 6) {
      toast.error("Password minimal 6 karakter");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.info("Fitur akan datang", {
        description: "Ganti password akan tersedia segera.",
      });
    }, 700);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="current" className="text-xs">
          Password Saat Ini
        </Label>
        <Input
          id="current"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="••••••"
          autoComplete="current-password"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="next" className="text-xs">
          Password Baru
        </Label>
        <Input
          id="next"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="Minimal 6 karakter"
          autoComplete="new-password"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm" className="text-xs">
          Konfirmasi Password Baru
        </Label>
        <Input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Ulangi password baru"
          autoComplete="new-password"
        />
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Memproses…
          </>
        ) : (
          <>
            <CheckCircle2 className="h-4 w-4" />
            Ganti Password
          </>
        )}
      </Button>
    </form>
  );
}
