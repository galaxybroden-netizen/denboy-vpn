"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Globe,
  Map as MapIcon,
  MapPin,
  Server as ServerIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "../PageHeader";
import { StatusBadge } from "../StatusBadge";
import { EmptyState, apiFetch, statusBadgeClass } from "../lib";
import { useAppStore } from "@/lib/store";
import {
  formatBytes,
  getCountryFlag,
  timeAgo,
} from "@/lib/utils-mvmp";
import { cn } from "@/lib/utils";

interface MapServer {
  id: string;
  name: string;
  hostname: string;
  publicIp: string;
  region: string;
  countryCode: string;
  status: string;
  provider: string;
  cpuCores: number;
  ramTotalBytes: number;
  maxAccounts: number;
  lastSeenAt: string | null;
  agentStatus: string;
  agentVersion: string | null;
  lastHeartbeatAt: string | null;
  protocolsRunning: number;
  activeAccounts: number;
  lat: number;
  lng: number;
}

interface MapData {
  items: MapServer[];
}

// Equirectangular projection: lat/lng → svg x/y on a 1000×500 canvas
function project(lat: number, lng: number): { x: number; y: number } {
  const x = ((lng + 180) * 1000) / 360;
  const y = ((90 - lat) * 500) / 180;
  return { x, y };
}

// Simplified continent shapes (rough polygons) for the world map silhouette.
const CONTINENT_PATHS = [
  // North America
  "M 80 90 L 130 75 L 200 75 L 270 95 L 290 130 L 280 180 L 250 220 L 220 250 L 180 270 L 140 250 L 110 215 L 90 170 L 75 130 Z",
  // Central America strip
  "M 200 250 L 240 260 L 250 290 L 225 295 L 205 280 Z",
  // South America
  "M 240 290 L 300 285 L 325 320 L 330 360 L 310 410 L 285 440 L 265 430 L 255 390 L 245 350 Z",
  // Greenland
  "M 330 70 L 380 70 L 385 100 L 360 120 L 335 110 Z",
  // Europe
  "M 460 90 L 520 80 L 575 85 L 590 120 L 575 165 L 545 185 L 510 195 L 480 180 L 460 150 Z",
  // UK / Ireland
  "M 445 110 L 460 110 L 462 140 L 450 150 L 442 130 Z",
  // Scandinavia
  "M 510 60 L 555 55 L 560 90 L 535 95 L 515 85 Z",
  // Africa
  "M 470 195 L 530 195 L 590 215 L 610 270 L 605 320 L 575 380 L 540 410 L 510 405 L 485 365 L 470 305 L 465 250 Z",
  // Middle East
  "M 590 170 L 640 170 L 650 215 L 625 225 L 600 210 Z",
  // Asia (main)
  "M 580 90 L 700 80 L 800 85 L 870 105 L 905 145 L 895 195 L 855 225 L 800 245 L 745 255 L 700 240 L 660 215 L 620 195 L 595 170 Z",
  // India
  "M 660 215 L 705 215 L 720 260 L 700 290 L 675 280 L 660 245 Z",
  // Southeast Asia
  "M 745 230 L 790 235 L 800 270 L 775 290 L 750 280 Z",
  // Indonesia archipelago
  "M 770 300 L 820 300 L 835 315 L 815 325 L 785 320 Z",
  "M 840 305 L 870 305 L 875 320 L 850 322 Z",
  // Japan
  "M 870 150 L 895 145 L 900 175 L 880 195 L 868 175 Z",
  // Philippines
  "M 830 230 L 845 230 L 850 260 L 835 270 L 828 250 Z",
  // Australia
  "M 800 340 L 870 335 L 905 360 L 910 395 L 870 410 L 825 405 L 800 380 Z",
  // New Zealand
  "M 925 400 L 940 395 L 945 420 L 930 425 Z",
];

