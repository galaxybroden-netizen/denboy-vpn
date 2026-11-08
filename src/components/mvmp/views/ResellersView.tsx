"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Search,
  Store,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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
import { Label } from "@/components/ui/label";
import { PageHeader } from "../PageHeader";
import { StatCard } from "../StatCard";
import { StatusBadge } from "../StatusBadge";
import { EmptyState, apiFetch } from "../lib";
import {
  formatCurrency,
  formatDateTime,
} from "@/lib/utils-mvmp";

interface ResellerItem {
  id: string;
  resellerCode: string;
  status: string;
  commissionRate: number;
  accountLimit: number;
  balance: number;
  user?: {
    name: string;
    email: string;
    phone?: string | null;
    lastLoginAt?: string | null;
  } | null;
  _count?: { customers: number; transactions: number };
  remainingSlots?: number;
}

const STATUSES = [
  { value: "all", label: "Semua Status" },
  { value: "ACTIVE", label: "Aktif" },
  { value: "SUSPENDED", label: "Diskors" },
];

export function ResellersView() {
  const qc = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [showAdd, setShowAdd] = React.useState(false);
  const [editItem, setEditItem] = React.useState<ResellerItem | null>(null);
  const [deleteItem, setDeleteItem] = React.useState<ResellerItem | null>(null);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["resellers"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const debounced = useDebounce(search, 400);

  const params = new URLSearchParams({ page: String(page), limit: "15" });
  if (debounced) params.set("search", debounced);
  if (status !== "all") params.set("status", status);

  const { data, isLoading } = useQuery<{
    items: ResellerItem[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>({
    queryKey: ["resellers", page, debounced, status],
    queryFn: () => apiFetch(`/api/resellers?${params.toString()}`),
  });

  const items = data?.items ?? [];
  const pagination = data?.pagination;

  const totalBalance = items.reduce((a, r) => a + (r.balance || 0), 0);
  const totalResellers = pagination?.total ?? items.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reseller"
        description="Mitra reseller MVMP"
        actions={
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" />
            Tambah Reseller
          </Button>
        }
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <StatCard
              title="Total Reseller"
              value={totalResellers}
              icon={Store}
              accent="emerald"
            />
            <StatCard
              title="Total Saldo"
              value={formatCurrency(totalBalance)}
              icon={Wallet}
              accent="cyan"
            />
            <StatCard
              title="Akun Slot Tersedia"
              value={items.reduce(
                (a, r) => a + (r.remainingSlots ?? 0),
                0
              )}
              icon={Users}
              accent="amber"
            />
          </>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Cari kode / nama / email…"
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
          <SelectTrigger className="w-full sm:w-[180px]">
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
      </div>

      <Card className="p-0 gap-0 overflow-hidden">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !items.length ? (
          <EmptyState
            icon={Store}
            title="Belum ada reseller"
            description="Tambahkan reseller pertama untuk mulai membagi komisi."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kode</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Saldo</TableHead>
                <TableHead>Komisi %</TableHead>
                <TableHead>Slot</TableHead>
                <TableHead>Pelanggan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => {
                const used = r._count?.customers ?? 0;
                const total = r.accountLimit;
                const pct = total > 0 ? (used / total) * 100 : 0;
                return (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => setDetailId(r.id)}
                  >
                    <TableCell className="font-mono text-xs">
                      {r.resellerCode}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium text-foreground">
                        {r.user?.name || "-"}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.user?.email || "-"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatCurrency(r.balance)}
                    </TableCell>
                    <TableCell className="text-sm">{r.commissionRate}%</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 w-32">
                        <span className="text-xs text-muted-foreground">
                          {used} / {total}
                        </span>
                        <Progress value={pct} className="h-1.5" />
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r._count?.customers ?? 0}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDetailId(r.id);
                              }}
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
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditItem(r);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit reseller</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteItem(r);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Hapus reseller</TooltipContent>
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
            {pagination.total} reseller · halaman {pagination.page} /{" "}
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

      <ResellerDetailDialog id={detailId} onClose={() => setDetailId(null)} />

      <ResellerFormDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        onSaved={refresh}
      />
      <ResellerFormDialog
        open={!!editItem}
        onOpenChange={(v) => !v && setEditItem(null)}
        item={editItem}
        isEdit
        onSaved={refresh}
      />

      <DeleteResellerDialog
        item={deleteItem}
        onClose={() => setDeleteItem(null)}
        onDeleted={refresh}
      />
    </div>
  );
}

