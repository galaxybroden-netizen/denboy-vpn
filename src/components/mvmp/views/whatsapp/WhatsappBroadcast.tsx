"use client";

// MVMP — WhatsApp Broadcast
// Create + send mass WhatsApp messages to filtered audiences.
// List with status badges + per-broadcast stats, refetch every 10s.
// Create dialog with template + audience filter + optional scheduledAt.
// Send / Detail / Delete actions with AlertDialog confirms.

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCheck,
  Eye,
  Inbox,
  Loader2,
  Megaphone,
  Plus,
  Send,
  Trash2,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageHeader } from "../../PageHeader";
import { StatCard } from "../../StatCard";
import { EmptyState, apiFetch } from "../../lib";
import { formatDateTime } from "@/lib/utils-mvmp";
import { cn } from "@/lib/utils";

interface Template {
  id: string;
  key: string;
  name: string;
  category: string;
  body: string;
}

interface Broadcast {
  id: string;
  name: string;
  templateId: string;
  template?: Template;
  audienceCount: number;
  status: string;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  statsJson: string | null;
  createdAt: string;
  _count?: { recipients: number };
}

interface Recipient {
  id: string;
  status: string;
  sentAt: string | null;
  deliveredAt: string | null;
  errorMessage: string | null;
  contact: { phoneNumber: string; displayName: string };
}

interface BroadcastListResponse {
  items: Broadcast[];
}

interface BroadcastDetail {
  id: string;
  name: string;
  status: string;
  audienceCount: number;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  statsJson: string | null;
  recipients: Recipient[];
}

interface TemplatesForDropdown {
  items: Template[];
}

const STATUS_OPTIONS = [
  { value: "all", label: "Semua Status" },
  { value: "DRAFT", label: "Draft" },
  { value: "QUEUED", label: "Antrian" },
  { value: "SENDING", label: "Sedang Berjalan" },
  { value: "COMPLETED", label: "Selesai" },
  { value: "FAILED", label: "Gagal" },
  { value: "SCHEDULED", label: "Terjadwal" },
] as const;

const AUDIENCE_SOURCES = [
  { value: "CUSTOMER", label: "Pelanggan" },
  { value: "USER", label: "Pengguna Sistem" },
  { value: "MANUAL", label: "Manual (daftar nomor)" },
] as const;

const CUSTOMER_STATUSES = [
  { value: "ACTIVE", label: "Aktif" },
  { value: "SUSPENDED", label: "Suspend" },
  { value: "INVITED", label: "Diundang" },
] as const;

const BROADCAST_STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  QUEUED: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  SENDING: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  COMPLETED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  FAILED: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  SCHEDULED: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
};

