"use client";

import * as React from "react";
import {
  ArrowLeft,
  Cpu,
  HardDrive,
  Loader2,
  MemoryStick,
  Package,
  Play,
  RotateCw,
  ShieldAlert,
  Square,
  Trash2,
  Users,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "../PageHeader";
import { StatusBadge } from "../StatusBadge";
import { EmptyState, apiFetch, engineColor, statusBadgeClass } from "../lib";
import { useAppStore } from "@/lib/store";
import {
  formatBytes,
  formatCurrency,
  formatDateTime,
  getCountryFlag,
  timeAgo,
} from "@/lib/utils-mvmp";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ServerDetail {
  id: string;
  name: string;
  hostname: string;
  publicIp: string;
  privateIp?: string | null;
  region: string;
  countryCode: string;
  provider: string;
  osName: string;
  osVersion: string;
  kernelVersion?: string | null;
  architecture: string;
  cpuCores: number;
  ramTotalBytes: number;
  diskTotalBytes: number;
  maxAccounts: number;
  status: string;
  maintenanceMode: boolean;
  monthlyCost: number;
  agent?: {
    status: string;
    lastHeartbeatAt?: string | null;
    agentVersion: string;
  } | null;
  protocols?: any[];
  firewallRules?: any[];
  serverPorts?: any[];
  vpnAccountsByStatus?: Record<string, number>;
  metrics24h?: any[];
  _count?: { vpnAccounts: number };
}

export function ServerDetailView() {
  const selectedServerId = useAppStore((s) => s.selectedServerId);
  const setView = useAppStore((s) => s.setView);

  const { data, isLoading } = useQuery<ServerDetail>({
    queryKey: ["server", selectedServerId],
    queryFn: () => apiFetch(`/api/servers/${selectedServerId}`),
    enabled: !!selectedServerId,
  });

  if (!selectedServerId) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setView("servers")}
        >
          <ArrowLeft className="h-4 w-4" />
          Daftar Server
        </Button>
        <EmptyState
          title="Server tidak dipilih"
          description="Pilih server dari daftar untuk melihat detail."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setView("servers")}
        >
          <ArrowLeft className="h-4 w-4" />
          Daftar Server
        </Button>
      </div>

      {isLoading || !data ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <PageHeader
            title={
              <span className="flex items-center gap-2">
                <span className="text-base">{getCountryFlag(data.countryCode)}</span>
                {data.name}
              </span>
            }
            description={`${data.hostname} · ${data.publicIp}`}
            actions={
              <div className="flex gap-2">
                <StatusBadge status={data.status} />
                <StatusBadge
                  status={data.agent?.status ?? "OFFLINE"}
                  label={`Agent ${data.agent?.status ?? "OFFLINE"}`}
                />
              </div>
            }
          />

          <Tabs defaultValue="ringkasan">
            <TabsList className="w-fit flex-wrap h-auto">
              <TabsTrigger value="ringkasan">Ringkasan</TabsTrigger>
              <TabsTrigger value="protokol">
                Protokol ({data.protocols?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="akun">
                Akun VPN ({data._count?.vpnAccounts ?? 0})
              </TabsTrigger>
              <TabsTrigger value="metrik">Metrik</TabsTrigger>
              <TabsTrigger value="firewall">Firewall</TabsTrigger>
            </TabsList>

            <TabsContent value="ringkasan">
              <RingkasanTab server={data} />
            </TabsContent>
            <TabsContent value="protokol">
              <ProtokolTab server={data} />
            </TabsContent>
            <TabsContent value="akun">
              <AkunTab server={data} />
            </TabsContent>
            <TabsContent value="metrik">
              <MetrikTab server={data} />
            </TabsContent>
            <TabsContent value="firewall">
              <FirewallTab server={data} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ringkasan
// ---------------------------------------------------------------------------

function RingkasanTab({ server }: { server: ServerDetail }) {
  const latest = server.metrics24h?.[0];
  const ramUsed = Number(latest?.ramUsedBytes ?? 0);
  const ramTotal = Number(server.ramTotalBytes);
  const ramPct = ramTotal ? Math.min(100, (ramUsed / ramTotal) * 100) : 0;
  const diskUsed = Number(latest?.diskUsedBytes ?? 0);
  const diskTotal = Number(server.diskTotalBytes);
  const diskPct = diskTotal ? Math.min(100, (diskUsed / diskTotal) * 100) : 0;
  const cpuPct = Number(latest?.cpuPercent ?? 0);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-6 gap-4 lg:col-span-2">
        <h2 className="text-sm font-semibold text-foreground">
          Informasi Server
        </h2>
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <InfoRow label="Nama" value={server.name} />
          <InfoRow label="Hostname" value={server.hostname} mono />
          <InfoRow label="IP Public" value={server.publicIp} mono />
          <InfoRow
            label="IP Private"
            value={server.privateIp || "-"}
            mono
          />
          <InfoRow label="Region" value={server.region} />
          <InfoRow
            label="Country"
            value={`${getCountryFlag(server.countryCode)} ${server.countryCode}`}
          />
          <InfoRow label="Provider" value={server.provider} />
          <InfoRow label="OS" value={`${server.osName} ${server.osVersion}`} />
          <InfoRow
            label="Kernel"
            value={server.kernelVersion || "-"}
            mono
          />
          <InfoRow label="Architecture" value={server.architecture} />
          <InfoRow label="CPU Cores" value={`${server.cpuCores} vCPU`} />
          <InfoRow label="Max Accounts" value={String(server.maxAccounts)} />
          <InfoRow
            label="Biaya Bulanan"
            value={formatCurrency(server.monthlyCost)}
          />
          <InfoRow
            label="Maintenance"
            value={server.maintenanceMode ? "Aktif" : "Nonaktif"}
          />
          <InfoRow
            label="Agent Version"
            value={server.agent?.agentVersion || "-"}
          />
          <InfoRow
            label="Last Heartbeat"
            value={
              server.agent?.lastHeartbeatAt
                ? timeAgo(server.agent.lastHeartbeatAt)
                : "-"
            }
          />
        </div>
      </Card>

      <Card className="p-6 gap-4">
        <h2 className="text-sm font-semibold text-foreground">
          Metrik Terbaru
        </h2>
        {latest ? (
          <div className="space-y-4">
            <MetricRow
              icon={Cpu}
              label="CPU Usage"
              value={`${cpuPct.toFixed(1)}%`}
              pct={cpuPct}
              colorClass="bg-cyan-500"
            />
            <MetricRow
              icon={MemoryStick}
              label="RAM Usage"
              value={`${formatBytes(ramUsed)} / ${formatBytes(ramTotal)}`}
              pct={ramPct}
              colorClass="bg-emerald-500"
            />
            <MetricRow
              icon={HardDrive}
              label="Disk Usage"
              value={`${formatBytes(diskUsed)} / ${formatBytes(diskTotal)}`}
              pct={diskPct}
              colorClass="bg-amber-500"
            />
            <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                Akun Aktif
              </span>
              <span className="font-semibold text-foreground">
                {latest.activeAccounts ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Bandwidth</span>
              <span className="font-semibold text-foreground">
                {(latest.bandwidthMbps ?? 0).toFixed(2)} Mbps
              </span>
            </div>
          </div>
        ) : (
          <EmptyState title="Belum ada metrik" />
        )}
      </Card>

      <Card className="p-6 gap-4 lg:col-span-3">
        <h2 className="text-sm font-semibold text-foreground">
          Status Akun VPN
        </h2>
        {server.vpnAccountsByStatus &&
        Object.keys(server.vpnAccountsByStatus).length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {Object.entries(server.vpnAccountsByStatus).map(([s, c]) => (
              <StatusBadge key={s} status={s} label={`${s} · ${c}`} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Belum ada akun VPN terdaftar di server ini.
          </p>
        )}
      </Card>
    </div>
  );
}

function MetricRow({
  icon: Icon,
  label,
  value,
  pct,
  colorClass,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  pct: number;
  colorClass: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </span>
        <span className="font-medium text-foreground">{value}</span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full transition-all", colorClass)}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-sm text-foreground truncate",
          mono && "font-mono text-xs"
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Protokol
// ---------------------------------------------------------------------------

function ProtokolTab({ server }: { server: ServerDetail }) {
  const qc = useQueryClient();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function performAction(
    protocolId: string,
    action: string,
    name: string
  ) {
    setBusyId(protocolId + action);
    try {
      await apiFetch(
        `/api/servers/${server.id}/protocols/${protocolId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ action }),
        }
      );
      toast.success(`${name}: ${action} berhasil`);
      qc.invalidateQueries({ queryKey: ["server", server.id] });
    } catch (e: any) {
      toast.error(e?.message || "Gagal menjalankan aksi");
    } finally {
      setBusyId(null);
    }
  }

  const protocols = server.protocols ?? [];

  if (!protocols.length) {
    return (
      <Card className="p-6">
        <EmptyState
          icon={Package}
          title="Belum ada protokol"
          description="Tidak ada protokol yang terinstal pada server ini."
        />
      </Card>
    );
  }

  return (
    <Card className="p-0 gap-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Protokol</TableHead>
            <TableHead>Engine</TableHead>
            <TableHead>Versi</TableHead>
            <TableHead>Port</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Installed</TableHead>
            <TableHead className="text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {protocols.map((sp: any) => {
            const p = sp.protocol;
            const color = engineColor(p?.engine || "");
            return (
              <TableRow key={sp.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">
                      {p?.displayName}
                    </span>
                    {p?.isPremium ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          "mt-0.5 w-fit",
                          statusBadgeClass("amber")
                        )}
                      >
                        Premium
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={statusBadgeClass(color)}
                  >
                    {p?.engine}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground font-mono">
                  {sp.engineVersion || "-"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground font-mono">
                  {sp.port ? `${sp.port}/${sp.transport || "tcp"}` : "-"}
                </TableCell>
                <TableCell>
                  <StatusBadge status={sp.status} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {sp.installedAt ? timeAgo(sp.installedAt) : "-"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <ActionButton
                      icon={Play}
                      label="Start"
                      loading={busyId === p?.id + "start"}
                      disabled={sp.status === "RUNNING"}
                      onClick={() => performAction(p?.id, "start", p?.displayName)}
                    />
                    <ActionButton
                      icon={Square}
                      label="Stop"
                      loading={busyId === p?.id + "stop"}
                      disabled={sp.status === "STOPPED" || sp.status === "NOT_INSTALLED"}
                      onClick={() => performAction(p?.id, "stop", p?.displayName)}
                    />
                    <ActionButton
                      icon={RotateCw}
                      label="Restart"
                      loading={busyId === p?.id + "restart"}
                      disabled={sp.status === "NOT_INSTALLED"}
                      onClick={() => performAction(p?.id, "restart", p?.displayName)}
                    />
                    <ActionButton
                      icon={RotateCw}
                      label="Update"
                      loading={busyId === p?.id + "update"}
                      onClick={() => performAction(p?.id, "update", p?.displayName)}
                    />
                    <ActionButton
                      icon={Trash2}
                      label="Uninstall"
                      loading={busyId === p?.id + "uninstall"}
                      disabled={sp.status === "NOT_INSTALLED"}
                      danger
                      onClick={() => performAction(p?.id, "uninstall", p?.displayName)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  loading,
  disabled,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("size-7", danger && "hover:bg-rose-500/10 hover:text-rose-400")}
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={label}
      title={label}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Icon className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Akun VPN (read-only overview; uses server.vpnAccountsByStatus)
// ---------------------------------------------------------------------------

function AkunTab({ server }: { server: ServerDetail }) {
  const byStatus = server.vpnAccountsByStatus ?? {};
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  return (
    <Card className="p-6 gap-4">
      <h2 className="text-sm font-semibold text-foreground">
        Distribusi Akun VPN ({total} total)
      </h2>
      {!total ? (
        <EmptyState title="Belum ada akun" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(byStatus).map(([status, count]) => (
            <div
              key={status}
              className="rounded-lg border border-border/60 bg-muted/20 p-4 flex items-center justify-between"
            >
              <StatusBadge status={status} />
              <span className="text-2xl font-semibold text-foreground">
                {count as number}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Metrik
// ---------------------------------------------------------------------------

function MetrikTab({ server }: { server: ServerDetail }) {
  const metrics = (server.metrics24h ?? []).slice().reverse();
  if (!metrics.length) {
    return (
      <Card className="p-6">
        <EmptyState title="Belum ada data metrik 24 jam" />
      </Card>
    );
  }
  const data = metrics.map((m: any) => ({
    time: new Date(m.recordedAt).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    cpu: Number(m.cpuPercent?.toFixed(1) ?? 0),
    ram:
      Number(server.ramTotalBytes) > 0
        ? Number(
            ((Number(m.ramUsedBytes) / Number(server.ramTotalBytes)) * 100).toFixed(1)
          )
        : 0,
    bw: Number(m.bandwidthMbps?.toFixed(2) ?? 0),
  }));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-6 gap-4 lg:col-span-2">
        <h2 className="text-sm font-semibold text-foreground">
          CPU & RAM (%) — 24 jam
        </h2>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="time" stroke="rgba(255,255,255,0.4)" fontSize={11} />
            <YAxis
              stroke="rgba(255,255,255,0.4)"
              fontSize={11}
              unit="%"
              width={40}
            />
            <RTooltip
              contentStyle={{
                background: "rgba(20,20,22,0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Line type="monotone" dataKey="cpu" stroke="#06b6d4" strokeWidth={2} dot={false} name="CPU %" />
            <Line type="monotone" dataKey="ram" stroke="#10b981" strokeWidth={2} dot={false} name="RAM %" />
          </LineChart>
        </ResponsiveContainer>
      </Card>
      <Card className="p-6 gap-4 lg:col-span-2">
        <h2 className="text-sm font-semibold text-foreground">
          Bandwidth (Mbps) — 24 jam
        </h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="time" stroke="rgba(255,255,255,0.4)" fontSize={11} />
            <YAxis stroke="rgba(255,255,255,0.4)" fontSize={11} width={48} unit=" Mbps" />
            <RTooltip
              contentStyle={{
                background: "rgba(20,20,22,0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Line type="monotone" dataKey="bw" stroke="#f59e0b" strokeWidth={2} dot={false} name="Bandwidth" />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Firewall
// ---------------------------------------------------------------------------

function FirewallTab({ server }: { server: ServerDetail }) {
  const rules = server.firewallRules ?? [];
  if (!rules.length) {
    return (
      <Card className="p-6">
        <EmptyState
          icon={ShieldAlert}
          title="Belum ada firewall rule"
          description="Tidak ada rule firewall pada server ini."
        />
      </Card>
    );
  }
  return (
    <Card className="p-0 gap-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Arah</TableHead>
            <TableHead>Protokol</TableHead>
            <TableHead>Port</TableHead>
            <TableHead>Source CIDR</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Dibuat</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.map((r: any) => (
            <TableRow key={r.id}>
              <TableCell className="text-sm">
                {r.direction === "ingress" ? "↓ In" : "↑ Out"}
              </TableCell>
              <TableCell className="font-mono text-xs uppercase">
                {r.protocol}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {r.portStart === r.portEnd
                  ? r.portStart
                  : `${r.portStart}-${r.portEnd}`}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {r.sourceCidr || "0.0.0.0/0"}
              </TableCell>
              <TableCell>
                <StatusBadge
                  status={r.action === "allow" ? "ACTIVE" : "REVOKED"}
                  label={r.action}
                />
              </TableCell>
              <TableCell>
                <StatusBadge
                  status={r.enabled ? "ACTIVE" : "SUSPENDED"}
                  label={r.enabled ? "Enabled" : "Disabled"}
                />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatDateTime(r.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
