"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Crown,
  Loader2,
  Package as PackageIcon,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "../PageHeader";
import { EmptyState, apiFetch, engineColor, statusBadgeClass } from "../lib";
import { formatCurrency, formatBytes } from "@/lib/utils-mvmp";

interface PackageItem {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  currency: string;
  durationDays: number;
  quotaBytes?: number | null;
  maxDevices: number;
  isFeatured: boolean;
  status: string;
  protocols?: { protocol: { id: string; key: string; displayName: string; engine: string } }[];
  _count?: { subscriptions: number; protocols: number };
}

export function PackagesView() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = React.useState(false);
  const [editItem, setEditItem] = React.useState<PackageItem | null>(null);
  const [deleteItem, setDeleteItem] = React.useState<PackageItem | null>(null);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["packages"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["portal-packages"] });
  }

  const { data, isLoading } = useQuery<{ items: PackageItem[] }>({
    queryKey: ["packages"],
    queryFn: () => apiFetch("/api/packages"),
  });

  const { data: protocolsData } = useQuery<{ items: any[] }>({
    queryKey: ["protocols-for-package"],
    queryFn: () => apiFetch("/api/protocols"),
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Paket Layanan"
        description="Paket subscription yang tersedia"
        actions={
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" />
            Tambah Paket
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : !items.length ? (
        <Card className="p-6">
          <EmptyState
            icon={PackageIcon}
            title="Belum ada paket"
            description="Tambahkan paket layanan pertama."
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((p) => (
            <Card key={p.id} className="p-6 gap-4">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h3 className="text-base font-semibold text-foreground truncate">
                      {p.name}
                    </h3>
                    {p.isFeatured ? (
                      <Badge
                        variant="outline"
                        className={statusBadgeClass("amber")}
                      >
                        <Crown className="h-3 w-3" />
                        Featured
                      </Badge>
                    ) : null}
                  </div>
                  {p.description ? (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {p.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => setEditItem(p)}
                    aria-label="Edit paket"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10"
                    onClick={() => setDeleteItem(p)}
                    aria-label="Hapus paket"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex items-end justify-between">
                <span className="text-2xl font-bold text-foreground">
                  {formatCurrency(p.price, p.currency)}
                </span>
                <span className="text-xs text-muted-foreground">
                  / {p.durationDays} hari
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/60">
                <InfoCell
                  label="Kuota"
                  value={
                    p.quotaBytes
                      ? formatBytes(Number(p.quotaBytes))
                      : "Unlimited"
                  }
                />
                <InfoCell
                  label="Max Devices"
                  value={String(p.maxDevices)}
                />
                <InfoCell
                  label="Protokol"
                  value={`${p._count?.protocols ?? p.protocols?.length ?? 0}`}
                />
                <InfoCell
                  label="Subscribers"
                  value={String(p._count?.subscriptions ?? 0)}
                />
              </div>

              {p.protocols?.length ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {p.protocols.slice(0, 4).map(({ protocol }) => (
                    <Badge
                      key={protocol.id}
                      variant="outline"
                      className={statusBadgeClass(engineColor(protocol.engine))}
                    >
                      {protocol.displayName}
                    </Badge>
                  ))}
                  {p.protocols.length > 4 ? (
                    <Badge variant="outline" className={statusBadgeClass("zinc")}>
                      +{p.protocols.length - 4}
                    </Badge>
                  ) : null}
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      <PackageFormDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        protocols={protocolsData?.items ?? []}
        onSaved={refresh}
      />

      <PackageFormDialog
        open={!!editItem}
        onOpenChange={(v) => !v && setEditItem(null)}
        item={editItem}
        protocols={protocolsData?.items ?? []}
        onSaved={refresh}
        isEdit
      />

      <DeletePackageDialog
        item={deleteItem}
        onClose={() => setDeleteItem(null)}
        onDeleted={refresh}
      />
    </div>
  );
}

function InfoCell({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

interface FormState {
  name: string;
  description: string;
  price: number;
  currency: string;
  durationDays: number;
  quotaBytes: number; // 0 = unlimited
  maxDevices: number;
  isFeatured: boolean;
  protocolIds: string[];
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  price: 50000,
  currency: "IDR",
  durationDays: 30,
  quotaBytes: 0,
  maxDevices: 3,
  isFeatured: false,
  protocolIds: [],
};

function PackageFormDialog({
  open,
  onOpenChange,
  item,
  protocols,
  onSaved,
  isEdit = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item?: PackageItem | null;
  protocols: any[];
  onSaved: () => void;
  isEdit?: boolean;
}) {
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      if (item) {
        setForm({
          name: item.name,
          description: item.description || "",
          price: item.price,
          currency: item.currency,
          durationDays: item.durationDays,
          quotaBytes: item.quotaBytes ? Number(item.quotaBytes) : 0,
          maxDevices: item.maxDevices,
          isFeatured: item.isFeatured,
          protocolIds: item.protocols?.map((p) => p.protocol.id) || [],
        });
      } else {
        setForm(EMPTY_FORM);
      }
    }
  }, [open, item]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...form,
        quotaBytes: form.quotaBytes > 0 ? String(form.quotaBytes) : null,
      };
      if (isEdit && item) {
        await apiFetch(`/api/packages/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Paket berhasil diperbarui");
      } else {
        await apiFetch("/api/packages", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Paket berhasil ditambahkan");
      }
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err?.message || "Gagal menyimpan paket");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageIcon className="h-4 w-4 text-emerald-400" />
            {isEdit ? "Edit Paket" : "Tambah Paket"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Ubah informasi paket layanan."
              : "Buat paket subscription baru."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Nama Paket *</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Paket 30 Hari Premium"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Deskripsi</Label>
            <Textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Deskripsi paket…"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Harga *</Label>
            <Input
              type="number"
              required
              value={form.price}
              onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Mata Uang</Label>
            <Input
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
              placeholder="IDR"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Durasi (hari) *</Label>
            <Input
              type="number"
              required
              value={form.durationDays}
              onChange={(e) =>
                setForm({ ...form, durationDays: Number(e.target.value) })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Max Devices</Label>
            <Input
              type="number"
              value={form.maxDevices}
              onChange={(e) =>
                setForm({ ...form, maxDevices: Number(e.target.value) })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Kuota (bytes, 0 = unlimited)
            </Label>
            <Input
              type="number"
              value={form.quotaBytes}
              onChange={(e) =>
                setForm({ ...form, quotaBytes: Number(e.target.value) })
              }
            />
          </div>
          <div className="space-y-1.5 flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
            <Label className="text-xs text-muted-foreground">
              Paket Featured
            </Label>
            <Switch
              checked={form.isFeatured}
              onCheckedChange={(v) => setForm({ ...form, isFeatured: v })}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Protokol</Label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 rounded-md border border-border/60 p-3 max-h-44 overflow-y-auto">
              {protocols.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <Checkbox
                    checked={form.protocolIds.includes(p.id)}
                    onCheckedChange={(v) => {
                      setForm({
                        ...form,
                        protocolIds: v
                          ? [...form.protocolIds, p.id]
                          : form.protocolIds.filter((id) => id !== p.id),
                      });
                    }}
                  />
                  <span>{p.displayName}</span>
                </label>
              ))}
              {!protocols.length ? (
                <p className="text-xs text-muted-foreground">Tidak ada protokol.</p>
              ) : null}
            </div>
          </div>
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
              {isEdit ? "Simpan" : "Tambah Paket"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Delete Package Confirmation
// ---------------------------------------------------------------------------

function DeletePackageDialog({
  item,
  onClose,
  onDeleted,
}: {
  item: PackageItem | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = React.useState(false);

  async function confirmDelete() {
    if (!item) return;
    setBusy(true);
    try {
      await apiFetch(`/api/packages/${item.id}`, { method: "DELETE" });
      toast.success(`Paket "${item.name}" dihapus`);
      onDeleted();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Gagal menghapus paket");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus paket {item?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Paket akan dihapus permanen dari katalog. Paket yang masih dipakai
            subscription aktif tidak dapat dihapus — nonaktifkan saja.
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
