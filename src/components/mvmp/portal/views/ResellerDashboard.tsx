"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  CreditCard,
  Percent,
  ShieldCheck,
  Store,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatCard } from "../../StatCard";
import { StatusBadge } from "../../StatusBadge";
import { EmptyState, apiFetch } from "../../lib";
import {
  formatCurrency,
  formatDate,
  formatNumber,
  timeAgo,
} from "@/lib/utils-mvmp";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";

interface DashboardData {
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
  recentCustomers: Array<{
    id: string;
    name: string;
    email: string;
    customerCode: string;
    status: string;
    activeAccounts: number;
  }>;
  recentLedger: Array<{
    id: string;
    entryType: string;
    amount: number;
    balanceAfter: number;
    description: string;
    createdAt: string;
    reference?: string | null;
  }>;
  recentCommissions: Array<{
    id: string;
    amount: number;
    status: string;
    createdAt: string;
    transaction?: {
      invoiceNumber: string;
      customer?: { name: string } | null;
    } | null;
  }>;
}

export function ResellerDashboard() {
  const setView = useAppStore((s) => s.setView);

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["reseller-dashboard"],
    queryFn: () => apiFetch("/api/portal/reseller/dashboard"),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <Card className="p-6 gap-0 bg-gradient-to-br from-cyan-500/10 via-card to-card border-cyan-500/20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Halo, {data.profile.name}
              </h1>
              <Badge
                variant="outline"
                className="font-mono text-xs bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
              >
                {data.profile.resellerCode}
              </Badge>
              <StatusBadge status={data.profile.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              Kelola pelanggan Anda, buat akun VPN, dan pantau komisi serta
              saldo di portal reseller MVMP.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setView("r-customers")}
            >
              <Users className="h-4 w-4" />
              Pelanggan
            </Button>
            <Button size="sm" onClick={() => setView("r-create-account")}>
              <ShieldCheck className="h-4 w-4" />
              Buat Akun VPN
            </Button>
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Saldo"
          value={formatCurrency(data.profile.balance)}
          icon={Wallet}
          accent="emerald"
          sublabel={`Komisi ${data.profile.commissionRate}% per transaksi`}
        />
        <StatCard
          title="Komisi Total"
          value={formatCurrency(data.stats.totalCommissionEarned)}
          icon={Percent}
          accent="cyan"
          sublabel={`${formatCurrency(data.stats.pendingCommission)} pending`}
        />
        <StatCard
          title="Pelanggan"
          value={`${data.stats.customersCount}/${data.profile.accountLimit}`}
          icon={Users}
          accent="amber"
          sublabel={`${data.accountLimitProgress.percent}% kuota akun`}
        />
        <StatCard
          title="Akun Aktif"
          value={formatNumber(data.stats.activeAccountsCount)}
          icon={ShieldCheck}
          accent="rose"
          sublabel={`${data.stats.transactionsCount} transaksi berbayar`}
        />
      </div>

      {/* Account limit progress */}
      <Card className="p-6 gap-4">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">
              Limit Akun Pelanggan
            </h2>
            <p className="text-xs text-muted-foreground">
              {data.accountLimitProgress.used} dari {data.accountLimitProgress.limit} akun terpakai
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "tabular-nums",
              data.accountLimitProgress.percent >= 90
                ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                : data.accountLimitProgress.percent >= 70
                ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
            )}
          >
            {data.accountLimitProgress.percent}%
          </Badge>
        </div>
        <Progress
          value={data.accountLimitProgress.percent}
          className={cn(
            "h-2",
            data.accountLimitProgress.percent >= 90
              ? "[&>div]:bg-rose-500"
              : data.accountLimitProgress.percent >= 70
              ? "[&>div]:bg-amber-500"
              : "[&>div]:bg-emerald-500"
          )}
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Sisa:{" "}
            <span className="font-medium text-foreground">
              {Math.max(0, data.accountLimitProgress.limit - data.accountLimitProgress.used)} akun
            </span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setView("r-customers")}
          >
            Kelola Pelanggan
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {/* Recent customers + ledger */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent customers */}
        <Card className="p-6 gap-4">
          <div className="flex items-center justify-between gap-2">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">
                Pelanggan Terbaru
              </h2>
              <p className="text-xs text-muted-foreground">
                5 pelanggan terakhir ditambahkan
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView("r-customers")}
            >
              Lihat Semua
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          {data.recentCustomers.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Belum ada pelanggan"
              description="Tambahkan pelanggan pertama Anda untuk mulai."
            />
          ) : (
            <div className="overflow-x-auto -mx-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>VPN</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Kode</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentCustomers.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground">
                            {c.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {c.email}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.activeAccounts}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={c.status} />
                      </TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground">
                        {c.customerCode}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>

        {/* Recent ledger */}
        <Card className="p-6 gap-4">
          <div className="flex items-center justify-between gap-2">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">
                Riwayat Ledger Terbaru
              </h2>
              <p className="text-xs text-muted-foreground">
                Pergerakan saldo reseller
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView("r-ledger")}
            >
              Lihat Semua
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          {data.recentLedger.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="Belum ada ledger"
              description="Riwayan transaksi saldo akan muncul di sini."
            />
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {data.recentLedger.map((l) => (
                <div
                  key={l.id}
                  className="flex items-start gap-3 rounded-md border border-border bg-muted/20 px-3 py-2"
                >
                  <div
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                      l.entryType === "DEBIT"
                        ? "bg-rose-500/15 text-rose-400"
                        : l.entryType === "CREDIT"
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-amber-500/15 text-amber-400"
                    )}
                  >
                    {l.entryType === "DEBIT" ? (
                      <ArrowDownRight className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-foreground">
                        {l.entryType.replace("_", " ").toLowerCase()}
                      </span>
                      <span
                        className={cn(
                          "text-xs font-semibold tabular-nums",
                          l.entryType === "DEBIT"
                            ? "text-rose-400"
                            : l.entryType === "CREDIT"
                            ? "text-emerald-400"
                            : "text-amber-400"
                        )}
                      >
                        {l.entryType === "DEBIT" ? "-" : "+"}
                        {formatCurrency(l.amount)}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground line-clamp-1">
                      {l.description}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-0.5">
                      <span>Saldo: {formatCurrency(l.balanceAfter)}</span>
                      <span>{timeAgo(l.createdAt)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Recent commissions */}
      <Card className="p-6 gap-4">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">
              Komisi Terbaru
            </h2>
            <p className="text-xs text-muted-foreground">
              Komisi dari transaksi pelanggan Anda
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setView("r-commissions")}
          >
            Lihat Semua
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
        {data.recentCommissions.length === 0 ? (
          <EmptyState
            icon={Percent}
            title="Belum ada komisi"
            description="Komisi akan muncul saat pelanggan Anda melakukan transaksi."
          />
        ) : (
          <div className="overflow-x-auto -mx-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Pelanggan</TableHead>
                  <TableHead>Nominal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Waktu</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentCommissions.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">
                      {c.transaction?.invoiceNumber || "-"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {c.transaction?.customer?.name || "-"}
                    </TableCell>
                    <TableCell className="text-sm font-medium tabular-nums text-emerald-400">
                      +{formatCurrency(c.amount)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {timeAgo(c.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
