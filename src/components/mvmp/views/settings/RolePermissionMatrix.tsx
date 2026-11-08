"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  Loader2,
  Lock,
  Plus,
  RotateCcw,
  Save,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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

import { StatCard } from "../../StatCard";
import { EmptyState, apiFetch, statusBadgeClass } from "../../lib";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Permission {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  action: string;
  isSensitive: boolean;
}

interface PermissionGrouped {
  id: string;
  key: string;
  name: string;
  description: string | null;
  action: string;
  isSensitive: boolean;
  category?: string;
}

interface RoleWithPermissions {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  color: string;
  permissionKeys: string[];
  userCount: number;
}

interface RolesResponse {
  items: RoleWithPermissions[];
}

interface PermissionsResponse {
  groups: Record<string, Permission[]>;
  flat: PermissionGrouped[];
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

const CATEGORY_LABELS: Record<string, string> = {
  Operasional: "Operasional",
  Infrastruktur: "Infrastruktur",
  Pengguna: "Pengguna",
  Bisnis: "Bisnis",
  WhatsApp: "WhatsApp",
  Sistem: "Sistem",
  "User Management": "User Management",
  "Sensitive Actions": "Sensitive Actions",
};

const CATEGORY_FILTER_OPTIONS = [
  { value: "all", label: "Semua Kategori" },
  { value: "Operasional", label: "Operasional" },
  { value: "Infrastruktur", label: "Infrastruktur" },
  { value: "Pengguna", label: "Pengguna" },
  { value: "Bisnis", label: "Bisnis" },
  { value: "WhatsApp", label: "WhatsApp" },
  { value: "Sistem", label: "Sistem" },
  { value: "User Management", label: "User Management" },
  { value: "Sensitive Actions", label: "Sensitive Actions" },
];

const COLOR_OPTIONS = [
  { value: "rose", label: "Rose (Merah Muda)", swatch: "bg-rose-500" },
  { value: "emerald", label: "Emerald (Hijau)", swatch: "bg-emerald-500" },
  { value: "cyan", label: "Cyan (Biru Muda)", swatch: "bg-cyan-500" },
  { value: "amber", label: "Amber (Kuning)", swatch: "bg-amber-500" },
  { value: "blue", label: "Blue (Biru)", swatch: "bg-blue-500" },
  { value: "zinc", label: "Zinc (Abu-abu)", swatch: "bg-zinc-500" },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RolePermissionMatrix() {
  const qc = useQueryClient();
  const [selectedRoleId, setSelectedRoleId] = React.useState<string>("");
  const [draftPermissionKeys, setDraftPermissionKeys] = React.useState<Set<string>>(new Set());
  const [hasChanges, setHasChanges] = React.useState(false);

  const [search, setSearch] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("all");

  const [showAddRole, setShowAddRole] = React.useState(false);

  const searchDebounced = useDebounce(search, 250);

  // Current user — for SUPER_ADMIN gate
  const { data: meData, isLoading: meLoading } = useQuery<CurrentUser>({
    queryKey: ["auth-me"],
    queryFn: () => apiFetch("/api/auth/me"),
  });
  const isSuperAdmin = meData?.user?.role === "SUPER_ADMIN";

  // Roles
  const {
    data: rolesData,
    isLoading: rolesLoading,
  } = useQuery<RolesResponse>({
    queryKey: ["rbac-roles"],
    queryFn: () => apiFetch("/api/rbac/roles"),
  });
  const roles = rolesData?.items ?? [];

  // Permissions
  const {
    data: permsData,
    isLoading: permsLoading,
  } = useQuery<PermissionsResponse>({
    queryKey: ["rbac-permissions"],
    queryFn: () => apiFetch("/api/rbac/permissions"),
  });

  const groups = permsData?.groups ?? {};
  const flat = permsData?.flat ?? [];

  // Default-selected role: SUPER_ADMIN (when roles load)
  React.useEffect(() => {
    if (!selectedRoleId && roles.length) {
      const superAdmin =
        roles.find((r) => r.key === "SUPER_ADMIN") || roles[0];
      if (superAdmin) setSelectedRoleId(superAdmin.id);
    }
  }, [roles, selectedRoleId]);

  // When the selected role changes or roles data loads, sync draft from server
  const selectedRole = React.useMemo(
    () => roles.find((r) => r.id === selectedRoleId) || null,
    [roles, selectedRoleId]
  );

  React.useEffect(() => {
    if (selectedRole) {
      setDraftPermissionKeys(new Set(selectedRole.permissionKeys));
      setHasChanges(false);
    }
  }, [selectedRoleId, selectedRole?.id]);

  // Toggle a permission in draft
  function togglePermission(key: string, checked: boolean) {
    if (!selectedRole) return;
    // SUPER_ADMIN protection: never allow unchecking
    if (selectedRole.key === "SUPER_ADMIN" && !checked) return;
    setDraftPermissionKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      // Compute hasChanges against server state
      const server = new Set(selectedRole.permissionKeys);
      setHasChanges(!setEquals(next, server));
      return next;
    });
  }