export function ServerMapView() {
  const { data, isLoading } = useQuery<MapData>({
    queryKey: ["servers-map"],
    queryFn: () => apiFetch("/api/servers/map"),
    refetchInterval: 30_000,
  });

  const servers = data?.items ?? [];
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const stats = React.useMemo(() => {
    const total = servers.length;
    const online = servers.filter((s) => s.status === "ONLINE").length;
    const offline = servers.filter(
      (s) => s.status === "OFFLINE" || s.status === "ERROR"
    ).length;
    const regions = new Set(
      servers.map((s) => `${s.countryCode}-${s.region}`)
    ).size;
    return { total, online, offline, regions };
  }, [servers]);

  const selected = React.useMemo(
    () => servers.find((s) => s.id === selectedId) ?? null,
    [servers, selectedId]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Server Map"
        description="Distribusi geografis server VPN"
      />

      {/* Stats row */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))
        ) : (
          <>
            <MiniStat
              icon={ServerIcon}
              label="Total Server"
              value={stats.total}
              accent="cyan"
            />
            <MiniStat
              icon={Activity}
              label="Online"
              value={stats.online}
              accent="emerald"
            />
            <MiniStat
              icon={ServerIcon}
              label="Offline"
              value={stats.offline}
              accent="rose"
            />
            <MiniStat
              icon={Globe}
              label="Total Region"
              value={stats.regions}
              accent="amber"
            />
          </>
        )}
      </div>

      {/* Map + Detail panel */}
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card className="p-4 gap-3 overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapIcon className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-foreground">
                Peta Distribusi Server
              </h2>
            </div>
            <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
              <LegendDot color="emerald" label="ONLINE" />
              <LegendDot color="rose" label="OFFLINE" />
              <LegendDot color="zinc" label="DECOMMISSIONED" />
            </div>
          </div>

          {isLoading ? (
            <Skeleton className="h-[420px] w-full rounded-lg" />
          ) : !servers.length ? (
            <EmptyState
              icon={MapPin}
              title="Belum ada server"
              description="Server yang terdaftar akan muncul di peta ini."
              className="h-[420px]"
            />
          ) : (
            <WorldMap
              servers={servers}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </Card>

        {/* Detail panel */}
        <Card className="p-6 gap-4">
          {selected ? (
            <ServerDetail server={selected} />
          ) : (
            <EmptyState
              icon={MapPin}
              title="Pilih server di peta"
              description="Klik penanda pada peta untuk melihat detail server."
            />
          )}
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// World map (inline SVG)
// ---------------------------------------------------------------------------

function WorldMap({
  servers,
  selectedId,
  onSelect,
}: {
  servers: MapServer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-border/60 bg-muted/20">
      <svg
        viewBox="0 0 1000 500"
        className="block w-full h-auto"
        role="img"
        aria-label="Peta distribusi server VPN"
      >
        {/* Background ocean — pointer-events:none */}
        <rect
          x="0"
          y="0"
          width="1000"
          height="500"
          className="fill-background"
          pointerEvents="none"
        />

        {/* Subtle grid (graticule) — pointer-events:none */}
        <g className="stroke-muted-foreground/10" strokeWidth="0.5" pointerEvents="none">
          {Array.from({ length: 11 }).map((_, i) => (
            <line
              key={`v-${i}`}
              x1={i * 100}
              y1="0"
              x2={i * 100}
              y2="500"
              pointerEvents="none"
            />
          ))}
          {Array.from({ length: 6 }).map((_, i) => (
            <line
              key={`h-${i}`}
              x1="0"
              y1={i * 100}
              x2="1000"
              y2={i * 100}
              pointerEvents="none"
            />
          ))}
        </g>

        {/* Continents — pointer-events:none so server pins are clickable */}
        <g
          className="fill-muted stroke-muted-foreground/30"
          strokeWidth="0.75"
          pointerEvents="none"
        >
          {CONTINENT_PATHS.map((d, i) => (
            <path key={i} d={d} pointerEvents="none" />
          ))}
        </g>

        {/* Server markers */}
        <g>
          {servers.map((s) => {
            const { x, y } = project(s.lat, s.lng);
            const color =
              s.status === "ONLINE"
                ? "emerald"
                : s.status === "OFFLINE" || s.status === "ERROR"
                ? "rose"
                : "zinc";
            const fill =
              color === "emerald"
                ? "#10b981"
                : color === "rose"
                ? "#f43f5e"
                : "#71717a";
            const isOnline = s.status === "ONLINE";
            const isSelected = selectedId === s.id;
            return (
              <g
                key={s.id}
                transform={`translate(${x}, ${y})`}
                className="cursor-pointer"
                onClick={() => onSelect(s.id)}
              >
                <title>{`${s.name} — ${s.status}`}</title>
                {/* Outer pulse halo for online — fill-box origin so the ping
                    scales around the pin itself, not the SVG viewBox center
                    (a view-box origin makes the <g> bbox huge and steals clicks) */}
                {isOnline ? (
                  <circle
                    r="14"
                    fill={fill}
                    fillOpacity="0.18"
                    className="animate-ping"
                    style={{
                      animationDuration: "2.4s",
                      transformBox: "fill-box",
                      transformOrigin: "center",
                    }}
                  />
                ) : null}
                {/* Selection ring */}
                {isSelected ? (
                  <circle
                    r="13"
                    fill="none"
                    stroke={fill}
                    strokeWidth="2"
                    strokeOpacity="0.9"
                  />
                ) : null}
                <circle
                  r="8"
                  fill={fill}
                  stroke="white"
                  strokeOpacity="0.9"
                  strokeWidth="1.5"
                  className="transition-transform duration-150 hover:scale-125"
                />
                {/* Tiny label dot */}
                <circle r="2" fill="white" fillOpacity="0.9" />
              </g>
            );
          })}
        </g>
      </svg>

      {/* Server count badge overlay */}
      <div className="absolute left-3 top-3 rounded-md bg-background/80 px-2 py-1 text-xs text-muted-foreground backdrop-blur">
        {servers.length} server
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Server detail panel
// ---------------------------------------------------------------------------

function ServerDetail({ server }: { server: MapServer }) {
  const openServer = useAppStore((s) => s.openServer);
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xl leading-none">
              {getCountryFlag(server.countryCode)}
            </span>
            <h3 className="text-sm font-semibold text-foreground truncate">
              {server.name}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground font-mono truncate">
            {server.publicIp}
          </p>
        </div>
        <StatusBadge status={server.status} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Info label="Region" value={`${server.region}`} />
        <Info label="Provider" value={server.provider} />
        <Info label="CPU" value={`${server.cpuCores} core`} />
        <Info label="RAM" value={formatBytes(server.ramTotalBytes)} />
        <Info
          label="Protokol Aktif"
          value={`${server.protocolsRunning}`}
        />
        <Info
          label="Max Akun"
          value={`${server.maxAccounts}`}
        />
      </div>

      <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Agent</span>
          <StatusBadge status={server.agentStatus} />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Versi</span>
          <span className="font-mono text-foreground">
            {server.agentVersion || "-"}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Heartbeat</span>
          <span className="text-foreground">
            {timeAgo(server.lastHeartbeatAt)}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Akun Aktif</span>
          <span className="text-foreground">{server.activeAccounts}</span>
        </div>
      </div>

      <Button
        className="w-full"
        onClick={() => openServer(server.id)}
      >
        <ServerIcon className="h-4 w-4" />
        Lihat Detail
      </Button>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 space-y-0.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-medium text-foreground truncate">{value}</p>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  accent: "emerald" | "rose" | "cyan" | "amber";
}) {
  const chip =
    accent === "emerald"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : accent === "rose"
      ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
      : accent === "cyan"
      ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/30"
      : "bg-amber-500/15 text-amber-400 border-amber-500/30";
  return (
    <Card className="p-4 gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md border",
            chip
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
    </Card>
  );
}

function LegendDot({
  color,
  label,
}: {
  color: "emerald" | "rose" | "zinc";
  label: string;
}) {
  const cls =
    color === "emerald"
      ? "bg-emerald-400"
      : color === "rose"
      ? "bg-rose-400"
      : "bg-zinc-400";
  const badgeCls = statusBadgeClass(color);
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-full", cls)} />
      <Badge variant="outline" className={cn("text-[10px]", badgeCls)}>
        {label}
      </Badge>
    </span>
  );
}
