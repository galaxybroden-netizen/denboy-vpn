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
  User as UserIcon,
  Users,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
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
import { StatusBadge } from "../StatusBadge";
import { EmptyState, apiFetch } from "../lib";
import {
  formatCurrency,
  formatDate,
  timeAgo,
} from "@/lib/utils-mvmp";

interface CustomerItem {
  id: string;
  customerCode: string;
  name: string;
  email: string;
  phone?: string | null;
  status: string;
  reseller?: {
    id: string;
    resellerCode: string;
    user?: { name?: string; email?: string };
  } | null;
  user?: {
    lastLoginAt?: string | null;
    status?: string;
  } | null;
  _count?: { vpnAccounts: number; transactions: number };
}

const STATUSES = [
  { value: "all", label: "Semua Status" },
  { value: "ACTIVE", label: "Aktif" },
  { value: "SUSPENDED", label: "Diskors" },
  { value: "INVITED", label: "Diundang" },
  { value: "DELETED", label: "Dihapus" },
];

export function CustomersView() {
  const qc = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [showAdd, setShowAdd] = React.useState(false);
  const [editItem, setEditItem] = React.useState<CustomerItem | null>(null);
  const [deleteItem, setDeleteItem] = React.useState<CustomerItem | null>(null);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["customers"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const searchDebounced = useDebounce(search, 400);

  const params = new URLSearchParams({ page: String(page), limit: "15" });
  if (searchDebounced) params.set("search", searchDebounced);
  if (status !== "all") params.set("status", status);

  const { data, isLoading } = useQuery<{
    items: CustomerItem[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>({
    queryKey: ["customers", page, searchDebounced, status],
    queryFn: () => apiFetch(`/api/customers?${params.toString()}`),
  });

  const items = data?.items ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pelanggan"
        description="Daftar pelanggan MVMP"
        actions={
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" />
            Tambah Pelanggan
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Cari nama / email / kode…"
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
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !items.length ? (
          <EmptyState
            icon={Users}
            title="Belum ada pelanggan"
            description="Coba ubah filter atau tambahkan pelanggan baru."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kode</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Telepon</TableHead>
                <TableHead>Reseller</TableHead>
                <TableHead>VPN</TableHead>
                <TableHead>Transaksi</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Login Terakhir</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer"
                  onClick={() => setDetailId(c.id)}
                >
                  <TableCell className="font-mono text-xs">
                    {c.customerCode}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-medium text-foreground">
                      {c.name}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.email}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.phone || "-"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {c.reseller?.user?.name || c.reseller?.resellerCode || "-"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {c._count?.vpnAccounts ?? 0}
                  </TableCell>
                  <TableCell className="text-sm">
                    {c._count?.transactions ?? 0}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={c.status} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {timeAgo(c.user?.lastLoginAt ?? null)}
                  </TableCell>
                  <TableCell
                    className="text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-end gap-0.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailId(c.id);
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
                              setEditItem(c);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit pelanggan</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteItem(c);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Hapus pelanggan</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {pagination && pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {pagination.total} pelanggan · halaman {pagination.page} /{" "}
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

      <CustomerDetailDialog id={detailId} onClose={() => setDetailId(null)} />

      <CustomerFormDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        onSaved={refresh}
      />
      <CustomerFormDialog
        open={!!editItem}
        onOpenChange={(v) => !v && setEditItem(null)}
        item={editItem}
        isEdit
        onSaved={refresh}
      />

      <DeleteCustomerDialog
        item={deleteItem}
        onClose={() => setDeleteItem(null)}
        onDeleted={refresh}
      />
    </div>
  );
}

function CustomerDetailDialog({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["customer", id],
    queryFn: () => apiFetch(`/api/customers/${id}`),
    enabled: !!id,
  });

  return (
    <Dialog open={!!id} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserIcon className="h-4 w-4 text-emerald-400" />
            {data?.name || "Detail Pelanggan"}
          </DialogTitle>
          <DialogDescription>
            {data?.customerCode} · {data?.email}
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
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Status" value={<StatusBadge status={data.status} />} />
              <Field
                label="Telepon"
                value={data.phone || "-"}
              />
              <Field
                label="Reseller"
                value={
                  data.reseller?.user?.name ||
                  data.reseller?.resellerCode ||
                  "Langsung (tanpa reseller)"
                }
              />
              <Field
                label="Login Terakhir"
                value={timeAgo(data.user?.lastLoginAt ?? null)}
              />
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground">
                Akun VPN Terbaru
              </h4>
              {!data.vpnAccounts?.length ? (
                <p className="text-xs text-muted-foreground">Belum ada akun.</p>
              ) : (
                <Card className="p-0 gap-0 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Username</TableHead>
                        <TableHead>Server</TableHead>
                        <TableHead>Protokol</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.vpnAccounts.slice(0, 5).map((a: any) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-mono text-xs">
                            {a.username}
                          </TableCell>
                          <TableCell className="text-xs">
                            {a.server?.name}
                          </TableCell>
                          <TableCell className="text-xs">
                            {a.protocol?.displayName}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={a.status} />
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
                Transaksi Terbaru
              </h4>
              {!data.transactions?.length ? (
                <p className="text-xs text-muted-foreground">Belum ada transaksi.</p>
              ) : (
                <Card className="p-0 gap-0 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Nominal</TableHead>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.transactions.slice(0, 5).map((t: any) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-mono text-xs">
                            {t.invoiceNumber}
                          </TableCell>
                          <TableCell className="text-xs">
                            {formatCurrency(t.amount, t.currency)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDate(t.createdAt)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={t.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </div>

            {data.subscriptions?.length ? (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">
                  Subscription Aktif
                </h4>
                <div className="rounded-lg border border-border/60 divide-y divide-border/60">
                  {data.subscriptions.slice(0, 5).map((s: any) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between px-3 py-2 text-xs"
                    >
                      <span className="text-foreground">
                        {s.package?.name}
                      </span>
                      <span className="text-muted-foreground">
                        {formatDate(s.startsAt)} → {formatDate(s.expiresAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
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
// Customer Form (Create / Edit)
// ---------------------------------------------------------------------------

interface CustomerFormState {
  name: string;
  email: string;
  phone: string;
  password: string;
  status: string;
  resellerId: string; // "" = tanpa reseller
  packageId: string;  // "" = tanpa assign paket (opsional saat create)
  serverId: string;  // "" = tidak dipilih (wajib jika packageId diisi)
}

const EMPTY_CUSTOMER_FORM: CustomerFormState = {
  name: "",
  email: "",
  phone: "",
  password: "",
  status: "ACTIVE",
  resellerId: "",
  packageId: "",
  serverId: "",
};

function CustomerFormDialog({
  open,
  onOpenChange,
  item,
  onSaved,
  isEdit = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item?: CustomerItem | null;
  onSaved: () => void;
  isEdit?: boolean;
}) {
  const [form, setForm] = React.useState<CustomerFormState>(EMPTY_CUSTOMER_FORM);
  const [loading, setLoading] = React.useState(false);

  // Reseller options for optional assignment
  const { data: resellersData } = useQuery<{ items: any[] }>({
    queryKey: ["resellers-options"],
    queryFn: () => apiFetch("/api/resellers?limit=100"),
    enabled: open,
  });

  // Package options (for "Assign Paket" on create)
  const { data: packagesData } = useQuery<{ items: any[] }>({
    queryKey: ["packages-options"],
    queryFn: () => apiFetch("/api/packages?limit=100"),
    enabled: open && !isEdit,
  });

  // Server options (for server selection when package is assigned)
  const { data: serversData } = useQuery<{ items: any[] }>({
    queryKey: ["servers-options"],
    queryFn: () => apiFetch("/api/servers?limit=100"),
    enabled: open && !isEdit,
  });

  React.useEffect(() => {
    if (open) {
      if (isEdit && item) {
        setForm({
          name: item.name,
          email: item.email,
          phone: item.phone || "",
          password: "",
          status: item.status,
          resellerId: item.reseller?.id || "",
        });
      } else {
        setForm(EMPTY_CUSTOMER_FORM);
      }
    }
  }, [open, isEdit, item]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEdit && item) {
        await apiFetch(`/api/customers/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            phone: form.phone || null,
            status: form.status,
            resellerId: form.resellerId || null,
          }),
        });
        toast.success("Pelanggan berhasil diperbarui");
      } else {
        // Validate: if packageId provided, serverId is required
        if (form.packageId && !form.serverId) {
          toast.error("Pilih server jika ingin assign paket");
          setLoading(false);
          return;
        }
        const result: any = await apiFetch("/api/customers", {
          method: "POST",
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            phone: form.phone || null,
            password: form.password,
            resellerId: form.resellerId || null,
            packageId: form.packageId || null,
            serverId: form.serverId || null,
          }),
        });
        // If auto-provisioning happened, show informative toast
        if (result?.provisioned?.totalCreated > 0) {
          toast.success(
            `Pelanggan ditambahkan + ${result.provisioned.totalCreated} akun VPN ter-generate${
              result.provisioned.totalSkipped > 0
                ? ` (${result.provisioned.totalSkipped} protokol diskip)`
                : ""
            }`
          );
        } else if (result?.provisioned?.error) {
          toast.success("Pelanggan ditambahkan, tapi provisioning gagal: " + result.provisioned.error);
        } else {
          toast.success("Pelanggan berhasil ditambahkan");
        }
      }
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err?.message || "Gagal menyimpan pelanggan");
    } finally {
      setLoading(false);
    }
  }

  const resellerOptions = resellersData?.items ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserIcon className="h-4 w-4 text-emerald-400" />
            {isEdit ? "Edit Pelanggan" : "Tambah Pelanggan"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Ubah data pelanggan. Status diubah juga berlaku pada login portal."
              : "Buat pelanggan baru beserta akun login portalnya."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Nama *</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Budi Santoso"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Email *</Label>
            <Input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="budi@example.com"
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
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Reseller</Label>
            <Select
              value={form.resellerId || "none"}
              onValueChange={(v) => setForm({ ...form, resellerId: v === "none" ? "" : v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Langsung (tanpa reseller)</SelectItem>
                {resellerOptions.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.user?.name || r.resellerCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                  {STATUSES.filter((s) => s.value !== "all").map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
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

          {/* Assign Package + Server (only shown on Create, not Edit) */}
          {!isEdit ? (
            <>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">
                  Assign Paket (opsional)
                  <span className="text-muted-foreground/70">
                    {" "}— pilih paket untuk auto-generate akun VPN saat pelanggan dibuat
                  </span>
                </Label>
                <Select
                  value={form.packageId || "none"}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      packageId: v === "none" ? "" : v,
                      // Reset serverId when package changes
                      serverId: v === "none" ? "" : form.serverId,
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Tanpa paket (pelanggan kosong)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tanpa paket (pelanggan kosong)</SelectItem>
                    {(packagesData?.items ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · {p.durationDays} hari · Rp {p.price.toLocaleString("id-ID")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {form.packageId ? (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">
                    Lokasi Server *
                    <span className="text-rose-400"> *</span>
                  </Label>
                  <Select
                    value={form.serverId}
                    onValueChange={(v) => setForm({ ...form, serverId: v })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pilih server untuk auto-provisioning" />
                    </SelectTrigger>
                    <SelectContent>
                      {(serversData?.items ?? []).map((s) => (
                        <SelectItem
                          key={s.id}
                          value={s.id}
                          disabled={s.status !== "ONLINE"}
                        >
                          {s.name} · {s.region}
                          {s.status !== "ONLINE" ? " (offline)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    Sistem akan membuat 1 akun VPN per protokol di paket terpilih,
                    di server ini. Pelanggan bisa langsung lihat semua akunnya di
                    portal "Akun Saya".
                  </p>
                </div>
              ) : null}
            </>
          ) : null}

          <DialogFooter className="col-span-2 mt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isEdit ? "Simpan Perubahan" : "Tambah Pelanggan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Delete Customer Confirmation
// ---------------------------------------------------------------------------

function DeleteCustomerDialog({
  item,
  onClose,
  onDeleted,
}: {
  item: CustomerItem | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = React.useState(false);

  async function confirmDelete() {
    if (!item) return;
    setBusy(true);
    try {
      await apiFetch(`/api/customers/${item.id}`, { method: "DELETE" });
      toast.success(`Pelanggan "${item.name}" dihapus`);
      onDeleted();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Gagal menghapus pelanggan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus pelanggan {item?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Pelanggan akan dihapus dari daftar: status menjadi DELETED, login
            portal diblokir. Data akun VPN, transaksi, dan riwayat tetap
            tersimpan untuk audit.
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
