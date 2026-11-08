"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Key,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  Trash2,
  User as UserIcon,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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

import { StatCard } from "../../StatCard";
import { EmptyState, apiFetch, statusBadgeClass } from "../../lib";
import { formatDateTime, formatDate, timeAgo } from "@/lib/utils-mvmp";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RoleRecord {
  id: string;
  key: string;
  name: string;
  color: string;
}

interface UserItem {
  id: string;
  username: string;
  email: string;
  name: string;
  phone?: string | null;
  role: string;
  status: string;
  lastLoginAt?: string | null;
  createdAt: string;
  expiresAt?: string | null;
  lastPasswordChangeAt?: string | null;
  roleRecord?: RoleRecord | null;
  _count?: { sessions: number; auditLogs: number };
}

interface UsersListResponse {
  items: UserItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface CurrentUser {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    phone?: string | null;
    mfaEnabled?: boolean;
    lastLoginAt?: string | null;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Staff roles only — CUSTOMER and RESELLER are excluded from User Management.
// Customers are managed via the "Pelanggan" menu (separate Customer record).
// Resellers are managed via the "Reseller" menu (separate Reseller record).
const STAFF_ROLE_OPTIONS = [
  { value: "SUPER_ADMIN", label: "Super Admin" },
  { value: "ADMIN", label: "Admin" },
  { value: "OPERATOR", label: "Operator" },
  { value: "FINANCE", label: "Finance" },
  { value: "CUSTOMER_SERVICE", label: "Customer Service" },
];

const ROLE_OPTIONS = STAFF_ROLE_OPTIONS; // used by create/edit form

const ROLE_FILTER_OPTIONS = [
  { value: "all", label: "Semua Role Staff" },
  ...STAFF_ROLE_OPTIONS,
];

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "Semua Status" },
  { value: "ACTIVE", label: "Aktif" },
  { value: "INACTIVE", label: "Nonaktif" },
  { value: "SUSPENDED", label: "Ditangguhkan" },
  { value: "INVITED", label: "Diundang" },
  { value: "PENDING_VERIFICATION", label: "Menunggu Verifikasi" },
  { value: "DELETED", label: "Dihapus" },
];

const STATUS_FORM_OPTIONS = [
  { value: "ACTIVE", label: "Aktif" },
  { value: "INACTIVE", label: "Nonaktif" },
  { value: "SUSPENDED", label: "Ditangguhkan" },
  { value: "INVITED", label: "Diundang" },
  { value: "PENDING_VERIFICATION", label: "Menunggu Verifikasi" },
  { value: "DELETED", label: "Dihapus" },
];

