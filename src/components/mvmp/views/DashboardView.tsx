"use client";

import * as React from "react";
import {
  Activity,
  DollarSign,
  Server as ServerIcon,
  Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "../PageHeader";
import { StatCard } from "../StatCard";
import { StatusBadge } from "../StatusBadge";
import { EmptyState, apiFetch } from "../lib";
import {
  formatCurrency,
  formatNumber,
  timeAgo,
} from "@/lib/utils-mvmp";

interface DashboardData {
  stats: {
    servers: { total: number; byStatus: Record<string, number> };
    vpnAccounts: { total: number; byStatus: Record<string, number> };
    customers: number;
    resellers: number;
    transactions: number;
    protocols: number;
    totalRevenue: number;
  };
  recentAuditLogs: any[];
  recentTransactions: any[];
  serverMetrics: any[];
  revenueTrend: { month: string; revenue: number; count: number }[];
  notificationsUnread: number;
  aggregate: {
    avgCpu: number;
    totalBandwidthMbps: number;
    totalActiveAccounts: number;
  };
}

export function DashboardView() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: () => apiFetch("/api/dashboard"),
  });

  const stats = data?.stats;
  const serversOnline = stats?.servers.byStatus?.ONLINE ?? 0;
  const serversTotal = stats?.servers.total ?? 0;
  const vpnActive = stats?.vpnAccounts.byStatus?.ACTIVE ?? 0;
  const vpnTotal = stats?.vpnAccounts.total ?? 0;
  const customersActive = stats?.customers ?? 0;
  const revenue = stats?.totalRevenue ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Ringkasan operasional MVMP"
      />

      {/* Stat cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))
        ) : (
          <>
            <StatCard
              title="Total Server"
              value={`${serversOnline} / ${serversTotal}`}
              sublabel="online / total"
              icon={ServerIcon}
              accent="emerald"
              trend={`${stats?.servers.byStatus?.OFFLINE ?? 0} offline`}
            />
            <StatCard
              title="Akun VPN Aktif"
              value={formatNumber(vpnActive)}
              sublabel={`dari ${formatNumber(vpnTotal)} total`}
              icon={Activity}
              accent="cyan"
              trend={`${stats?.vpnAccounts.byStatus?.SUSPENDED ?? 0} diskors`}
            />
            <StatCard
              title="Total Pendapatan"
              value={formatCurrency(revenue)}
              sublabel="transaksi PAID"
              icon={DollarSign}
              accent="amber"
              trend={`${stats?.transactions ?? 0} transaksi`}
            />
            <StatCard
              title="Pelanggan Aktif"
              value={formatNumber(customersActive)}
              sublabel={`${stats?.resellers ?? 0} reseller`}
              icon={Users}
              accent="rose"
              trend={`${stats?.protocols ?? 0} protokol`}
            />
          </>
        )}
      </div>

      {/* Charts */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card className="p-6 gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Tren Pendapatan
              </h2>
              <p className="text-xs text-muted-foreground">6 bulan terakhir</p>
            </div>
          </div>
          {isLoading ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart
                data={data?.revenueTrend ?? []}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.06)"
                />
                <XAxis
                  dataKey="month"
                  stroke="rgba(255,255,255,0.4)"
                  fontSize={11}
                  tickFormatter={(v: string) => {
                    const [y, m] = v.split("-");
                    const months = [
                      "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
                      "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
                    ];
                    return months[parseInt(m, 10) - 1] || v;
                  }}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.4)"
                  fontSize={11}
                  tickFormatter={(v: number) =>
                    v >= 1_000_000
                      ? `${(v / 1_000_000).toFixed(0)}M`
                      : v >= 1_000
                      ? `${(v / 1_000).toFixed(0)}k`
                      : String(v)
                  }
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    background: "rgba(20,20,22,0.95)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "#9ca3af" }}
                  formatter={(v: any) => [formatCurrency(Number(v)), "Pendapatan"]}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#revGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-6 gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Beban Server
              </h2>
              <p className="text-xs text-muted-foreground">
                CPU % per server (live)
              </p>
            </div>
          </div>
          {isLoading ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={(data?.serverMetrics ?? []).map((m: any) => ({
                  name: m.server?.name?.split(" ")[0] || m.serverId.slice(0, 6),
                  cpu: Number(m.cpuPercent?.toFixed(1) ?? 0),
                  ram: Number(
                    ((Number(m.ramUsedBytes) /
                      Math.max(1, Number(m.server?.ramTotalBytes || 1))) *
                      100).toFixed(1)
                  ),
                }))}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.06)"
                />
                <XAxis
                  dataKey="name"
                  stroke="rgba(255,255,255,0.4)"
                  fontSize={11}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.4)"
                  fontSize={11}
                  width={32}
                  unit="%"
                />
                <Tooltip
                  contentStyle={{
                    background: "rgba(20,20,22,0.95)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                />
                <Bar dataKey="cpu" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                <Bar dataKey="ram" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Tables */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card className="p-6 gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Aktivitas Terbaru
            </h2>
          </div>
          {isLoading ? (
            <Skeleton className="h-48 w-full rounded-lg" />
          ) : !data?.recentAuditLogs?.length ? (
            <EmptyState title="Belum ada aktivitas" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aksi</TableHead>
                  <TableHead>Pelaku</TableHead>
                  <TableHead className="text-right">Waktu</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentAuditLogs.map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <StatusBadge
                        status={auditActionStatus(log.action)}
                        label={log.action}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">
                          {log.user?.name || "Sistem"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {log.user?.role || log.actorType}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {timeAgo(log.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card className="p-6 gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Transaksi Terbaru
            </h2>
          </div>
          {isLoading ? (
            <Skeleton className="h-48 w-full rounded-lg" />
          ) : !data?.recentTransactions?.length ? (
            <EmptyState title="Belum ada transaksi" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Pelanggan</TableHead>
                  <TableHead className="text-right">Nominal</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentTransactions.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">
                      {t.invoiceNumber}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">
                          {t.customer?.name || "-"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t.customer?.customerCode}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {formatCurrency(t.amount, t.currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      <StatusBadge status={t.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}

function auditActionStatus(action: string): string {
  if (!action) return "PENDING";
  if (action.includes("LOGIN") || action.includes("LOGOUT")) return "ACTIVE";
  if (action.includes("CREATE") || action.includes("INSTALL")) return "PAID";
  if (action.includes("UPDATE") || action.includes("APPROVE")) return "PENDING";
  if (action.includes("DELETE") || action.includes("REVOKE") || action.includes("REJECT"))
    return "REVOKED";
  return "ACTIVE";
}