  function resetDraft() {
    if (!selectedRole) return;
    setDraftPermissionKeys(new Set(selectedRole.permissionKeys));
    setHasChanges(false);
    toast.info("Perubahan dibatalkan");
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRole) throw new Error("Role belum dipilih");
      return apiFetch(`/api/rbac/roles/${selectedRole.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          permissionKeys: Array.from(draftPermissionKeys),
        }),
      });
    },
    onSuccess: () => {
      toast.success(
        `Permission role ${selectedRole?.name} berhasil diperbarui`
      );
      setHasChanges(false);
      qc.invalidateQueries({ queryKey: ["rbac-roles"] });
    },
    onError: (err: any) => {
      toast.error(err?.message || "Gagal menyimpan permission role");
    },
  });

  // Stats
  const stats = React.useMemo(() => {
    const totalRoles = roles.length;
    const totalPermissions = flat.length;
    const sensitiveCount = flat.filter((p) => p.isSensitive).length;
    return { totalRoles, totalPermissions, sensitiveCount };
  }, [roles, flat]);

  // Filtered groups (search + category)
  const visibleGroups = React.useMemo(() => {
    const out: Record<string, Permission[]> = {};
    for (const [category, perms] of Object.entries(groups)) {
      if (categoryFilter !== "all" && category !== categoryFilter) continue;
      const filtered = perms.filter((p) => {
        if (!searchDebounced) return true;
        const q = searchDebounced.toLowerCase();
        return (
          p.key.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          (p.description || "").toLowerCase().includes(q) ||
          p.action.toLowerCase().includes(q)
        );
      });
      if (filtered.length) out[category] = filtered;
    }
    return out;
  }, [groups, searchDebounced, categoryFilter]);

  // Non-SUPER_ADMIN sees a lock message
  if (!meLoading && !isSuperAdmin) {
    return (
      <div className="space-y-4">
        <Card className="p-0">
          <EmptyState
            icon={Lock}
            title="Akses Ditolak"
            description="Hanya SUPER_ADMIN yang dapat mengelola role & permission."
          />
        </Card>
      </div>
    );
  }

  const isSuperAdminRoleSelected = selectedRole?.key === "SUPER_ADMIN";

  return (
    <div className="space-y-4">
      {/* Action button — title is provided by SettingsView section header */}
      {isSuperAdmin ? (
        <div className="flex justify-end">
          <Button onClick={() => setShowAddRole(true)}>
            <Plus className="h-4 w-4" />
            Tambah Role
          </Button>
        </div>
      ) : null}

      {/* Stats row */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <StatCard
          title="Total Role"
          value={meLoading || rolesLoading ? "—" : stats.totalRoles}
          icon={Shield}
          accent="cyan"
          sublabel="Role terdaftar di sistem"
        />
        <StatCard
          title="Total Permission"
          value={meLoading || permsLoading ? "—" : stats.totalPermissions}
          icon={ShieldCheck}
          accent="emerald"
          sublabel="Permission tersedia"
        />
        <StatCard
          title="Sensitive Actions"
          value={meLoading || permsLoading ? "—" : stats.sensitiveCount}
          icon={ShieldAlert}
          accent="rose"
          sublabel="Aksi yang sensitif"
        />
      </div>

      {/* Role selector */}
      <Card className="p-4 sm:p-5 gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1 min-w-0">
            <Label className="text-xs text-muted-foreground">
              Role yang sedang diedit
            </Label>
            <Select
              value={selectedRoleId}
              onValueChange={(v) => {
                if (hasChanges) {
                  if (
                    !window.confirm(
                      "Ada perubahan yang belum disimpan. Lanjut ganti role?"
                    )
                  ) {
                    return;
                  }
                }
                setSelectedRoleId(v);
              }}
              disabled={rolesLoading || !roles.length}
            >
              <SelectTrigger className="w-full sm:w-[360px] mt-1">
                <SelectValue
                  placeholder={
                    rolesLoading ? "Memuat role..." : "Pilih role"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          colorSwatchClass(r.color)
                        )}
                      />
                      <span>{r.name}</span>
                      <span className="text-xs text-muted-foreground">
                        · {r.userCount} user
                      </span>
                      {r.isSystem ? (
                        <Badge
                          variant="outline"
                          className="ml-1 py-0 px-1.5 text-[10px]"
                        >
                          Sistem
                        </Badge>
                      ) : null}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedRole ? (
            <div className="flex items-center gap-2 flex-wrap">
              {isSuperAdminRoleSelected ? (
                <Badge
                  variant="outline"
                  className={statusBadgeClass("rose")}
                >
                  <Lock className="h-3 w-3 mr-1" />
                  Protected
                </Badge>
              ) : null}
              {hasChanges ? (
                <Badge
                  variant="outline"
                  className={statusBadgeClass("amber")}
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Belum disimpan
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className={statusBadgeClass("emerald")}
                >
                  <ShieldCheck className="h-3 w-3 mr-1" />
                  Tersinkron
                </Badge>
              )}
            </div>
          ) : null}
        </div>

        {selectedRole?.description ? (
          <p className="text-xs text-muted-foreground">
            {selectedRole.description}
          </p>
        ) : null}
        {selectedRole ? (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">
                {selectedRole.permissionKeys.length}
              </span>{" "}
              dari {flat.length} permission diberikan
            </span>
            <span>
              <span className="font-medium text-foreground">
                {selectedRole.userCount}
              </span>{" "}
              user menggunakan role ini
            </span>
          </div>
        ) : null}
      </Card>

      {/* Filter row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari permission..."
            className="pl-9"
          />
        </div>
        <Select
          value={categoryFilter}
          onValueChange={setCategoryFilter}
        >
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_FILTER_OPTIONS.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Permission matrix */}
      {rolesLoading || permsLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : !Object.keys(visibleGroups).length ? (
        <Card className="p-0">
          <EmptyState
            icon={Shield}
            title="Tidak ada permission"
            description="Coba ubah kata kunci pencarian atau kategori."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(visibleGroups)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([category, perms]) => (
              <PermissionCategoryCard
                key={category}
                category={category}
                permissions={perms}
                draftKeys={draftPermissionKeys}
                isProtected={isSuperAdminRoleSelected}
                onToggle={togglePermission}
              />
            ))}
        </div>
      )}

      {/* Action bar */}
      {selectedRole ? (
        <Card className="p-4 sm:p-5 gap-0 sticky bottom-4 z-10 border-border/80 shadow-lg backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground">
              {hasChanges ? (
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-amber-400" />
                  Ada perubahan yang belum disimpan untuk{" "}
                  <span className="font-medium text-foreground">
                    {selectedRole.name}
                  </span>
                  .
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  Tidak ada perubahan. Permission role{" "}
                  <span className="font-medium text-foreground">
                    {selectedRole.name}
                  </span>{" "}
                  tersinkron dengan server.
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={resetDraft}
                disabled={!hasChanges || saveMutation.isPending}
              >
                <RotateCcw className="h-4 w-4" />
                Reset ke Default
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetDraft}
                disabled={!hasChanges || saveMutation.isPending}
              >
                <X className="h-4 w-4" />
                Batal
              </Button>
              <Button
                size="sm"
                onClick={() => saveMutation.mutate()}
                disabled={!hasChanges || saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Simpan Perubahan
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Add role dialog */}
      <AddRoleDialog
        open={showAddRole}
        onOpenChange={setShowAddRole}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["rbac-roles"] });
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Permission category card (with table inside)
// ---------------------------------------------------------------------------

function PermissionCategoryCard({
  category,
  permissions,
  draftKeys,
  isProtected,
  onToggle,
}: {
  category: string;
  permissions: Permission[];
  draftKeys: Set<string>;
  isProtected: boolean;
  onToggle: (key: string, checked: boolean) => void;
}) {
  const grantedCount = permissions.filter((p) => draftKeys.has(p.key)).length;
  const sensitiveCount = permissions.filter((p) => p.isSensitive).length;
  const label = CATEGORY_LABELS[category] || category;

  return (
    <Card className="p-0 gap-0 overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-border/60 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">{label}</h3>
          <Badge variant="outline" className="py-0 px-1.5 text-[10px]">
            {permissions.length} permission
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">{grantedCount}</span>{" "}
            granted
          </span>
          {sensitiveCount > 0 ? (
            <Badge
              variant="outline"
              className={statusBadgeClass("rose") + " py-0 px-1.5 text-[10px]"}
            >
              <ShieldAlert className="h-3 w-3 mr-1" />
              {sensitiveCount} sensitive
            </Badge>
          ) : null}
        </div>
      </div>

      {/* Desktop: table; Mobile: horizontally scrollable */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[220px]">Permission</TableHead>
              <TableHead className="min-w-[120px]">Action</TableHead>
              <TableHead className="min-w-[110px]">Sensitive</TableHead>
              <TableHead className="min-w-[100px] text-right">Granted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {permissions.map((p) => {
              const checked = draftKeys.has(p.key);
              const disabled = isProtected; // SUPER_ADMIN: all locked
              return (
                <TableRow key={p.key}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">
                        {p.name}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {p.key}
                      </span>
                      {p.description ? (
                        <span className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {p.description}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="font-mono py-0 px-1.5 text-[10px]"
                    >
                      {p.action}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {p.isSensitive ? (
                      <Badge
                        variant="outline"
                        className={statusBadgeClass("rose") + " py-0 px-1.5"}
                      >
                        <ShieldAlert className="h-3 w-3 mr-1" />
                        Sensitive
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {disabled && checked ? (
                        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : null}
                      <Checkbox
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={(v) =>
                          onToggle(p.key, v === true)
                        }
                        aria-label={`Berikan ${p.key} ke role`}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Add role dialog
// ---------------------------------------------------------------------------

interface AddRoleFormState {
  key: string;
  name: string;
  description: string;
  color: string;
}

const EMPTY_ROLE_FORM: AddRoleFormState = {
  key: "",
  name: "",
  description: "",
  color: "cyan",
};

function AddRoleDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [form, setForm] = React.useState<AddRoleFormState>(EMPTY_ROLE_FORM);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) setForm(EMPTY_ROLE_FORM);
  }, [open]);

  const update = <K extends keyof AddRoleFormState>(
    k: K,
    v: AddRoleFormState[K]
  ) => setForm((prev) => ({ ...prev, [k]: v }));

  // Auto-format key: uppercase + replace spaces with underscores
  function formatKey(v: string) {
    return v.toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.key || !form.name) {
      toast.error("Field wajib: Key dan Name");
      return;
    }
    if (!/^[A-Z][A-Z0-9_]*$/.test(form.key)) {
      toast.error(
        "Key role harus huruf besar, angka, underscore, dan diawali huruf"
      );
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch("/api/rbac/roles", {
        method: "POST",
        body: JSON.stringify({
          key: form.key,
          name: form.name,
          description: form.description || null,
          color: form.color,
          permissionKeys: [],
        }),
      });
      toast.success(`Role ${form.name} berhasil dibuat`);
      onOpenChange(false);
      onCreated();
    } catch (err: any) {
      toast.error(err?.message || "Gagal membuat role");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-cyan-400" />
            Tambah Role Baru
          </DialogTitle>
          <DialogDescription>
            Buat role kustom baru. Permission dapat diatur setelah role dibuat.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Key <span className="text-rose-400">*</span>
            </Label>
            <Input
              value={form.key}
              onChange={(e) => update("key", formatKey(e.target.value))}
              placeholder="REGIONAL_ADMIN"
              className="font-mono"
              maxLength={48}
              required
            />
            <p className="text-[11px] text-muted-foreground">
              Huruf besar, angka, underscore. Harus unik dan diawali huruf.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Nama <span className="text-rose-400">*</span>
            </Label>
            <Input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Admin Regional"
              maxLength={64}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Deskripsi</Label>
            <Textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Tanggung jawab role ini..."
              rows={3}
              maxLength={240}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Warna</Label>
            <Select
              value={form.color}
              onValueChange={(v) => update("color", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLOR_OPTIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "h-2.5 w-2.5 rounded-full",
                          c.swatch
                        )}
                      />
                      <span>{c.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Buat Role
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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

function setEquals<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function colorSwatchClass(color: string): string {
  switch (color) {
    case "rose":
      return "bg-rose-500";
    case "emerald":
      return "bg-emerald-500";
    case "cyan":
      return "bg-cyan-500";
    case "amber":
      return "bg-amber-500";
    case "blue":
      return "bg-blue-500";
    case "zinc":
      return "bg-zinc-500";
    case "orange":
      return "bg-orange-500";
    default:
      return "bg-zinc-500";
  }
}
