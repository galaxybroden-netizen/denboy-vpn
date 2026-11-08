"use client";

// MVMP — WhatsApp Templates
// CRUD for WhatsApp message templates (payment, OTP, maintenance, etc.)
// List + filter (category/status) + create dialog + preview dialog with mock variables.

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Eye,
  FileText,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Save,
  Star,
  Tags,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
  language: string;
  body: string;
  variablesJson: string | null;
  status: string;
  isDefault: boolean;
  metaTemplateId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TemplatesListResponse {
  items: Template[];
}

const CATEGORIES = [
  "PAYMENT_SUCCESS",
  "PAYMENT_REMINDER",
  "MAINTENANCE",
  "PURCHASE_CONFIRMATION",
  "EXPIRY_WARNING",
  "OTP",
  "WELCOME",
  "CUSTOM",
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  PAYMENT_SUCCESS: "Pembayaran Berhasil",
  PAYMENT_REMINDER: "Pengingat Pembayaran",
  MAINTENANCE: "Pemeliharaan",
  PURCHASE_CONFIRMATION: "Konfirmasi Pembelian",
  EXPIRY_WARNING: "Peringatan Kedaluwarsa",
  OTP: "OTP",
  WELCOME: "Selamat Datang",
  CUSTOM: "Kustom",
};

const AVAILABLE_VARIABLES: Array<{ token: string; sample: string }> = [
  { token: "{{customer_name}}", sample: "Budi Santoso" },
  { token: "{{invoice_number}}", sample: "INV-1001" },
  { token: "{{amount}}", sample: "Rp 65.000" },
  { token: "{{login_link}}", sample: "https://mvmp.your-domain.com" },
  { token: "{{username}}", sample: "budi@example.com" },
  { token: "{{password}}", sample: "••••••••" },
  { token: "{{expires_at}}", sample: "30 November 2026" },
  { token: "{{server_name}}", sample: "SG-Premium-01" },
  { token: "{{maintenance_date}}", sample: "15 November 2026, 02:00 WIB" },
  { token: "{{maintenance_duration}}", sample: "2 jam" },
];

interface FormState {
  key: string;
  name: string;
  category: string;
  language: string;
  body: string;
  isDefault: boolean;
}

const EMPTY_FORM: FormState = {
  key: "",
  name: "",
  category: "PAYMENT_SUCCESS",
  language: "id",
  body: "",
  isDefault: false,
};

