"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Ban,
  ChevronLeft,
  ChevronRight,
  Eye,
  KeyRound,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "../PageHeader";
import { StatusBadge } from "../StatusBadge";
import { EmptyState, apiFetch, engineColor, statusBadgeClass } from "../lib";
import {
  formatBytes,
  formatDate,
  formatDateTime,
} from "@/lib/utils-mvmp";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface VpnAccountItem {
  id: string;
  username: string;
  status: string;
  quotaBytes?: number | null;
  uploadBytes: number;
  downloadBytes: number;
  expiresAt?: string | null;
  maxDevices: number;
  createdAt: string;
  customer?: { id: string; name: string; email: string; customerCode: string };
  server?: {
    id: string;
    name: string;
    region: string;
    countryCode: string;
    publicIp: string;
  };
  protocol?: { id: string; displayName: string; engine: string; key: string };
}

interface VpnAccountDetail extends VpnAccountItem {
  credentials?: any[];
  usage?: any[];
}

const STATUSES = [
  { value: "all", label: "Semua Status" },
  { value: "ACTIVE", label: "Aktif" },
  { value: "SUSPENDED", label: "Diskors" },
  { value: "EXPIRED", label: "Kedaluwarsa" },
  { value: "PENDING", label: "Menunggu" },
  { value: "REVOKED", label: "Dicabut" },
];

type BulkAction = "suspend" | "activate" | "revoke" | "renew";

const BULK_ACTIONS: {
  action: BulkAction;
  label: string;
  verb: string;
  variant: "default" | "outline" | "destructive";
  className?: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    action: "suspend",
    label: "Suspend",
    verb: "diskors",
    variant: "outline",
    className:
      "border-amber-500/50 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400",
    icon: Square,
  },
  { action: "activate", label: "Activate", verb: "aktivasi", variant: "default", icon: Play },
  { action: "revoke", label: "Revoke", verb: "cabut", variant: "destructive", icon: Ban },
  { action: "renew", label: "Renew (+30 hari)", verb: "perpanjang", variant: "outline", icon: RefreshCw },
];