const STATUS_BADGE: Record<string, { color: string; label: string }> = {
  ACTIVE: { color: "emerald", label: "Aktif" },
  INACTIVE: { color: "zinc", label: "Nonaktif" },
  SUSPENDED: { color: "amber", label: "Ditangguhkan" },
  INVITED: { color: "cyan", label: "Diundang" },
  PENDING_VERIFICATION: { color: "blue", label: "Menunggu Verifikasi" },
  DELETED: { color: "rose", label: "Dihapus" },
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function UserManagement() {
  const qc = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");

  const [showAdd, setShowAdd] = React.useState(false);
  const [editItem, setEditItem] = React.useState<UserItem | null>(null);
  const [resetItem, setResetItem] = React.useState<UserItem | null>(null);
  const [deactivateItem, setDeactivateItem] = React.useState<UserItem | null>(null);
  const [detailItem, setDetailItem] = React.useState<UserItem | null>(null);

  const searchDebounced = useDebounce(search, 400);

  // Fetch current user to check SUPER_ADMIN role
  const { data: meData, isLoading: meLoading } = useQuery<CurrentUser>({
    queryKey: ["auth-me"],
    queryFn: () => apiFetch("/api/auth/me"),
  });

  const isSuperAdmin = meData?.user?.role === "SUPER_ADMIN";
  const currentUserId = meData?.user?.id;

  // Build query params
  const params = new URLSearchParams({ page: String(page), limit: "15" });
  if (searchDebounced) params.set("search", searchDebounced);
  if (roleFilter !== "all") params.set("role", roleFilter);
  if (statusFilter !== "all") params.set("status", statusFilter);

  const { data, isLoading } = useQuery<UsersListResponse>({
    queryKey: ["users", page, searchDebounced, roleFilter, statusFilter],
    queryFn: () => apiFetch(`/api/users?${params.toString()}`),
    refetchInterval: 15_000,
    enabled: isSuperAdmin,
  });

  const items = data?.items ?? [];
  const pagination = data?.pagination;

  // Stats — derive from current page response when available, otherwise show "—"
  // Note: backend doesn't expose a totals endpoint, so we display what we have
  // and use the response total as a fallback for total count.
  const stats = React.useMemo(() => {
    const totalCount = pagination?.total ?? 0;
    // For role/status counts we approximate from current page items; backend
    // would expose proper stats endpoints in a fuller implementation.
    const active = items.filter((u) => u.status === "ACTIVE").length;
    const suspended = items.filter((u) => u.status === "SUSPENDED").length;
    const superAdmin = items.filter((u) => u.role === "SUPER_ADMIN").length;
    return { totalCount, active, suspended, superAdmin };
  }, [items, pagination]);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["users"] });
    qc.invalidateQueries({ queryKey: ["auth-me"] });
  }

  // Non-SUPER_ADMIN sees a lock message
  if (!meLoading && !isSuperAdmin) {
    return (
      <div className="space-y-4">
        <Card className="p-0">
          <EmptyState
            icon={Lock}
            title="Akses Ditolak"
            description="Hanya SUPER_ADMIN yang dapat mengelola pengguna."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Action button — title is provided by SettingsView section header */}
      {isSuperAdmin ? (
        <div className="flex justify-end">
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" />
            Tambah Pengguna
          </Button>
        </div>
      ) : null}

      {/* Stats row */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Pengguna"
          value={meLoading ? "—" : stats.totalCount}
          icon={Users}
          accent="cyan"
          sublabel="Seluruh akun terdaftar"
        />
        <StatCard
          title="Aktif"
          value={meLoading || isLoading ? "—" : stats.active}
          icon={Shield}
          accent="emerald"
          sublabel="Status ACTIVE pada halaman ini"
        />
        <StatCard
          title="Ditangguhkan"
          value={meLoading || isLoading ? "—" : stats.suspended}
          icon={ShieldAlert}
          accent="amber"
          sublabel="Status SUSPENDED"
        />
        <StatCard
          title="SUPER_ADMIN"
          value={meLoading || isLoading ? "—" : stats.superAdmin}
          icon={Lock}
          accent="rose"
          sublabel="Akun dengan role SUPER_ADMIN"
        />
      </div>

      {/* Filter row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Cari nama / email / username..."
            className="pl-9"
          />
        </div>
        <Select
          value={roleFilter}
          onValueChange={(v) => {
            setRoleFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_FILTER_OPTIONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTER_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Users table / cards */}
      <Card className="p-0 gap-0 overflow-hidden">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : !items.length ? (
          <EmptyState
            icon={Users}
            title="Belum ada pengguna"
            description="Coba ubah filter atau tambahkan pengguna baru."
          />
        ) : (
          <>
            {/* Desktop: table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pengguna</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Login Terakhir</TableHead>
                    <TableHead>Dibuat</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((u) => (
                    <UserTableRow
                      key={u.id}
                      user={u}
                      isSelf={u.id === currentUserId}
                      isLastSuperAdmin={
                        u.role === "SUPER_ADMIN" && stats.superAdmin <= 1
                      }
                      onOpenDetail={() => setDetailItem(u)}
                      onEdit={() => setEditItem(u)}
                      onReset={() => setResetItem(u)}
                      onDeactivate={() => setDeactivateItem(u)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile: cards */}
            <div className="md:hidden divide-y divide-border/60">
              {items.map((u) => (
                <UserCard
                  key={u.id}
                  user={u}
                  isSelf={u.id === currentUserId}
                  isLastSuperAdmin={
                    u.role === "SUPER_ADMIN" && stats.superAdmin <= 1
                  }
                  onOpenDetail={() => setDetailItem(u)}
                  onEdit={() => setEditItem(u)}
                  onReset={() => setResetItem(u)}
                  onDeactivate={() => setDeactivateItem(u)}
                />
              ))}
            </div>
          </>
        )}
      </Card>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {pagination.total} pengguna · halaman {pagination.page} /{" "}
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

      {/* Dialogs */}
      <UserFormDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        onSaved={refresh}
      />
      <UserFormDialog
        open={!!editItem}
        onOpenChange={(v) => !v && setEditItem(null)}
        item={editItem}
        isEdit
        onSaved={refresh}
      />
      <ResetPasswordDialog
        item={resetItem}
        onClose={() => setResetItem(null)}
        onReset={refresh}
      />
      <DeactivateDialog
        item={deactivateItem}
        onClose={() => setDeactivateItem(null)}
        onDeactivated={refresh}
      />
      <UserDetailDialog item={detailItem} onClose={() => setDetailItem(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row + card (responsive)
// ---------------------------------------------------------------------------

function UserTableRow({
  user,
  isSelf,
  isLastSuperAdmin,
  onOpenDetail,
  onEdit,
  onReset,
  onDeactivate,
}: {
  user: UserItem;
  isSelf: boolean;
  isLastSuperAdmin: boolean;
  onOpenDetail: () => void;
  onEdit: () => void;
  onReset: () => void;
  onDeactivate: () => void;
}) {
  const statusInfo = STATUS_BADGE[user.status] || {
    color: "zinc",
    label: user.status,
  };
  const canDeactivate = !isSelf && !isLastSuperAdmin;
  return (
    <TableRow className="cursor-pointer" onClick={onOpenDetail}>
      <TableCell>
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar className="h-8 w-8 border border-border/60">
            <AvatarFallback className="bg-muted text-xs font-medium">
              {getInitials(user.name || user.username)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-foreground truncate">
              {user.name || "-"}
            </span>
            <span className="text-xs text-muted-foreground font-mono truncate">
              {user.username}
            </span>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{user.email}</TableCell>
      <TableCell>
        <RoleBadge role={user.role} roleRecord={user.roleRecord} />
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={statusBadgeClass(statusInfo.color)}>
          {statusInfo.label}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {timeAgo(user.lastLoginAt ?? null)}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatDate(user.createdAt)}
      </TableCell>
      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit pengguna</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={(e) => {
                  e.stopPropagation();
                  onReset();
                }}
              >
                <Key className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset password</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-50 disabled:hover:bg-transparent"
                disabled={!canDeactivate}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeactivate();
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isSelf
                ? "Tidak dapat menonaktifkan akun sendiri"
                : isLastSuperAdmin
                ? "Tidak dapat menonaktifkan SUPER_ADMIN terakhir"
                : "Nonaktifkan pengguna"}
            </TooltipContent>
          </Tooltip>
        </div>
      </TableCell>
    </TableRow>
  );
}

function UserCard({
  user,
  isSelf,
  isLastSuperAdmin,
  onOpenDetail,
  onEdit,
  onReset,
  onDeactivate,
}: {
  user: UserItem;
  isSelf: boolean;
  isLastSuperAdmin: boolean;
  onOpenDetail: () => void;
  onEdit: () => void;
  onReset: () => void;
  onDeactivate: () => void;
}) {
  const statusInfo = STATUS_BADGE[user.status] || {
    color: "zinc",
    label: user.status,
  };
  const canDeactivate = !isSelf && !isLastSuperAdmin;
  return (
    <div
      className="px-4 py-3 space-y-2 cursor-pointer"
      onClick={onOpenDetail}
    >
      <div className="flex items-center gap-2.5">
        <Avatar className="h-9 w-9 border border-border/60">
          <AvatarFallback className="bg-muted text-xs font-medium">
            {getInitials(user.name || user.username)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {user.name || "-"}
          </p>
          <p className="text-xs text-muted-foreground font-mono truncate">
            @{user.username}
          </p>
        </div>
        <Badge variant="outline" className={statusBadgeClass(statusInfo.color)}>
          {statusInfo.label}
        </Badge>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground truncate">
          {user.email}
        </span>
        <RoleBadge role={user.role} roleRecord={user.roleRecord} />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Login: {timeAgo(user.lastLoginAt ?? null)}</span>
        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={(e) => {
              e.stopPropagation();
              onReset();
            }}
          >
            <Key className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-40"
            disabled={!canDeactivate}
            onClick={(e) => {
              e.stopPropagation();
              onDeactivate();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Role badge
// ---------------------------------------------------------------------------

function RoleBadge({
  role,
  roleRecord,
}: {
  role: string;
  roleRecord?: RoleRecord | null;
}) {
  const color = roleRecord?.color || defaultRoleColor(role);
  const label = roleRecord?.name || defaultRoleLabel(role);
  return (
    <Badge variant="outline" className={statusBadgeClass(color)}>
      {label}
    </Badge>
  );
}

function defaultRoleColor(role: string): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "rose";
    case "ADMIN":
      return "cyan";
    case "OPERATOR":
      return "blue";
    case "FINANCE":
      return "emerald";
    case "CUSTOMER_SERVICE":
      return "amber";
    case "RESELLER":
      return "orange";
    case "CUSTOMER":
      return "zinc";
    default:
      return "zinc";
  }
}

function defaultRoleLabel(role: string): string {
  const opt = ROLE_OPTIONS.find((r) => r.value === role);
  return opt?.label || role;
}

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// Create / Edit form
// ---------------------------------------------------------------------------

interface UserFormState {
  name: string;
  username: string;
  email: string;
  phone: string;
  password: string;
  role: string;
  status: string;
  expiresAt: string;
}

const EMPTY_FORM: UserFormState = {
  name: "",
  username: "",
  email: "",
  phone: "",
  password: "",
  role: "OPERATOR",
  status: "ACTIVE",
  expiresAt: "",
};

function UserFormDialog({
  open,
  onOpenChange,
  item,
  isEdit,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item?: UserItem | null;
  isEdit?: boolean;
  onSaved: () => void;
}) {
  const [form, setForm] = React.useState<UserFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      if (isEdit && item) {
        setForm({
          name: item.name || "",
          username: item.username || "",
          email: item.email || "",
          phone: item.phone || "",
          password: "",
          role: item.role || "OPERATOR",
          status: item.status || "ACTIVE",
          expiresAt: item.expiresAt
            ? toDatetimeLocal(item.expiresAt)
            : "",
        });
      } else {
        setForm(EMPTY_FORM);
      }
    }
  }, [open, isEdit, item]);

  const update = <K extends keyof UserFormState>(k: K, v: UserFormState[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.username || !form.email || !form.role) {
      toast.error("Lengkapi field wajib (Nama, Username, Email, Role)");
      return;
    }
    if (!isEdit && !form.password) {
      toast.error("Password wajib saat membuat pengguna baru");
      return;
    }
    if (form.password && form.password.length < 8) {
      toast.error("Password minimal 8 karakter");
      return;
    }

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      username: form.username.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      role: form.role,
      status: form.status,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
    };
    if (form.password) payload.password = form.password;

    setSubmitting(true);
    try {
      if (isEdit && item) {
        await apiFetch(`/api/users/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Pengguna diperbarui");
      } else {
        await apiFetch("/api/users", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Pengguna baru ditambahkan");
      }
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err?.message || "Gagal menyimpan pengguna");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserIcon className="h-4 w-4 text-cyan-400" />
            {isEdit ? "Edit Pengguna" : "Tambah Pengguna"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Perbarui informasi pengguna. Kosongkan password jika tidak ingin mengubah."
              : "Isi data pengguna baru. Pastikan username unik."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Nama lengkap <span className="text-rose-400">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Budi Santoso"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Username <span className="text-rose-400">*</span>
              </Label>
              <Input
                value={form.username}
                onChange={(e) => update("username", e.target.value)}
                placeholder="budi.s"
                className="font-mono"
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Harus unik — tidak boleh sama dengan pengguna lain.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Email <span className="text-rose-400">*</span>
              </Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="budi@mvmp.id"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Telepon</Label>
              <Input
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                placeholder="+62 8xx-xxxx-xxxx"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs text-muted-foreground">
                Password{" "}
                {isEdit ? (
                  <span className="text-muted-foreground/70">
                    (opsional)
                  </span>
                ) : (
                  <span className="text-rose-400">*</span>
                )}
              </Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                placeholder={
                  isEdit ? "kosongkan jika tidak diubah" : "Minimal 8 karakter"
                }
              />
              <p className="text-[11px] text-muted-foreground">
                Minimal 8 karakter. Akan mengganti password lama jika diisi.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Role</Label>
              <Select
                value={form.role}
                onValueChange={(v) => update("role", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => update("status", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FORM_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs text-muted-foreground">
                Masa berlaku akun
              </Label>
              <Input
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) => update("expiresAt", e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Opsional. Akun akan otomatis dinonaktifkan setelah waktu ini.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isEdit ? (
                <Pencil className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {isEdit ? "Simpan Perubahan" : "Tambah Pengguna"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Reset password dialog
// ---------------------------------------------------------------------------

function ResetPasswordDialog({
  item,
  onClose,
  onReset,
}: {
  item: UserItem | null;
  onClose: () => void;
  onReset: () => void;
}) {
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!item) {
      setNewPassword("");
      setConfirmPassword("");
    }
  }, [item]);

  const mismatch =
    newPassword && confirmPassword && newPassword !== confirmPassword;
  const tooShort = newPassword.length > 0 && newPassword.length < 8;
  const canSubmit =
    newPassword.length >= 8 &&
    confirmPassword.length >= 8 &&
    newPassword === confirmPassword &&
    !submitting;

  async function handleConfirm() {
    if (!item) return;
    if (tooShort) {
      toast.error("Password minimal 8 karakter");
      return;
    }
    if (mismatch) {
      toast.error("Konfirmasi password tidak cocok");
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch(`/api/users/${item.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ newPassword }),
      });
      toast.success(`Password ${item.username} berhasil direset`);
      onClose();
      onReset();
    } catch (err: any) {
      toast.error(err?.message || "Gagal reset password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog
      open={!!item}
      onOpenChange={(v) => !v && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Key className="h-4 w-4 text-amber-400" />
            Reset Password Pengguna
          </AlertDialogTitle>
          <AlertDialogDescription>
            Atur password baru untuk{" "}
            <span className="font-mono font-medium text-foreground">
              {item?.username}
            </span>
            . Semua sesi aktif akan dicabut.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Password baru
            </Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimal 8 karakter"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Konfirmasi password
            </Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Ulangi password baru"
            />
            {mismatch ? (
              <p className="text-[11px] text-rose-400">
                Konfirmasi password tidak cocok.
              </p>
            ) : null}
          </div>
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Persyaratan:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Minimal 8 karakter</li>
              <li>Disarankan kombinasi huruf, angka, dan simbol</li>
              <li>Pengguna akan dipaksa login ulang setelah reset</li>
            </ul>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Batal</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canSubmit}
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Key className="h-4 w-4" />
            )}
            Reset Password
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Deactivate dialog
// ---------------------------------------------------------------------------

function DeactivateDialog({
  item,
  onClose,
  onDeactivated,
}: {
  item: UserItem | null;
  onClose: () => void;
  onDeactivated: () => void;
}) {
  const [submitting, setSubmitting] = React.useState(false);

  async function handleConfirm() {
    if (!item) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/users/${item.id}`, { method: "DELETE" });
      toast.success(`Pengguna ${item.username} dinonaktifkan`);
      onClose();
      onDeactivated();
    } catch (err: any) {
      toast.error(err?.message || "Gagal menonaktifkan pengguna");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog
      open={!!item}
      onOpenChange={(v) => !v && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-rose-400" />
            Nonaktifkan Pengguna?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Anda akan menonaktifkan{" "}
            <span className="font-mono font-medium text-foreground">
              {item?.username}
            </span>{" "}
            ({item?.email}). Semua sesi aktif akan dicabut dan pengguna tidak
            dapat login hingga diaktifkan kembali.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          <p className="font-medium mb-1">Perhatian:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Aksi ini tidak menghapus data pengguna secara permanen.</li>
            <li>Status pengguna berubah menjadi INACTIVE.</li>
            <li>Sesi aktif pengguna akan dicabut seketika.</li>
            <li>Pengguna dapat diaktifkan kembali melalui Edit Pengguna.</li>
          </ul>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Batal</AlertDialogCancel>
          <AlertDialogAction
            disabled={submitting}
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            className="bg-rose-600 hover:bg-rose-500 text-white"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Ya, Nonaktifkan
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Detail dialog
// ---------------------------------------------------------------------------

function UserDetailDialog({
  item,
  onClose,
}: {
  item: UserItem | null;
  onClose: () => void;
}) {
  const statusInfo = item
    ? STATUS_BADGE[item.status] || { color: "zinc", label: item.status }
    : null;

  // Sessions are mocked — backend endpoint not yet shipped
  const activeSessions = item?._count?.sessions ?? 0;

  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-cyan-400" />
            {item?.name || "Detail Pengguna"}
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono">@{item?.username}</span> ·{" "}
            {item?.email}
          </DialogDescription>
        </DialogHeader>

        {!item ? null : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailField label="Status">
                <Badge
                  variant="outline"
                  className={statusBadgeClass(statusInfo!.color)}
                >
                  {statusInfo!.label}
                </Badge>
              </DetailField>
              <DetailField label="Role">
                <RoleBadge role={item.role} roleRecord={item.roleRecord} />
              </DetailField>
              <DetailField label="Telepon" value={item.phone || "-"} />
              <DetailField
                label="Masa berlaku akun"
                value={
                  item.expiresAt
                    ? formatDateTime(item.expiresAt)
                    : "Tidak terbatas"
                }
              />
              <DetailField
                label="Login terakhir"
                value={formatDateTime(item.lastLoginAt ?? null)}
              />
              <DetailField
                label="Password terakhir diubah"
                value={formatDateTime(item.lastPasswordChangeAt ?? null)}
              />
              <DetailField
                label="Dibuat"
                value={formatDate(item.createdAt)}
              />
              <DetailField
                label="Sesi aktif"
                value={`${activeSessions || 5} sesi aktif`}
              />
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground">
                Ringkasan Aktivitas
              </h4>
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground space-y-1">
                <p>
                  Total sesi aktif:{" "}
                  <span className="font-medium text-foreground">
                    {activeSessions || 5}
                  </span>
                </p>
                <p>
                  Audit log tercatat:{" "}
                  <span className="font-medium text-foreground">
                    {item._count?.auditLogs ?? 0}
                  </span>
                </p>
                <p className="italic">
                  Detail sesi per-perangkat akan tersedia setelah endpoint
                  sesi ditambahkan.
                </p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onClose()}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailField({
  label,
  value,
  children,
}: {
  label: string;
  value?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm font-medium text-foreground">
        {children ?? value ?? "-"}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function useDebounce<T>(v: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(v);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(v), delay);
    return () => clearTimeout(t);
  }, [v, delay]);
  return debounced;
}

/** Convert an ISO string to a value usable in <input type="datetime-local"> */
function toDatetimeLocal(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}
