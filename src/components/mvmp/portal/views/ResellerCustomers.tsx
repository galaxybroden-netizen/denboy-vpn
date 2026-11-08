"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  Mail,
  Phone,
  Plus,
  Search,
  User as UserIcon,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { PageHeader } from "../../PageHeader";
import { StatusBadge } from "../../StatusBadge";
import { EmptyState, apiFetch } from "../../lib";
import { formatDate, timeAgo } from "@/lib/utils-mvmp";

interface CustomerItem {
  id: string;
  customerCode: string;
  name: string;
  email: string;
  phone?: string | null;
  status: string;
  createdAt: string;
  user?: {
    email: string;
    phone?: string | null;
    lastLoginAt?: string | null;
    status?: string;
  } | null;
  _count?: { vpnAccounts: number; transactions: number };
}

interface CustomerListResponse {
  items: CustomerItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const STATUSES = [
  { value: "ALL", label: "Semua Status" },
  { value: "ACTIVE", label: "Aktif" },
  { value: "SUSPENDED", label: "Diskors" },
  { value: "EXPIRED", label: "Kedaluwarsa" },
];

function useDebounce<T>(v: T, d: number): T {
  const [s, setS] = React.useState(v);
  React.useEffect(() => {
    const t = setTimeout(() => setS(v), d);
    return () => clearTimeout(t);
  }, [v, d]);
  return s;
}

export function ResellerCustomers() {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("ALL");
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [showAdd, setShowAdd] = React.useState(false);

  const searchDebounced = useDebounce(search, 400);

  const params = new URLSearchParams({
    page: String(page),
    limit: "15",
    status,
  });
  if (searchDebounced) params.set("search", searchDebounced);

  const { data, isLoading } = useQuery<CustomerListResponse>({
    queryKey: ["reseller-customers", page, searchDebounced, status],
    queryFn: () =>
      apiFetch(`/api/portal/reseller/my-customers?${params.toString()}`),
  });

  const items = data?.items ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pelanggan Saya"
        description="Kelola pelanggan yang terdaftar di bawah Anda"
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
            placeholder="Cari nama / email / kode pelanggan…"
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
        ) : items.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Belum ada pelanggan"
            description="Tambahkan pelanggan baru untuk mulai mengelola akun VPN."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Telepon</TableHead>
                  <TableHead>VPN</TableHead>
                  <TableHead>Transaksi</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Login</TableHead>
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
                      {c.phone || c.user?.phone || "-"}
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
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailId(c.id);
                        }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Detail
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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

      <AddCustomerDialog open={showAdd} onClose={() => setShowAdd(false)} />
      <CustomerDetailDialog
        id={detailId}
        onClose={() => setDetailId(null)}
      />
    </div>
  );
}

function AddCustomerDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = React.useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });

  React.useEffect(() => {
    if (!open) {
      setForm({ name: "", email: "", phone: "", password: "" });
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/portal/reseller/my-customers", {
        method: "POST",
        body: JSON.stringify(form),
      }),
    onSuccess: () => {
      toast.success("Pelanggan berhasil ditambahkan");
      qc.invalidateQueries({ queryKey: ["reseller-customers"] });
      qc.invalidateQueries({ queryKey: ["reseller-dashboard"] });
      onClose();
    },
    onError: (e: any) => {
      toast.error(e?.message || "Gagal menambahkan pelanggan");
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) {
      toast.error("Nama, email, dan password wajib diisi");
      return;
    }
    if (form.password.length < 6) {
      toast.error("Password minimal 6 karakter");
      return;
    }
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserIcon className="h-4 w-4 text-cyan-400" />
            Tambah Pelanggan Baru
          </DialogTitle>
          <DialogDescription>
            Buat akun pelanggan di bawah reseller Anda
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="add-name" className="text-xs">
              Nama Lengkap
            </Label>
            <Input
              id="add-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nama pelanggan"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-email" className="text-xs">
              Email
            </Label>
            <Input
              id="add-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="email@contoh.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-phone" className="text-xs">
              Telepon (opsional)
            </Label>
            <Input
              id="add-phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+62…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-password" className="text-xs">
              Password Awal
            </Label>
            <Input
              id="add-password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Minimal 6 karakter"
              required
              autoComplete="new-password"
            />
            <p className="text-[10px] text-muted-foreground">
              Pelanggan dapat mengganti password setelah login pertama.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Menyimpan…
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Tambah Pelanggan
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
    queryKey: ["reseller-customer-detail", id],
    queryFn: () => apiFetch(`/api/customers/${id}`),
    enabled: !!id,
  });

  return (
    <Dialog open={!!id} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserIcon className="h-4 w-4 text-cyan-400" />
            {data?.name || "Detail Pelanggan"}
          </DialogTitle>
          <DialogDescription>
            {data?.customerCode ? (
              <>
                <span className="font-mono">{data.customerCode}</span> ·{" "}
                {data?.email}
              </>
            ) : (
              "Memuat data pelanggan…"
            )}
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
              <Field
                icon={Mail}
                label="Email"
                value={data.email || "-"}
              />
              <Field
                icon={Phone}
                label="Telepon"
                value={data.phone || "-"}
              />
              <Field
                label="Status"
                value={<StatusBadge status={data.status} />}
              />
              <Field
                label="Dibuat"
                value={formatDate(data.createdAt)}
              />
              <Field
                label="Login Terakhir"
                value={timeAgo(data.user?.lastLoginAt ?? null)}
              />
              <Field
                label="Akun VPN"
                value={`${data._count?.vpnAccounts ?? 0} akun`}
              />
              <Field
                label="Total Transaksi"
                value={`${data._count?.transactions ?? 0} transaksi`}
              />
            </div>

            {/* Recent accounts */}
            {data.vpnAccounts?.length ? (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">
                  Akun VPN ({data.vpnAccounts.length})
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {data.vpnAccounts.slice(0, 5).map((a: any) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-mono font-medium text-foreground truncate">
                          {a.username}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {a.protocol?.displayName || a.protocol?.key} ·{" "}
                          {a.server?.name}
                        </p>
                      </div>
                      <StatusBadge status={a.status} />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Recent transactions */}
            {data.transactions?.length ? (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">
                  Transaksi ({data.transactions.length})
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {data.transactions.slice(0, 5).map((t: any) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-mono text-foreground truncate">
                          {t.invoiceNumber}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatDate(t.createdAt)}
                        </p>
                      </div>
                      <StatusBadge status={t.status} />
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
  icon: Icon,
  label,
  value,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {label}
      </div>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}
