"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  History,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "../PageHeader";
import { StatusBadge } from "../StatusBadge";
import { EmptyState, apiFetch, statusBadgeClass } from "../lib";
import { formatDateTime } from "@/lib/utils-mvmp";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface AuditLogItem {
  id: string;
  action: string;
  actorType: string;
  resourceType?: string | null;
  resourceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: any;
  createdAt: string;
  user?: { id: string; name: string; role: string; email: string } | null;
}

const ACTIONS = [
  { value: "", label: "Semua Aksi" },
  { value: "LOGIN", label: "Login / Logout" },
  { value: "CREATE", label: "Create" },
  { value: "UPDATE", label: "Update" },
  { value: "DELETE", label: "Delete" },
  { value: "APPROVE", label: "Approve" },
  { value: "REJECT", label: "Reject" },
  { value: "REVOKE", label: "Revoke" },
  { value: "SERVER", label: "Server" },
  { value: "PROTOCOL", label: "Protocol" },
  { value: "VPN_ACCOUNT", label: "VPN Account" },
  { value: "PAYMENT", label: "Payment" },
];

const ACTOR_TYPES = [
  { value: "", label: "Semua Pelaku" },
  { value: "USER", label: "User" },
  { value: "ADMIN", label: "Admin" },
  { value: "SUPER_ADMIN", label: "Super Admin" },
  { value: "AGENT", label: "Agent" },
];

function actionColor(action: string): string {
  if (action.includes("LOGIN") || action.includes("LOGOUT")) return "blue";
  if (action.includes("CREATE") || action.includes("INSTALL") || action.includes("APPROVE"))
    return "emerald";
  if (action.includes("UPDATE") || action.includes("START") || action.includes("RENEW"))
    return "amber";
  if (action.includes("DELETE") || action.includes("REVOKE") || action.includes("REJECT"))
    return "rose";
  if (action.includes("ALERT")) return "orange";
  return "zinc";
}

export function AuditLogsView() {
  const [page, setPage] = React.useState(1);
  const [action, setAction] = React.useState("");
  const [actorType, setActorType] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [detailItem, setDetailItem] = React.useState<AuditLogItem | null>(null);

  const debounced = useDebounce(search, 400);

  const params = new URLSearchParams({ page: String(page), limit: "20" });
  if (action) params.set("action", action);
  if (actorType) params.set("actorType", actorType);
  if (debounced) params.set("resourceType", debounced);

  const { data, isLoading } = useQuery<{
    items: AuditLogItem[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>({
    queryKey: ["audit-logs", page, action, actorType, debounced],
    queryFn: () => apiFetch(`/api/audit-logs?${params.toString()}`),
  });

  const items = data?.items ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description="Jejak tindakan sensitif di sistem"
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Select value={action} onValueChange={(v) => { setAction(v); setPage(1); }}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Aksi" />
          </SelectTrigger>
          <SelectContent>
            {ACTIONS.map((a) => (
              <SelectItem key={a.value || "all"} value={a.value || "all"}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={actorType} onValueChange={(v) => { setActorType(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Tipe Pelaku" />
          </SelectTrigger>
          <SelectContent>
            {ACTOR_TYPES.map((a) => (
              <SelectItem key={a.value || "all"} value={a.value || "all"}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Cari resource type…"
            className="pl-9"
          />
        </div>
      </div>

      <Card className="p-0 gap-0 overflow-hidden">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !items.length ? (
          <EmptyState
            icon={History}
            title="Belum ada audit log"
            description="Coba ubah filter."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Aksi</TableHead>
                <TableHead>Pelaku</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Resource ID</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>User Agent</TableHead>
                <TableHead className="text-right">Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((log) => {
                const color = actionColor(log.action);
                return (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(log.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(statusBadgeClass(color), "font-mono")}
                      >
                        {log.action}
                      </Badge>
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
                    <TableCell className="text-xs text-muted-foreground">
                      {log.resourceType || "-"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground max-w-[160px] truncate">
                      {log.resourceId || "-"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {log.ipAddress || "-"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate">
                      {log.userAgent || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => setDetailItem(log)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Lihat detail log</TooltipContent>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {pagination && pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {pagination.total} log · halaman {pagination.page} /{" "}
            {pagination.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              Sebelumnya
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Berikutnya
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {/* Log Detail Dialog — audit logs are immutable (Read-only) */}
      <Dialog
        open={!!detailItem}
        onOpenChange={(v) => !v && setDetailItem(null)}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4 text-emerald-400" />
              {detailItem?.action}
            </DialogTitle>
            <DialogDescription>
              {detailItem
                ? `${formatDateTime(detailItem.createdAt)} · ${detailItem.user?.name || detailItem.actorType}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <Row label="Pelaku" value={detailItem?.user?.name || detailItem?.actorType} />
            <Row label="Role" value={detailItem?.user?.role || "-"} />
            <Row label="Resource" value={detailItem?.resourceType || "-"} />
            <Row label="Resource ID" value={detailItem?.resourceId || "-"} />
            <Row label="IP Address" value={detailItem?.ipAddress || "-"} />
            <Row
              label="User Agent"
              value={detailItem?.userAgent || "-"}
            />
            <div className="space-y-1.5 pt-1">
              <p className="text-xs text-muted-foreground">Metadata</p>
              <pre className="whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs font-mono leading-relaxed max-h-64 overflow-y-auto">
                {detailItem?.metadata
                  ? JSON.stringify(detailItem.metadata, null, 2)
                  : "-"}
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-foreground text-right break-all">
        {value || "-"}
      </span>
    </div>
  );
}

function useDebounce<T>(v: T, d: number): T {
  const [s, setS] = React.useState(v);
  React.useEffect(() => {
    const t = setTimeout(() => setS(v), d);
    return () => clearTimeout(t);
  }, [v, d]);
  return s;
}
