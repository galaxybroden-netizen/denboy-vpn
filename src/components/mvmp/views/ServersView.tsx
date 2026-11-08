"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Search,
  Server as ServerIcon,
  Trash2,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { PageHeader } from "../PageHeader";
import { StatusBadge } from "../StatusBadge";
import { EmptyState, apiFetch } from "../lib";
import { useAppStore } from "@/lib/store";
import {
  formatBytes,
  formatBytesShort,
  formatCurrency,
  getCountryFlag,
} from "@/lib/utils-mvmp";

interface ServerItem {
  id: string;
  name: string;
  hostname: string;
  publicIp: string;
  region: string;
  countryCode: string;
  provider: string;
  osName: string;
  osVersion: string;
  cpuCores: number;
  ramTotalBytes: number;
  diskTotalBytes: number;
  monthlyCost: number;
  status: string;
  maintenanceMode: boolean;
  agent?: { status: string; lastHeartbeatAt?: string } | null;
  group?: { id: string; name: string } | null;
  latestMetric?: {
    cpuPercent: number;
    ramUsedBytes: number;
    diskUsedBytes: number;
    bandwidthMbps: number;
    activeAccounts: number;
  } | null;
  _count?: { vpnAccounts: number };
}

interface ServersResponse {
  items: ServerItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const REGIONS = [
  { value: "all", label: "Semua Region" },
  { value: "Indonesia", label: "Indonesia" },
  { value: "Singapore", label: "Singapore" },
  { value: "US West", label: "US West" },
  { value: "Netherlands", label: "Netherlands" },
];

export function ServersView() {
  const openServer = useAppStore((s) => s.openServer);
  const qc = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [region, setRegion] = React.useState("all");
  const [showAdd, setShowAdd] = React.useState(false);
  const [editItem, setEditItem] = React.useState<ServerItem | null>(null);
  const [deleteItem, setDeleteItem] = React.useState<ServerItem | null>(null);

  const searchDebounced = useDebounce(search, 400);

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: "10",
  });
  if (searchDebounced) queryParams.set("search", searchDebounced);
  if (region !== "all") queryParams.set("region", region);

  const { data, isLoading } = useQuery<ServersResponse>({
    queryKey: ["servers", page, searchDebounced, region],
    queryFn: () => apiFetch(`/api/servers?${queryParams.toString()}`),
  });

  const items = data?.items ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Server VPN"
        description="Daftar VPS yang dikelola"
        actions={
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" />
            Tambah Server
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Cari nama / hostname / IP…"
            className="pl-9"
          />
        </div>
        <Select
          value={region}
          onValueChange={(v) => {
            setRegion(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Region" />
          </SelectTrigger>
          <SelectContent>
            {REGIONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="p-0 gap-0 overflow-hidden">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !items.length ? (
          <EmptyState
            icon={ServerIcon}
            title="Belum ada server"
            description="Tambahkan server VPN pertama untuk mulai mengelola."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Server</TableHead>
                <TableHead>IP Public</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>OS</TableHead>
                <TableHead>CPU/RAM</TableHead>
                <TableHead>Protokol</TableHead>
                <TableHead>Akun Aktif</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((s) => {
                const ramUsed = Number(s.latestMetric?.ramUsedBytes ?? 0);
                const ramTotal = Number(s.ramTotalBytes ?? 0);
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-base leading-none">
                          {getCountryFlag(s.countryCode)}
                        </span>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground">
                            {s.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {s.provider}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {s.publicIp}
                    </TableCell>
                    <TableCell className="text-sm">{s.region}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.osName} {s.osVersion}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="flex flex-col">
                        <span>{s.cpuCores} vCPU</span>
                        <span className="text-xs text-muted-foreground">
                          {ramUsed > 0
                            ? `${formatBytesShort(ramUsed)} / ${formatBytesShort(ramTotal)}`
                            : formatBytes(ramTotal)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      -
                    </TableCell>
                    <TableCell className="text-sm">
                      {s._count?.vpnAccounts ?? 0}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={s.agent?.status ?? "OFFLINE"}
                      />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={s.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-0.5">
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
                          <TooltipContent>Lihat detail</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => setEditItem(s)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit server</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10"
                              onClick={() => setDeleteItem(s)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Hapus server</TooltipContent>
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

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {pagination.total} server · halaman {pagination.page} /{" "}
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

      {/* Add / Edit Server Dialog */}
      <ServerFormDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["servers"] });
          qc.invalidateQueries({ queryKey: ["dashboard"] });
        }}
      />
      <ServerFormDialog
        open={!!editItem}
        onOpenChange={(v) => !v && setEditItem(null)}
        item={editItem}
        isEdit
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["servers"] });
          qc.invalidateQueries({ queryKey: ["servers-map"] });
          qc.invalidateQueries({ queryKey: ["dashboard"] });
        }}
      />

      {/* Delete Confirmation */}
      <DeleteServerDialog
        item={deleteItem}
        onClose={() => setDeleteItem(null)}
        onDeleted={() => {
          qc.invalidateQueries({ queryKey: ["servers"] });
          qc.invalidateQueries({ queryKey: ["servers-map"] });
          qc.invalidateQueries({ queryKey: ["dashboard"] });
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Server Dialog
// ---------------------------------------------------------------------------

const EMPTY_FORM: AddServerForm = {
  name: "",
  hostname: "",
  publicIp: "",
  region: "Indonesia",
  countryCode: "ID",
  provider: "OVH",
  cpuCores: 2,
  ramTotalBytes: 4 * 1024 * 1024 * 1024,
  diskTotalBytes: 80 * 1024 * 1024 * 1024,
  sshPort: 22,
  maxAccounts: 100,
  monthlyCost: 100000,
  osVersion: "22.04 LTS",
};

interface AddServerForm {
  name: string;
  hostname: string;
  publicIp: string;
  region: string;
  countryCode: string;
  provider: string;
  cpuCores: number;
  ramTotalBytes: number;
  diskTotalBytes: number;
  sshPort: number;
  maxAccounts: number;
  monthlyCost: number;
  osVersion: string;
}

function ServerFormDialog({
  open,
  onOpenChange,
  item,
  onSaved,
  isEdit = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item?: ServerItem | null;
  onSaved: () => void;
  isEdit?: boolean;
}) {
  const [form, setForm] = React.useState<AddServerForm>(EMPTY_FORM);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      if (isEdit && item) {
        setForm({
          name: item.name,
          hostname: item.hostname,
          publicIp: item.publicIp,
          region: item.region,
          countryCode: item.countryCode,
          provider: item.provider || "",
          cpuCores: item.cpuCores,
          ramTotalBytes: Number(item.ramTotalBytes),
          diskTotalBytes: Number(item.diskTotalBytes),
          sshPort: 22,
          maxAccounts: 100,
          monthlyCost: Number(item.monthlyCost ?? 0),
          osVersion: item.osVersion || "",
        });
      } else {
        setForm(EMPTY_FORM);
      }
    }
  }, [open, isEdit, item]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEdit && item) {
        await apiFetch(`/api/servers/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: form.name,
            hostname: form.hostname,
            publicIp: form.publicIp,
            region: form.region,
            countryCode: form.countryCode,
            provider: form.provider,
            cpuCores: form.cpuCores,
            ramTotalBytes: String(form.ramTotalBytes),
            diskTotalBytes: String(form.diskTotalBytes),
            monthlyCost: form.monthlyCost,
            osVersion: form.osVersion,
          }),
        });
        toast.success("Server berhasil diperbarui");
      } else {
        await apiFetch("/api/servers", {
          method: "POST",
          body: JSON.stringify({
            ...form,
            ramTotalBytes: String(form.ramTotalBytes),
            diskTotalBytes: String(form.diskTotalBytes),
          }),
        });
        toast.success("Server berhasil ditambahkan");
      }
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err?.message || "Gagal menyimpan server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Server VPN" : "Tambah Server VPN"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Ubah informasi server yang terdaftar."
              : "Daftarkan VPS baru untuk dikelola oleh MVMP."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama Server" required>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="SG-OVH-01"
            />
          </Field>
          <Field label="Hostname" required>
            <Input
              required
              value={form.hostname}
              onChange={(e) => setForm({ ...form, hostname: e.target.value })}
              placeholder="sg-ovh-01.mvmp.net"
            />
          </Field>
          <Field label="IP Public" required>
            <Input
              required
              value={form.publicIp}
              onChange={(e) => setForm({ ...form, publicIp: e.target.value })}
              placeholder="103.x.x.x"
            />
          </Field>
          <Field label="Region" required>
            <Select
              value={form.region}
              onValueChange={(v) => setForm({ ...form, region: v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REGIONS.filter((r) => r.value !== "all").map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Country Code" required>
            <Select
              value={form.countryCode}
              onValueChange={(v) => setForm({ ...form, countryCode: v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ID">ID — Indonesia</SelectItem>
                <SelectItem value="SG">SG — Singapore</SelectItem>
                <SelectItem value="US">US — United States</SelectItem>
                <SelectItem value="NL">NL — Netherlands</SelectItem>
                <SelectItem value="JP">JP — Japan</SelectItem>
                <SelectItem value="HK">HK — Hong Kong</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Provider">
            <Input
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
              placeholder="OVH / DigitalOcean / Vultr"
            />
          </Field>
          <Field label="CPU Cores">
            <Input
              type="number"
              min={1}
              value={form.cpuCores}
              onChange={(e) =>
                setForm({ ...form, cpuCores: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="RAM (Bytes)">
            <Input
              type="number"
              value={form.ramTotalBytes}
              onChange={(e) =>
                setForm({ ...form, ramTotalBytes: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="Disk (Bytes)">
            <Input
              type="number"
              value={form.diskTotalBytes}
              onChange={(e) =>
                setForm({ ...form, diskTotalBytes: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="SSH Port">
            <Input
              type="number"
              value={form.sshPort}
              onChange={(e) =>
                setForm({ ...form, sshPort: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="Max Accounts">
            <Input
              type="number"
              value={form.maxAccounts}
              onChange={(e) =>
                setForm({ ...form, maxAccounts: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="Biaya Bulanan (IDR)">
            <Input
              type="number"
              value={form.monthlyCost}
              onChange={(e) =>
                setForm({ ...form, monthlyCost: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="OS Version">
            <Input
              value={form.osVersion}
              onChange={(e) => setForm({ ...form, osVersion: e.target.value })}
              placeholder="22.04 LTS"
            />
          </Field>
          <DialogFooter className="col-span-2 mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isEdit ? "Simpan Perubahan" : "Tambah Server"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Delete Server Confirmation
// ---------------------------------------------------------------------------

function DeleteServerDialog({
  item,
  onClose,
  onDeleted,
}: {
  item: ServerItem | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = React.useState(false);

  async function confirmDelete() {
    if (!item) return;
    setBusy(true);
    try {
      await apiFetch(`/api/servers/${item.id}`, { method: "DELETE" });
      toast.success(`Server "${item.name}" dihapus`);
      onDeleted();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Gagal menghapus server");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus server {item?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Server akan dihapus dari daftar: status menjadi DECOMMISSIONED dan
            mode maintenance aktif. Konfigurasi protokol dan data akun VPN
            tetap tersimpan untuk audit.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className="bg-rose-600 hover:bg-rose-700"
            onClick={(e) => {
              e.preventDefault();
              confirmDelete();
            }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Hapus
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">
        {label}
        {required ? <span className="text-rose-400"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