export function WhatsappTemplates() {
  const qc = useQueryClient();
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Template | null>(null);
  const [previewTemplate, setPreviewTemplate] = React.useState<Template | null>(null);

  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);

  const queryParams = React.useMemo(() => {
    const params = new URLSearchParams();
    if (categoryFilter !== "all") params.set("category", categoryFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [categoryFilter, statusFilter]);

  const { data, isLoading } = useQuery<TemplatesListResponse>({
    queryKey: ["wa-templates", categoryFilter, statusFilter],
    queryFn: () => apiFetch(`/api/whatsapp/templates${queryParams}`),
  });

  const templates = data?.items ?? [];

  const stats = React.useMemo(() => {
    const total = templates.length;
    const defaults = templates.filter((t) => t.isDefault).length;
    const cats = new Set(templates.map((t) => t.category));
    return { total, defaults, categories: cats.size };
  }, [templates]);

  const createMutation = useMutation({
    mutationFn: (payload: FormState) =>
      apiFetch("/api/whatsapp/templates", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success("Template berhasil dibuat");
      qc.invalidateQueries({ queryKey: ["wa-templates"] });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setEditing(null);
    },
    onError: (e: any) => {
      toast.error(e?.message || "Gagal membuat template");
    },
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setCreateOpen(true);
  }

  function openEdit(t: Template) {
    setEditing(t);
    setForm({
      key: t.key,
      name: t.name,
      category: t.category,
      language: t.language || "id",
      body: t.body,
      isDefault: t.isDefault,
    });
    setCreateOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.key.trim() || !form.name.trim() || !form.body.trim()) {
      toast.error("Lengkapi semua field wajib");
      return;
    }
    createMutation.mutate(form);
  }

  function patchForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Template Pesan"
        description="Template pesan WhatsApp untuk berbagai notifikasi"
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Tambah Template
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          title="Total Template"
          value={stats.total}
          icon={FileText}
          accent="cyan"
          sublabel="Semua kategori"
        />
        <StatCard
          title="Default Template"
          value={stats.defaults}
          icon={Star}
          accent="emerald"
          sublabel="Digunakan sebagai default"
        />
        <StatCard
          title="Kategori"
          value={stats.categories}
          icon={Tags}
          accent="amber"
          sublabel="Kategori unik"
        />
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Kategori</Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Semua kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Kategori</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Semua status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-64 w-full rounded-xl" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <EmptyState
            icon={Layers}
            title="Belum ada template"
            description="Tambahkan template pesan WhatsApp untuk berbagai notifikasi otomatis."
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onEdit={() => openEdit(t)}
              onPreview={() => setPreviewTemplate(t)}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Template" : "Tambah Template"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Perubahan akan menyimpan template baru dengan key yang sama."
                : "Buat template pesan WhatsApp baru untuk notifikasi otomatis."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-key">Key</Label>
                <Input
                  id="tpl-key"
                  value={form.key}
                  onChange={(e) => patchForm("key", e.target.value)}
                  placeholder="payment_success_notification"
                  className="font-mono text-sm"
                />
                <p className="text-[10px] text-muted-foreground">
                  Identifier unik (snake_case).
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-name">Nama</Label>
                <Input
                  id="tpl-name"
                  value={form.name}
                  onChange={(e) => patchForm("name", e.target.value)}
                  placeholder="Notifikasi Pembayaran Berhasil"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-category">Kategori</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => patchForm("category", v)}
                >
                  <SelectTrigger id="tpl-category">
                    <SelectValue placeholder="Pilih kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-lang">Bahasa</Label>
                <Input
                  id="tpl-lang"
                  value={form.language}
                  onChange={(e) => patchForm("language", e.target.value)}
                  placeholder="id"
                />
                <p className="text-[10px] text-muted-foreground">
                  Kode bahasa (default: id).
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tpl-body">Body Pesan</Label>
              <Textarea
                id="tpl-body"
                value={form.body}
                onChange={(e) => patchForm("body", e.target.value)}
                placeholder="Halo {{customer_name}}, pembayaran untuk invoice {{invoice_number}} sebesar {{amount}} telah kami terima..."
                className="min-h-[200px] font-mono text-sm whitespace-pre-wrap"
                rows={8}
              />
              <div className="rounded-md bg-muted/40 p-2.5 space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground">
                  Variabel tersedia:
                </p>
                <div className="flex flex-wrap gap-1">
                  {AVAILABLE_VARIABLES.map((v) => (
                    <button
                      key={v.token}
                      type="button"
                      onClick={() =>
                        patchForm("body", `${form.body}${v.token}`)
                      }
                      className="font-mono text-[10px] rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                    >
                      {v.token}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3">
              <div className="space-y-0.5">
                <Label htmlFor="tpl-default" className="text-sm">
                  Jadikan default
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  Template default dipakai saat tidak ada template spesifik
                  dipilih.
                </p>
              </div>
              <Switch
                id="tpl-default"
                checked={form.isDefault}
                onCheckedChange={(v) => patchForm("isDefault", v)}
              />
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
                  <Save className="h-4 w-4" />
                )}
                {editing ? "Simpan" : "Buat Template"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <PreviewDialog
        template={previewTemplate}
        onClose={() => setPreviewTemplate(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Template card
// ---------------------------------------------------------------------------

function TemplateCard({
  template,
  onEdit,
  onPreview,
}: {
  template: Template;
  onEdit: () => void;
  onPreview: () => void;
}) {
  const variables = React.useMemo<string[]>(() => {
    if (!template.variablesJson) return [];
    try {
      const parsed = JSON.parse(template.variablesJson);
      if (Array.isArray(parsed)) return parsed as string[];
      return [];
    } catch {
      return [];
    }
  }, [template.variablesJson]);

  const isApproved = template.status === "APPROVED";

  return (
    <Card className="p-4 gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {template.name}
          </p>
          <p className="font-mono text-[10px] text-muted-foreground truncate">
            {template.key}
          </p>
        </div>
        {template.isDefault ? (
          <Badge
            variant="outline"
            className="bg-amber-500/15 text-amber-400 border-amber-500/30 shrink-0"
          >
            <Star className="h-3 w-3 mr-1" />
            Default
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline" className="text-[10px]">
          {CATEGORY_LABELS[template.category] || template.category}
        </Badge>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px]",
            isApproved
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
              : "bg-amber-500/15 text-amber-400 border-amber-500/30",
          )}
        >
          {template.status}
        </Badge>
      </div>

      <div className="rounded-md bg-muted/30 p-3">
        <p className="font-mono text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4">
          {template.body || "(kosong)"}
        </p>
      </div>

      {variables.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {variables.map((v) => (
            <span
              key={v}
              className="font-mono text-[10px] rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-400"
            >
              {v}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
        <span className="text-[10px] text-muted-foreground">
          {formatDateTime(template.updatedAt)}
        </span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onPreview}>
            <Eye className="h-3.5 w-3.5" />
            Preview
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Preview dialog
// ---------------------------------------------------------------------------

function PreviewDialog({
  template,
  onClose,
}: {
  template: Template | null;
  onClose: () => void;
}) {
  const rendered = React.useMemo(() => {
    if (!template) return "";
    let body = template.body || "";
    for (const v of AVAILABLE_VARIABLES) {
      body = body.split(v.token).join(v.sample);
    }
    return body;
  }, [template]);

  return (
    <Dialog open={!!template} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Preview Template</DialogTitle>
          <DialogDescription>
            Tampilan pesan dengan variabel dummy yang sudah disubstitusi.
          </DialogDescription>
        </DialogHeader>

        {template ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-[10px]">
                {CATEGORY_LABELS[template.category] || template.category}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {template.language}
              </Badge>
              <span className="font-mono text-[10px] text-muted-foreground ml-auto">
                {template.key}
              </span>
            </div>

            {/* WhatsApp outgoing bubble */}
            <div className="rounded-xl bg-[#0b141a] p-4 min-h-[200px]">
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-lg rounded-tr-sm bg-[#005c4b] px-3 py-2 text-sm text-white shadow-sm">
                  <p className="whitespace-pre-wrap break-words">{rendered || "(kosong)"}</p>
                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-white/60">
                    {new Date().toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    <span className="text-sky-300">✓✓</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-border bg-muted/20 p-3 space-y-1">
              <p className="text-[10px] font-medium text-muted-foreground">
                Variabel disubstitusi:
              </p>
              <div className="grid gap-1">
                {AVAILABLE_VARIABLES.map((v) => (
                  <div
                    key={v.token}
                    className="flex items-center justify-between gap-2 text-[11px]"
                  >
                    <span className="font-mono text-emerald-400">{v.token}</span>
                    <span className="text-muted-foreground">→ {v.sample}</span>
                  </div>
                ))}
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