function ResellerDetailDialog({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["reseller", id],
    queryFn: () => apiFetch(`/api/resellers/${id}`),
    enabled: !!id,
  });

  return (
    <Dialog open={!!id} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="h-4 w-4 text-emerald-400" />
            {data?.user?.name || "Detail Reseller"}
          </DialogTitle>
          <DialogDescription>
            {data?.resellerCode} · {data?.user?.email}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field
                label="Saldo"
                value={formatCurrency(data.balance)}
              />
              <Field
                label="Komisi"
                value={`${data.commissionRate}%`}
              />
              <Field
                label="Status"
                value={<StatusBadge status={data.status} />}
              />
              <Field
                label="Slot Terpakai"
                value={`${data.customersCount ?? 0} / ${data.accountLimit}`}
              />
              <Field
                label="Telepon"
                value={data.user?.phone || "-"}
              />
              <Field
                label="Reseller Induk"
                value={
                  data.parentReseller?.user?.name ||
                  data.parentReseller?.resellerCode ||
                  "Tanpa induk"
                }
              />
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground">
                Ledger (20 terbaru)
              </h4>
              {!data.ledger?.length ? (
                <p className="text-xs text-muted-foreground">Belum ada entri.</p>
              ) : (
                <Card className="p-0 gap-0 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Waktu</TableHead>
                        <TableHead>Tipe</TableHead>
                        <TableHead>Nominal</TableHead>
                        <TableHead>Saldo Setelah</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.ledger.slice(0, 20).map((l: any) => (
                        <TableRow key={l.id}>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateTime(l.createdAt)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              status={
                                l.entryType === "CREDIT" ? "PAID" : "REVOKED"
                              }
                              label={l.entryType}
                            />
                          </TableCell>
                          <TableCell className="text-xs">
                            {formatCurrency(l.amount)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {formatCurrency(l.balanceAfter)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground">
                Komisi (20 terbaru)
              </h4>
              {!data.commissions?.length ? (
                <p className="text-xs text-muted-foreground">
                  Belum ada komisi.
                </p>
              ) : (
                <Card className="p-0 gap-0 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Waktu</TableHead>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Nominal</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.commissions.slice(0, 20).map((c: any) => (
                        <TableRow key={c.id}>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateTime(c.createdAt)}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {c.transaction?.invoiceNumber || "-"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {formatCurrency(c.amount)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={c.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm font-medium text-foreground">{value}</div>
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

// ---------------------------------------------------------------------------
// Reseller Form (Create / Edit)
// ---------------------------------------------------------------------------

interface ResellerFormState {
  name: string;
  email: string;
  phone: string;
  password: string;
  status: string;
  commissionRate: number;
  accountLimit: number;
  parentResellerId: string; // "" = tanpa induk
}

const EMPTY_RESELLER_FORM: ResellerFormState = {
  name: "",
  email: "",
  phone: "",
  password: "",
  status: "ACTIVE",
  commissionRate: 10,
  accountLimit: 50,
  parentResellerId: "",
};

function ResellerFormDialog({
  open,
  onOpenChange,
  item,
  onSaved,
  isEdit = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item?: ResellerItem | null;
  onSaved: () => void;
  isEdit?: boolean;
}) {
  const [form, setForm] = React.useState<ResellerFormState>(EMPTY_RESELLER_FORM);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      if (isEdit && item) {
        setForm({
          name: item.user?.name || "",
          email: item.user?.email || "",
          phone: item.user?.phone || "",
          password: "",
          status: item.status,
          commissionRate: item.commissionRate,
          accountLimit: item.accountLimit,
          parentResellerId: "",
        });
      } else {
        setForm(EMPTY_RESELLER_FORM);
      }
    }
  }, [open, isEdit, item]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEdit && item) {
        await apiFetch(`/api/resellers/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            phone: form.phone || null,
            status: form.status,
            commissionRate: form.commissionRate,
            accountLimit: form.accountLimit,
          }),
        });
        toast.success("Reseller berhasil diperbarui");
      } else {
        await apiFetch("/api/resellers", {
          method: "POST",
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            phone: form.phone || null,
            password: form.password,
            commissionRate: form.commissionRate,
            accountLimit: form.accountLimit,
          }),
        });
        toast.success("Reseller berhasil ditambahkan");
      }
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err?.message || "Gagal menyimpan reseller");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="h-4 w-4 text-emerald-400" />
            {isEdit ? "Edit Reseller" : "Tambah Reseller"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Ubah data dan pengaturan komisi reseller."
              : "Buat mitra reseller baru beserta akun login portalnya."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Nama *</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Toko VPN Jaya"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Email *</Label>
            <Input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="reseller@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Telepon</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="0812xxxxxxx"
            />
          </div>
          {isEdit ? (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Aktif</SelectItem>
                  <SelectItem value="SUSPENDED">Diskors</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Password Login * <span className="text-muted-foreground">(min. 8 karakter)</span>
              </Label>
              <Input
                required
                type="password"
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Komisi (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={form.commissionRate}
              onChange={(e) =>
                setForm({ ...form, commissionRate: Number(e.target.value) })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Limit Akun</Label>
            <Input
              type="number"
              min={1}
              value={form.accountLimit}
              onChange={(e) =>
                setForm({ ...form, accountLimit: Number(e.target.value) })
              }
            />
          </div>
          <DialogFooter className="col-span-2 mt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isEdit ? "Simpan Perubahan" : "Tambah Reseller"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Delete Reseller Confirmation
// ---------------------------------------------------------------------------

function DeleteResellerDialog({
  item,
  onClose,
  onDeleted,
}: {
  item: ResellerItem | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = React.useState(false);

  async function confirmDelete() {
    if (!item) return;
    setBusy(true);
    try {
      await apiFetch(`/api/resellers/${item.id}`, { method: "DELETE" });
      toast.success(`Reseller "${item.user?.name || item.resellerCode}" dihapus`);
      onDeleted();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Gagal menghapus reseller");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Hapus reseller {item?.user?.name || item?.resellerCode}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Reseller akan dihapus dari daftar: status menjadi DELETED dan login portal diblokir. Ledger dan riwayat komisi tetap tersimpan. Reseller yang masih memiliki pelanggan tidak dapat dihapus.
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