export function VpnAccountsView() {
  const qc = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [protocolId, setProtocolId] = React.useState("all");
  const [serverId, setServerId] = React.useState("all");
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);

  // Bulk-selection state
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(
    new Set()
  );
  const [confirmAction, setConfirmAction] = React.useState<BulkAction | null>(
    null
  );
  const [bulkBusy, setBulkBusy] = React.useState(false);

  // Row-level quick action state (revoke needs confirmation)
  const [rowConfirm, setRowConfirm] = React.useState<{
    account: VpnAccountItem;
    action: BulkAction;
  } | null>(null);
  const [rowBusy, setRowBusy] = React.useState(false);

  // Row-level hard-delete state
  const [deleteItem, setDeleteItem] = React.useState<VpnAccountItem | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  const searchDebounced = useDebounce(search, 400);

  // Load protocols + servers for filters
  const { data: protocolsData } = useQuery<{ items: any[] }>({
    queryKey: ["protocols-for-filter"],
    queryFn: () => apiFetch("/api/protocols"),
  });
  const { data: serversData } = useQuery<{
    items: any[];
  }>({
    queryKey: ["servers-for-filter"],
    queryFn: () => apiFetch("/api/servers?limit=100"),
  });

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: "15",
  });
  if (searchDebounced) queryParams.set("search", searchDebounced);
  if (status !== "all") queryParams.set("status", status);
  if (protocolId !== "all") queryParams.set("protocolId", protocolId);
  if (serverId !== "all") queryParams.set("serverId", serverId);

  const { data, isLoading } = useQuery<{
    items: VpnAccountItem[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>({
    queryKey: ["vpn-accounts", page, searchDebounced, status, protocolId, serverId],
    queryFn: () => apiFetch(`/api/vpn-accounts?${queryParams.toString()}`),
  });

  const items = data?.items ?? [];
  const pagination = data?.pagination;

  // ---------------------------------------------------------------------------
  // Bulk selection helpers
  // ---------------------------------------------------------------------------
  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    if (!items.length) return;
    const allSelected =
      items.length > 0 && items.every((a) => selectedIds.has(a.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        items.forEach((a) => next.delete(a.id));
      } else {
        items.forEach((a) => next.add(a.id));
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  // Clear selection when page/filter changes (so stale selections don't carry over)
  React.useEffect(() => {
    clearSelection();
  }, [page, searchDebounced, status, protocolId, serverId]);

  const allOnPageSelected =
    items.length > 0 && items.every((a) => selectedIds.has(a.id));
  const someOnPageSelected = items.some((a) => selectedIds.has(a.id));

  async function executeBulk() {
    if (!confirmAction) return;
    if (selectedIds.size === 0) {
      toast.error("Tidak ada akun yang dipilih");
      return;
    }
    setBulkBusy(true);
    try {
      const result: { updated: number; action: string } = await apiFetch(
        "/api/vpn-accounts/bulk",
        {
          method: "POST",
          body: JSON.stringify({
            ids: Array.from(selectedIds),
            action: confirmAction,
          }),
        }
      );
      const verbMap: Record<BulkAction, string> = {
        suspend: "diskors",
        activate: "aktivasi",
        revoke: "dicabut",
        renew: "diperpanjang",
      };
      toast.success(
        `Berhasil: ${result.updated} akun ${verbMap[confirmAction]}`
      );
      clearSelection();
      setConfirmAction(null);
      qc.invalidateQueries({ queryKey: ["vpn-accounts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e: any) {
      toast.error(e?.message || "Gagal menjalankan aksi massal");
    } finally {
      setBulkBusy(false);
    }
  }

  // Row-level quick action: single-account update via PATCH
  async function runRowAction(account: VpnAccountItem, action: BulkAction) {
    setRowBusy(true);
    try {
      await apiFetch(`/api/vpn-accounts/${account.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action, extendDays: 30 }),
      });
      const verbMap: Record<BulkAction, string> = {
        suspend: "diskors",
        activate: "diaktivasi",
        revoke: "dicabut",
        renew: "diperpanjang 30 hari",
      };
      toast.success(`Akun ${account.username} ${verbMap[action]}`);
      setRowConfirm(null);
      qc.invalidateQueries({ queryKey: ["vpn-accounts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e: any) {
      toast.error(e?.message || "Gagal menjalankan aksi");
    } finally {
      setRowBusy(false);
    }
  }

  function quickAction(account: VpnAccountItem, action: BulkAction) {
    if (action === "revoke") {
      setRowConfirm({ account, action });
    } else {
      runRowAction(account, action);
    }
  }

  // Hard-delete a single VPN account (cascade removes credentials + usage)
  async function confirmDeleteAccount() {
    if (!deleteItem) return;
    setDeleteBusy(true);
    try {
      await apiFetch(`/api/vpn-accounts/${deleteItem.id}`, { method: "DELETE" });
      toast.success(`Akun VPN "${deleteItem.username}" dihapus permanen`);
      setDeleteItem(null);
      qc.invalidateQueries({ queryKey: ["vpn-accounts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e: any) {
      toast.error(e?.message || "Gagal menghapus akun VPN");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Akun VPN"
        description="Semua akun VPN pelanggan"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Buat Akun
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Cari username / pelanggan…"
            className="pl-9"
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={protocolId}
          onValueChange={(v) => {
            setProtocolId(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Protokol" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Protokol</SelectItem>
            {(protocolsData?.items ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={serverId}
          onValueChange={(v) => {
            setServerId(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Server" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Server</SelectItem>
            {(serversData?.items ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedIds.size > 0 ? (
        <Card className="p-3 gap-0 border-emerald-500/40 bg-emerald-500/5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 mr-auto">
              <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-emerald-500/15 px-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {selectedIds.size}
              </span>
              <span className="text-sm font-medium text-foreground">
                akun dipilih
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={clearSelection}
              >
                <X className="h-3.5 w-3.5" />
                Batal
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {BULK_ACTIONS.map((b) => {
                const Icon = b.icon;
                return (
                  <Button
                    key={b.action}
                    variant={b.variant}
                    size="sm"
                    className={cn("h-8", b.className)}
                    onClick={() => setConfirmAction(b.action)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {b.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="p-0 gap-0 overflow-hidden">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !items.length ? (
          <EmptyState
            icon={Activity}
            title="Belum ada akun VPN"
            description="Coba ubah filter atau tambah akun baru."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Pilih semua di halaman ini"
                    checked={
                      allOnPageSelected
                        ? true
                        : someOnPageSelected
                        ? "indeterminate"
                        : false
                    }
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Pelanggan</TableHead>
                <TableHead>Server</TableHead>
                <TableHead>Protokol</TableHead>
                <TableHead>Kuota</TableHead>
                <TableHead>Kedaluwarsa</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((a) => {
                const used = Number(a.uploadBytes) + Number(a.downloadBytes);
                const total = Number(a.quotaBytes ?? 0);
                const isSelected = selectedIds.has(a.id);
                return (
                  <TableRow
                    key={a.id}
                    className={cn(
                      isSelected && "bg-emerald-500/5 hover:bg-emerald-500/10"
                    )}
                  >
                    <TableCell className="w-10">
                      <Checkbox
                        aria-label={`Pilih ${a.username}`}
                        checked={isSelected}
                        onCheckedChange={() => toggleOne(a.id)}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {a.username}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">
                          {a.customer?.name || "-"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {a.customer?.customerCode}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span>
                          {a.server?.countryCode
                            ? flagEmoji(a.server.countryCode)
                            : "🌐"}
                        </span>
                        <span className="text-sm">{a.server?.name || "-"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {a.protocol ? (
                        <Badge
                          variant="outline"
                          className={statusBadgeClass(
                            engineColor(a.protocol.engine)
                          )}
                        >
                          {a.protocol.displayName}
                        </Badge>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {total > 0 ? (
                        <div className="flex flex-col">
                          <span>{formatBytes(used)}</span>
                          <span className="text-muted-foreground">
                            / {formatBytes(total)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Tanpa kuota</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(a.expiresAt)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={a.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              disabled={a.status === "REVOKED"}
                              onClick={() => quickAction(a, "renew")}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Perpanjang +30 hari</TooltipContent>
                        </Tooltip>
                        {a.status === "ACTIVE" ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
                                onClick={() => quickAction(a, "suspend")}
                              >
                                <Square className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Suspend</TooltipContent>
                          </Tooltip>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                                disabled={a.status === "REVOKED"}
                                onClick={() => quickAction(a, "activate")}
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Aktivasi</TooltipContent>
                          </Tooltip>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10"
                              disabled={a.status === "REVOKED"}
                              onClick={() => quickAction(a, "revoke")}
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Cabut akun</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => setDetailId(a.id)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Lihat detail</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10"
                              onClick={() => setDeleteItem(a)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Hapus akun</TooltipContent>
                        </Tooltip>
                      </div>
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
            {pagination.total} akun · halaman {pagination.page} /{" "}
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

      <BulkActionConfirmDialog
        action={confirmAction}
        count={selectedIds.size}
        busy={bulkBusy}
        onConfirm={executeBulk}
        onCancel={() => !bulkBusy && setConfirmAction(null)}
      />

      <VpnAccountDetailDialog id={detailId} onClose={() => setDetailId(null)} />
      <CreateVpnAccountDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* Row revoke confirmation */}
      <AlertDialog
        open={!!rowConfirm}
        onOpenChange={(v) => !v && !rowBusy && setRowConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Cabut akun {rowConfirm?.account.username}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Akun VPN akan dicabut permanen dan kredensialnya dinonaktifkan.
              Data penggunaan tetap tersimpan untuk audit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rowBusy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={rowBusy}
              className="bg-rose-600 hover:bg-rose-700"
              onClick={(e) => {
                e.preventDefault();
                if (rowConfirm)
                  runRowAction(rowConfirm.account, rowConfirm.action);
              }}
            >
              {rowBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Cabut
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Row hard-delete confirmation */}
      <AlertDialog
        open={!!deleteItem}
        onOpenChange={(v) => !v && !deleteBusy && setDeleteItem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Hapus akun {deleteItem?.username}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Akun VPN akan dihapus permanen dari database beserta
              kredensial dan riwayat penggunaannya. Tindakan ini tidak dapat
              dibatalkan. Audit log tetap mencatat tindakan ini.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteBusy}
              className="bg-rose-600 hover:bg-rose-700"
              onClick={(e) => {
                e.preventDefault();
                confirmDeleteAccount();
              }}
            >
              {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Hapus Permanen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BulkActionConfirmDialog — confirm before applying a bulk action
// ---------------------------------------------------------------------------

function BulkActionConfirmDialog({
  action,
  count,
  busy,
  onConfirm,
  onCancel,
}: {
  action: BulkAction | null;
  count: number;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const meta = action
    ? BULK_ACTIONS.find((b) => b.action === action)
    : null;

  const isDestructive = action === "revoke";

  return (
    <AlertDialog open={!!action} onOpenChange={(v) => !v && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isDestructive ? "Konfirmasi Pencabutan Akun" : "Konfirmasi Aksi Massal"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Anda akan{" "}
            <span className="font-medium text-foreground">
              {meta?.verb ?? action}
            </span>{" "}
            <span className="font-medium text-foreground">{count}</span> akun
            VPN sekaligus.{" "}
            {isDestructive
              ? "Tindakan ini tidak dapat dibatalkan — akun yang dicabut tidak akan bisa diaktifkan kembali tanpa provisioning ulang."
              : action === "renew"
              ? "Masa aktif setiap akun akan diperpanjang 30 hari dari jatuh tempo terkini (atau dari sekarang bila sudah kedaluwarsa)."
              : "Pastikan Anda telah memilih akun yang tepat sebelum melanjutkan."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={busy}
            className={cn(
              isDestructive &&
                "bg-destructive text-white hover:bg-destructive/90"
            )}
          >
            {busy
              ? "Memproses…"
              : isDestructive
              ? `Ya, Cabut ${count} Akun`
              : `Ya, Lanjutkan (${count})`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// VpnAccountDetailDialog
// ---------------------------------------------------------------------------

function VpnAccountDetailDialog({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery<VpnAccountDetail>({
    queryKey: ["vpn-account", id],
    queryFn: () => apiFetch(`/api/vpn-accounts/${id}`),
    enabled: !!id,
  });

  async function action(a: string, label: string) {
    if (!id) return;
    setBusy(a);
    try {
      await apiFetch(`/api/vpn-accounts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: a }),
      });
      toast.success(`${label} berhasil`);
      qc.invalidateQueries({ queryKey: ["vpn-account", id] });
      qc.invalidateQueries({ queryKey: ["vpn-accounts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e: any) {
      toast.error(e?.message || "Gagal menjalankan aksi");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={!!id} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-emerald-400" />
            Detail Akun VPN
          </DialogTitle>
          <DialogDescription>
            {data?.username}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoBlock label="Pelanggan" value={data.customer?.name || "-"} sub={data.customer?.email} />
              <InfoBlock label="Server" value={data.server?.name || "-"} sub={data.server?.publicIp} />
              <InfoBlock
                label="Protokol"
                value={data.protocol?.displayName || "-"}
                sub={data.protocol?.engine}
              />
              <InfoBlock
                label="Status"
                value={<StatusBadge status={data.status} />}
              />
              <InfoBlock
                label="Kuota Digunakan"
                value={`${formatBytes(Number(data.uploadBytes) + Number(data.downloadBytes))}`}
                sub={
                  data.quotaBytes
                    ? `dari ${formatBytes(Number(data.quotaBytes))}`
                    : "Tanpa kuota"
                }
              />
              <InfoBlock
                label="Kedaluwarsa"
                value={formatDate(data.expiresAt)}
                sub={`Max ${data.maxDevices} perangkat`}
              />
            </div>

            {data.credentials?.length ? (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">
                  Kredensial
                </h4>
                <div className="rounded-lg border border-border/60 divide-y divide-border/60">
                  {data.credentials.map((c: any) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between px-3 py-2 text-xs"
                    >
                      <div className="flex flex-col">
                        <span className="font-mono text-foreground">
                          {c.publicValue || "(terenkripsi)"}
                        </span>
                        <span className="text-muted-foreground">
                          {c.credentialType} · v{c.keyVersion}
                        </span>
                      </div>
                      <span className="text-muted-foreground">
                        {formatDateTime(c.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {data.usage?.length ? (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">
                  Riwayat Penggunaan (5 terbaru)
                </h4>
                <div className="rounded-lg border border-border/60 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Waktu</TableHead>
                        <TableHead>Upload</TableHead>
                        <TableHead>Download</TableHead>
                        <TableHead>Sumber</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.usage.slice(0, 5).map((u: any) => (
                        <TableRow key={u.id}>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateTime(u.recordedAt)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {formatBytes(Number(u.uploadBytes))}
                          </TableCell>
                          <TableCell className="text-xs">
                            {formatBytes(Number(u.downloadBytes))}
                          </TableCell>
                          <TableCell className="text-xs uppercase">
                            {u.source}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : null}

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null || data.status === "ACTIVE"}
                onClick={() => action("activate", "Aktivasi")}
              >
                {busy === "activate" ? "…" : "Activate"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null || data.status === "SUSPENDED"}
                onClick={() => action("suspend", "Diskors")}
              >
                {busy === "suspend" ? "…" : "Suspend"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() => action("renew", "Perpanjang")}
              >
                {busy === "renew" ? "…" : "Renew (+30 hari)"}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={busy !== null || data.status === "REVOKED"}
                onClick={() => action("revoke", "Cabut")}
              >
                {busy === "revoke" ? "…" : "Revoke"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoBlock({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm font-medium text-foreground">{value}</div>
      {sub ? (
        <p className="text-xs text-muted-foreground">{sub}</p>
      ) : null}
    </div>
  );
}

function flagEmoji(code: string): string {
  const flags: Record<string, string> = {
    ID: "🇮🇩", SG: "🇸🇬", US: "🇺🇸", NL: "🇳🇱", DE: "🇩🇪", JP: "🇯🇵", HK: "🇭🇰", IN: "🇮🇳",
  };
  return flags[code?.toUpperCase()] || "🌐";
}

function useDebounce<T>(value: T, delay: number): T {
  const [d, setD] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setD(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return d;
}

// ---------------------------------------------------------------------------
// CreateVpnAccountDialog
// ---------------------------------------------------------------------------

function CreateVpnAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [customerId, setCustomerId] = React.useState("");
  const [packageId, setPackageId] = React.useState("");
  const [protocolId, setProtocolId] = React.useState("");
  const [serverId, setServerId] = React.useState("");
  const [durationDays, setDurationDays] = React.useState(30);
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const { data: customersData } = useQuery<{ items: any[] }>({
    queryKey: ["customers-for-create"],
    queryFn: () => apiFetch("/api/customers?limit=100"),
    enabled: open,
  });
  const { data: packagesData } = useQuery<{ items: any[] }>({
    queryKey: ["packages-for-create"],
    queryFn: () => apiFetch("/api/packages?limit=50"),
    enabled: open,
  });
  const { data: protocolsData } = useQuery<{ items: any[] }>({
    queryKey: ["protocols-for-create"],
    queryFn: () => apiFetch("/api/protocols"),
    enabled: open,
  });
  const { data: serversData } = useQuery<{ items: any[] }>({
    queryKey: ["servers-for-create"],
    queryFn: () => apiFetch("/api/servers?limit=50"),
    enabled: open,
  });

  // Get protocols for selected package
  const selectedPackage = (packagesData?.items ?? []).find((p) => p.id === packageId);
  const availableProtocols = (selectedPackage?.protocols ?? []).filter(
    (pp: any) => pp.protocol?.isEnabled
  );

  async function handleSubmit() {
    if (!customerId || !packageId || !protocolId || !serverId) {
      toast.error("Lengkapi semua field");
      return;
    }
    setSubmitting(true);
    try {
      const result = await apiFetch("/api/vpn-accounts/create", {
        method: "POST",
        body: JSON.stringify({
          customerId,
          packageId,
          protocolId,
          serverId,
          durationDays,
          notes,
        }),
      });
      toast.success(`Akun ${result.account.username} berhasil dibuat`);
      qc.invalidateQueries({ queryKey: ["vpn-accounts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onOpenChange(false);
      setCustomerId("");
      setPackageId("");
      setProtocolId("");
      setServerId("");
      setNotes("");
    } catch (e: any) {
      toast.error(e?.message || "Gagal membuat akun");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-emerald-400" />
            Buat Akun VPN
          </DialogTitle>
          <DialogDescription>
            Provisioning akun VPN baru untuk pelanggan
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Pelanggan</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pilih pelanggan" />
              </SelectTrigger>
              <SelectContent>
                {(customersData?.items ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} · {c.customerCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Paket</Label>
            <Select
              value={packageId}
              onValueChange={(v) => {
                setPackageId(v);
                setProtocolId("");
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pilih paket" />
              </SelectTrigger>
              <SelectContent>
                {(packagesData?.items ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · Rp {p.price.toLocaleString("id-ID")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Protokol</Label>
              <Select value={protocolId} onValueChange={setProtocolId} disabled={!packageId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={packageId ? "Pilih protokol" : "Pilih paket dulu"} />
                </SelectTrigger>
                <SelectContent>
                  {availableProtocols.map((pp: any) => (
                    <SelectItem key={pp.protocol.id} value={pp.protocol.id}>
                      {pp.protocol.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Server</Label>
              <Select value={serverId} onValueChange={setServerId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih server" />
                </SelectTrigger>
                <SelectContent>
                  {(serversData?.items ?? []).filter((s: any) => s.status === "ONLINE").map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} · {s.region}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Durasi (hari)</Label>
              <Input
                type="number"
                min={1}
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value) || 30)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Catatan (opsional)</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Mis. provisioning manual"
              />
            </div>
          </div>

          {packageId ? (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
              <p className="text-emerald-400 font-medium">Ringkasan</p>
              <p className="text-muted-foreground mt-1">
                Paket: <span className="text-foreground">{selectedPackage?.name}</span> · Durasi:{" "}
                <span className="text-foreground">{durationDays} hari</span> · Username:{" "}
                <span className="text-foreground font-mono">mvmp-XXXXX</span> (auto)
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Memproses…" : "Buat Akun"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
