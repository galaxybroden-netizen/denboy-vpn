"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Activity,
  Cpu,
  Eye,
  HardDrive,
  ListChecks,
  Server as ServerIcon,
  Zap,
} from "lucide-react";
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
  formatNumber,
  timeAgo,
} from "@/lib/utils-mvmp";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface MonitoringData {
  servers: any[];
  aggregate: {
    totalActiveAccounts: number;
    totalBandwidthMbps: number;
    avgCpu: number;
    avgRamBytes: number;
  };
  recentJobs: any[];
  alerts: any[];
}

export function MonitoringView() {
  const openServer = useAppStore((s) => s.openServer);
  const { data, isLoading } = useQuery<MonitoringData>({
    queryKey: ["monitoring"],
    queryFn: () => apiFetch("/api/monitoring"),
    refetchInterval: 30_000,
  });

  const agg = data?.aggregate;
  const servers = data?.servers ?? [];
  const jobs = data?.recentJobs ?? [];
  const alerts = data?.alerts ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monitoring"
        description="Status real-time server & job queue"
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <StatCard
              title="Avg CPU"
              value={`${(agg?.avgCpu ?? 0).toFixed(1)}%`}
              icon={Cpu}
              accent="cyan"
            />
            <StatCard
              title="Total Bandwidth"
              value={`${(agg?.totalBandwidthMbps ?? 0).toFixed(1)} Mbps`}
              icon={Zap}
              accent="emerald"
            />
            <StatCard
              title="Akun Aktif"
              value={formatNumber(agg?.totalActiveAccounts ?? 0)}
              icon={Activity}
              accent="amber"
            />
            <StatCard
              title="Alerts"
              value={alerts.length}
              icon={AlertTriangle}
              accent="rose"
              sublabel={`${jobs.filter((j) => j.status === "QUEUED" || j.status === "PROCESSING").length} job aktif`}
            />
          </>
        )}
      </div>

      {/* Server Health */}
      <Card className="p-6 gap-4">
        <h2 className="text-sm font-semibold text-foreground">
          Kesehatan Server
        </h2>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !servers.length ? (
          <EmptyState icon={ServerIcon} title="Belum ada server" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Server</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>CPU %</TableHead>
                <TableHead>RAM %</TableHead>
                <TableHead>Disk %</TableHead>
                <TableHead>Bandwidth</TableHead>
                <TableHead>Akun</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers.map((s: any) => {
                const m = s.latestMetric;
                const cpu = Number(m?.cpuPercent ?? 0);
                const ramPct =
                  s.ramTotalBytes > 0
                    ? Math.min(100, (Number(m?.ramUsedBytes ?? 0) / Number(s.ramTotalBytes)) * 100)
                    : 0;
                const diskPct =
                  s.diskTotalBytes > 0
                    ? Math.min(100, (Number(m?.diskUsedBytes ?? 0) / Number(s.diskTotalBytes)) * 100)
                    : 0;
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">
                          {s.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {s.publicIp}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <StatusBadge status={s.agent?.status ?? "OFFLINE"} />
                        <span className="text-xs text-muted-foreground mt-1">
                          {timeAgo(s.agent?.lastHeartbeatAt ?? null)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <UsageBar pct={cpu} />
                    </TableCell>
                    <TableCell>
                      <UsageBar pct={ramPct} />
                    </TableCell>
                    <TableCell>
                      <UsageBar pct={diskPct} />
                    </TableCell>
                    <TableCell className="text-xs">
                      {(Number(m?.bandwidthMbps ?? 0)).toFixed(2)} Mbps
                    </TableCell>
                    <TableCell className="text-sm">
                      {m?.activeAccounts ?? 0}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={s.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => openServer(s.id)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Buka detail server</TooltipContent>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Job Queue + Alerts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-6 gap-4 lg:col-span-2">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-foreground">
              Antrian Job (20 terbaru)
            </h2>
          </div>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !jobs.length ? (
            <EmptyState icon={ListChecks} title="Belum ada job" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Server</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Mulai</TableHead>
                  <TableHead>Selesai</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j: any) => (
                  <TableRow key={j.id}>
                    <TableCell className="text-xs">
                      {j.server?.name || "-"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {j.jobType}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={j.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {timeAgo(j.startedAt ?? j.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {j.completedAt ? timeAgo(j.completedAt) : "-"}
                    </TableCell>
                    <TableCell className="text-xs text-rose-400 max-w-[200px] truncate">
                      {j.errorMessage || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card className="p-6 gap-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-foreground">
              Alerts
            </h2>
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">
              {alerts.length}
            </span>
          </div>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !alerts.length ? (
            <EmptyState
              icon={Activity}
              title="Tidak ada alert"
              description="Semua server dalam kondisi sehat."
            />
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin">
              {alerts.map((a: any) => (
                <div
                  key={a.serverId}
                  className="rounded-lg border border-amber-500/30 bg-amber-500/[0.04] p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">
                      {a.serverName}
                    </span>
                    <StatusBadge status={a.serverStatus} />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {a.alertTypes?.map((t: string) => (
                      <span
                        key={t}
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-medium",
                          t === "HIGH_CPU" && "bg-rose-500/15 text-rose-400",
                          t === "AGENT_NOT_ONLINE" && "bg-amber-500/15 text-amber-400",
                          t === "MAINTENANCE_MODE" && "bg-zinc-500/15 text-zinc-400"
                        )}
                      >
                        {t.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                  {a.cpuPercent !== null ? (
                    <p className="text-xs text-muted-foreground">
                      CPU: {a.cpuPercent?.toFixed(1)}% ·{" "}
                      {a.region}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function UsageBar({ pct }: { pct: number }) {
  const v = Math.min(100, Math.max(0, pct));
  const color =
    v >= 90
      ? "bg-rose-500"
      : v >= 75
      ? "bg-amber-500"
      : v >= 50
      ? "bg-cyan-500"
      : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 w-24 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full transition-all", color)}
          style={{ width: `${v}%` }}
        />
      </div>
      <span className="text-xs font-mono text-muted-foreground">
        {v.toFixed(1)}%
      </span>
    </div>
  );
}