const RECIPIENT_STATUS_BADGE: Record<string, string> = {
  QUEUED: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  SENT: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  DELIVERED: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  READ: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  FAILED: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

interface FormState {
  name: string;
  templateId: string;
  audienceSource: string;
  tags: string;
  customerStatus: string;
  scheduledAt: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  templateId: "",
  audienceSource: "CUSTOMER",
  tags: "",
  customerStatus: "ACTIVE",
  scheduledAt: "",
};

export function WhatsappBroadcast() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = React.useState<string>("all");

  const [createOpen, setCreateOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);

  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [sendTarget, setSendTarget] = React.useState<Broadcast | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Broadcast | null>(null);

  const queryParams = React.useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [statusFilter]);

  const { data, isLoading } = useQuery<BroadcastListResponse>({
    queryKey: ["wa-broadcasts", statusFilter],
    queryFn: () => apiFetch(`/api/whatsapp/broadcasts${queryParams}`),
    refetchInterval: 10_000,
  });

  const { data: templatesData } = useQuery<TemplatesForDropdown>({
    queryKey: ["wa-templates-for-broadcast"],
    queryFn: () => apiFetch("/api/whatsapp/templates"),
  });
  const templates = templatesData?.items ?? [];

  const broadcasts = data?.items ?? [];

  const stats = React.useMemo(() => {
    const total = broadcasts.length;
    const completed = broadcasts.filter((b) => b.status === "COMPLETED").length;
    const sending = broadcasts.filter((b) => b.status === "SENDING").length;
    const scheduled = broadcasts.filter((b) => b.status === "SCHEDULED").length;
    return { total, completed, sending, scheduled };
  }, [broadcasts]);

  const createMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      templateId: string;
      audienceFilterJson: string;
      scheduledAt: string | null;
    }) =>
      apiFetch("/api/whatsapp/broadcasts", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success("Broadcast dibuat");
      qc.invalidateQueries({ queryKey: ["wa-broadcasts"] });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (e: any) => {
      toast.error(e?.message || "Gagal membuat broadcast");
    },
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/whatsapp/broadcasts/${id}?action=send`, {
        method: "POST",
      }),
    onSuccess: () => {
      toast.success("Broadcast dikirim");
      qc.invalidateQueries({ queryKey: ["wa-broadcasts"] });
      setSendTarget(null);
    },
    onError: (e: any) => {
      toast.error(e?.message || "Gagal mengirim broadcast");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/whatsapp/broadcasts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Broadcast dihapus");
      qc.invalidateQueries({ queryKey: ["wa-broadcasts"] });
      setDeleteTarget(null);
    },
    onError: (e: any) => {
      toast.error(e?.message || "Gagal menghapus broadcast");
    },
  });

  function patchForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.templateId) {
      toast.error("Lengkapi nama broadcast dan template");
      return;
    }
    const tags = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const audienceFilterJson = JSON.stringify({
      source: form.audienceSource,
      tags,
      customerStatus: form.customerStatus,
    });
    createMutation.mutate({
      name: form.name.trim(),
      templateId: form.templateId,
      audienceFilterJson,
      scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Broadcast WhatsApp"
        description="Kirim pesan massal ke pelanggan"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Buat Broadcast
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Broadcast"
          value={stats.total}
          icon={Megaphone}
          accent="cyan"
        />
        <StatCard
          title="Selesai"
          value={stats.completed}
          icon={CheckCheck}
          accent="emerald"
        />
        <StatCard
          title="Sedang Berjalan"
          value={stats.sending}
          icon={Loader2}
          accent="amber"
        />
        <StatCard
          title="Terjadwal"
          value={stats.scheduled}
          icon={CalendarClock}
          accent="cyan"
        />
      </div>

      {/* Filter */}
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-1">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Semua status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : broadcasts.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Belum ada broadcast"
            description="Buat broadcast pertama Anda untuk mengirim pesan massal ke pelanggan."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Audiens</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Statistik</TableHead>
                  <TableHead>Terjadwal</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {broadcasts.map((b) => {
                  const stats = parseStats(b.statsJson);
                  const actualRecipients = b._count?.recipients ?? 0;
                  const canSend = b.status === "DRAFT" || b.status === "QUEUED";
                  return (
                    <TableRow key={b.id}>
                      <TableCell>
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium text-foreground">
                            {b.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatDateTime(b.createdAt)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {b.template ? (
                          <div className="space-y-0.5">
                            <p className="text-sm text-foreground">
                              {b.template.name}
                            </p>
                            <p className="font-mono text-[10px] text-muted-foreground">
                              {b.template.key}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            -
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <p className="text-sm text-foreground tabular-nums">
                            {b.audienceCount.toLocaleString("id-ID")}
                          </p>
                          {actualRecipients > 0 ? (
                            <p className="text-[10px] text-muted-foreground">
                              {actualRecipients.toLocaleString("id-ID")} penerima
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <BroadcastStatusBadge status={b.status} />
                      </TableCell>
                      <TableCell>
                        <StatsMini stats={stats} />
                      </TableCell>
                      <TableCell>
                        {b.scheduledAt ? (
                          <div className="space-y-0.5">
                            <p className="text-xs text-foreground">
                              {formatDateTime(b.scheduledAt)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canSend ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSendTarget(b)}
                            >
                              <Send className="h-3.5 w-3.5" />
                              Kirim
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDetailId(b.id)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Detail
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-rose-400 hover:text-rose-300"
                            onClick={() => setDeleteTarget(b)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Buat Broadcast Baru</DialogTitle>
            <DialogDescription>
              Pilih template dan audiens untuk pengiriman massal.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bc-name">Nama Broadcast</Label>
              <Input
                id="bc-name"
                value={form.name}
                onChange={(e) => patchForm("name", e.target.value)}
                placeholder="Promo Akhir Tahun 2026"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bc-template">Template</Label>
              <Select
                value={form.templateId}
                onValueChange={(v) => patchForm("templateId", v)}
              >
                <SelectTrigger id="bc-template">
                  <SelectValue placeholder="Pilih template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.length === 0 ? (
                    <SelectItem value="_none" disabled>
                    Belum ada template
                  </SelectItem>
                  ) : (
                    templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Filter Audiens</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Sumber</Label>
                  <Select
                    value={form.audienceSource}
                    onValueChange={(v) => patchForm("audienceSource", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih sumber" />
                    </SelectTrigger>
                    <SelectContent>
                      {AUDIENCE_SOURCES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Status Pelanggan
                  </Label>
                  <Select
                    value={form.customerStatus}
                    onValueChange={(v) => patchForm("customerStatus", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Aktif</SelectItem>
                      <SelectItem value="SUSPENDED">Suspend</SelectItem>
                      <SelectItem value="INVITED">Diundang</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bc-tags" className="text-xs text-muted-foreground">
                  Tags (pisahkan dengan koma)
                </Label>
                <Input
                  id="bc-tags"
                  value={form.tags}
                  onChange={(e) => patchForm("tags", e.target.value)}
                  placeholder="vip, premium, trial"
                />
                <p className="text-[10px] text-muted-foreground">
                  Hanya kirim ke pelanggan yang memiliki minimal salah satu tag.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bc-scheduled" className="flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" />
                Jadwalkan Pengiriman (opsional)
              </Label>
              <Input
                id="bc-scheduled"
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) => patchForm("scheduledAt", e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">
                Kosongkan untuk menyimpan sebagai draft. Jika diisi, status
                otomatis menjadi SCHEDULED.
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Batal
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Buat Broadcast
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <DetailDialog
        id={detailId}
        onClose={() => setDetailId(null)}
      />

      {/* Send Confirm */}
      <AlertDialog
        open={!!sendTarget}
        onOpenChange={(o) => !o && setSendTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kirim broadcast?</AlertDialogTitle>
            <AlertDialogDescription>
              {sendTarget
                ? `Kirim "${sendTarget.name}" ke ${sendTarget.audienceCount.toLocaleString(
                    "id-ID",
                  )} penerima? Proses ini tidak bisa dibatalkan.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={sendMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (sendTarget) sendMutation.mutate(sendTarget.id);
              }}
            >
              {sendMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Kirim Sekarang
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus broadcast?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `Broadcast "${deleteTarget.name}" beserta semua data penerima akan dihapus permanen.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              className="bg-rose-600 hover:bg-rose-500"
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status badge (with spinner for SENDING)
// ---------------------------------------------------------------------------

function BroadcastStatusBadge({ status }: { status: string }) {
  const cls = BROADCAST_STATUS_BADGE[status] || BROADCAST_STATUS_BADGE.DRAFT;
  const label = status || "UNKNOWN";
  const isSending = status === "SENDING";
  return (
    <Badge variant="outline" className={cn("text-[10px] gap-1", cls)}>
      {isSending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : null}
      {label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Stats helpers
// ---------------------------------------------------------------------------

interface Stats {
  sent?: number;
  delivered?: number;
  read?: number;
  failed?: number;
}

function parseStats(json: string | null): Stats {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function StatsMini({ stats }: { stats: Stats }) {
  const hasAny =
    stats.sent || stats.delivered || stats.read || stats.failed;
  if (!hasAny) {
    return <span className="text-xs text-muted-foreground">-</span>;
  }
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
      {stats.sent != null ? (
        <span className="text-blue-400">sent: {stats.sent}</span>
      ) : null}
      {stats.delivered != null ? (
        <span className="text-cyan-400">delivered: {stats.delivered}</span>
      ) : null}
      {stats.read != null ? (
        <span className="text-emerald-400">read: {stats.read}</span>
      ) : null}
      {stats.failed != null ? (
        <span className="text-rose-400">failed: {stats.failed}</span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail dialog
// ---------------------------------------------------------------------------

function DetailDialog({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useQuery<BroadcastDetail>({
    queryKey: ["wa-broadcast-detail", id],
    queryFn: () => apiFetch(`/api/whatsapp/broadcasts/${id}`),
    enabled: !!id,
  });

  const stats = parseStats(data?.statsJson ?? null);

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Detail Broadcast</DialogTitle>
          <DialogDescription>
            Informasi broadcast dan status per penerima.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : isError ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Gagal memuat detail broadcast.
          </div>
        ) : data ? (
          <div className="space-y-4">
            {/* Info grid */}
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoRow label="Nama" value={data.name} />
              <InfoRow label="Status" value={<BroadcastStatusBadge status={data.status} />} />
              <InfoRow label="Audiens" value={`${data.audienceCount.toLocaleString("id-ID")} penerima`} />
              <InfoRow label="Terjadwal" value={data.scheduledAt ? formatDateTime(data.scheduledAt) : "-"} />
              <InfoRow label="Mulai" value={data.startedAt ? formatDateTime(data.startedAt) : "-"} />
              <InfoRow label="Selesai" value={data.completedAt ? formatDateTime(data.completedAt) : "-"} />
            </div>

            {/* Stats */}
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Statistik</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <StatItem label="Terkirim" value={stats.sent ?? 0} color="text-blue-400" />
                <StatItem label="Diterima" value={stats.delivered ?? 0} color="text-cyan-400" />
                <StatItem label="Dibaca" value={stats.read ?? 0} color="text-emerald-400" />
                <StatItem label="Gagal" value={stats.failed ?? 0} color="text-rose-400" />
              </div>
            </div>

            {/* Recipients list */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Daftar Penerima (maks 100)
              </p>
              <div className="rounded-md border border-border">
                <ScrollArea className="h-72">
                  {!data.recipients || data.recipients.length === 0 ? (
                    <div className="p-6">
                      <EmptyState
                        icon={Users}
                        title="Belum ada penerima"
                        description="Penerima akan muncul setelah broadcast diproses."
                      />
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {data.recipients.slice(0, 100).map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-between gap-3 px-3 py-2"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <p className="text-sm text-foreground truncate">
                              {r.contact.displayName || r.contact.phoneNumber}
                            </p>
                            <p className="font-mono text-[10px] text-muted-foreground truncate">
                              {r.contact.phoneNumber}
                            </p>
                            {r.errorMessage ? (
                              <p className="text-[10px] text-rose-400 truncate">
                                {r.errorMessage}
                              </p>
                            ) : null}
                          </div>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] shrink-0",
                              RECIPIENT_STATUS_BADGE[r.status] ||
                                RECIPIENT_STATUS_BADGE.QUEUED,
                            )}
                          >
                            {r.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}

function StatItem({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={cn("font-semibold tabular-nums", color)}>
        {value.toLocaleString("id-ID")}
      </p>
    </div>
  );
}
