"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Loader2,
  Mail,
  Percent,
  Phone,
  ShieldCheck,
  Store,
  User as UserIcon,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "../../PageHeader";
import { StatCard } from "../../StatCard";
import { StatusBadge } from "../../StatusBadge";
import { apiFetch } from "../../lib";
import { formatCurrency, formatDate } from "@/lib/utils-mvmp";

interface ProfileData {
  profile: {
    id: string;
    resellerCode: string;
    name: string;
    email: string;
    phone?: string | null;
    balance: number;
    commissionRate: number;
    accountLimit: number;
    status: string;
  };
  stats: {
    customersCount: number;
    activeAccountsCount: number;
    totalCommissionEarned: number;
    pendingCommission: number;
    transactionsCount: number;
  };
  accountLimitProgress: {
    used: number;
    limit: number;
    percent: number;
  };
}

export function ResellerProfile() {
  const { data, isLoading } = useQuery<ProfileData>({
    queryKey: ["reseller-dashboard"],
    queryFn: () => apiFetch("/api/portal/reseller/dashboard"),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const { profile, stats, accountLimitProgress } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profil Reseller"
        description="Informasi akun reseller Anda"
      />

      {/* Profile card */}
      <Card className="p-6 gap-4 bg-gradient-to-br from-cyan-500/5 via-card to-card border-cyan-500/20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 border border-cyan-500/30">
              <Store className="h-7 w-7 text-cyan-400" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold text-foreground truncate">
                  {profile.name}
                </h2>
                <StatusBadge status={profile.status} />
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                {profile.resellerCode}
              </p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {profile.email}
                </span>
                {profile.phone ? (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {profile.phone}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Saldo
            </p>
            <p className="text-xl font-bold text-emerald-400 tabular-nums">
              {formatCurrency(profile.balance)}
            </p>
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Pelanggan"
          value={`${stats.customersCount}/${profile.accountLimit}`}
          icon={Users}
          accent="cyan"
          sublabel={`${accountLimitProgress.percent}% kuota akun`}
        />
        <StatCard
          title="Akun VPN Aktif"
          value={stats.activeAccountsCount}
          icon={ShieldCheck}
          accent="emerald"
        />
        <StatCard
          title="Komisi Total"
          value={formatCurrency(stats.totalCommissionEarned)}
          icon={Percent}
          accent="amber"
          sublabel={`${formatCurrency(stats.pendingCommission)} pending`}
        />
        <StatCard
          title="Transaksi"
          value={stats.transactionsCount}
          icon={Wallet}
          accent="rose"
          sublabel="Transaksi berbayar"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Details */}
        <Card className="p-6 gap-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-foreground">
            Detail Reseller
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-border">
            <InfoRow
              icon={UserIcon}
              label="Nama"
              value={profile.name}
            />
            <InfoRow
              icon={Store}
              label="Kode Reseller"
              value={
                <span className="font-mono text-sm">
                  {profile.resellerCode}
                </span>
              }
            />
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
              icon={Percent}
              label="Rate Komisi"
              value={
                <Badge
                  variant="outline"
                  className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                >
                  {profile.commissionRate}%
                </Badge>
              }
            />
            <InfoRow
              icon={Users}
              label="Limit Pelanggan"
              value={`${profile.accountLimit} akun`}
            />
            <InfoRow
              icon={Wallet}
              label="Saldo"
              value={
                <span className="font-semibold text-emerald-400 tabular-nums">
                  {formatCurrency(profile.balance)}
                </span>
              }
            />
          </div>
        </Card>

        {/* Change password */}
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
    </div>
  );
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
        <Label htmlFor="r-current" className="text-xs">
          Password Saat Ini
        </Label>
        <Input
          id="r-current"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="••••••"
          autoComplete="current-password"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="r-next" className="text-xs">
          Password Baru
        </Label>
        <Input
          id="r-next"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="Minimal 6 karakter"
          autoComplete="new-password"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="r-confirm" className="text-xs">
          Konfirmasi Password Baru
        </Label>
        <Input
          id="r-confirm"
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
