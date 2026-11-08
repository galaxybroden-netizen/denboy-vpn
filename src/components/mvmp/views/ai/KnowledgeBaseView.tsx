"use client";

// MVMP — Knowledge Base View
// CRUD interface for documents that feed the AI retrieval-augmented generation
// pipeline. Each document has a category, content body, channel-scoped
// visibility, and source type. Chunk counts reflect vector-store embedding
// state.
//
// All labels are in Bahasa Indonesia. Built on the shadcn/ui dark theme.

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Database,
  FileText,
  Inbox,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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

import { PageHeader } from "../../PageHeader";
import { EmptyState, apiFetch } from "../../lib";
import { formatDateTime } from "@/lib/utils-mvmp";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type KbCategory =
  | "FAQ"
  | "Product"
  | "Protocol"
  | "Troubleshooting"
  | "Pricing"
  | "Policy"
  | "Reseller"
  | "Article";

type SourceType = "manual" | "imported" | "scraped" | "api";

interface KbDocument {
  id: string;
  title: string;
  category: KbCategory;
  content: string;
  sourceType: SourceType;
  visibility?: Record<string, boolean> | string;
  chunkCount?: number;
  createdAt: string;
  updatedAt?: string;
}

interface KbListResponse {
  items?: KbDocument[];
  data?: KbDocument[];
  total?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES: { value: string; label: string; badge: string }[] = [
  { value: "all", label: "Semua Kategori", badge: "" },
  {
    value: "FAQ",
    label: "FAQ",
    badge: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  {
    value: "Product",
    label: "Produk",
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  {
    value: "Protocol",
    label: "Protokol",
    badge: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  },
  {
    value: "Troubleshooting",
    label: "Troubleshooting",
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  {
    value: "Pricing",
    label: "Harga",
    badge: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  },
  {
    value: "Policy",
    label: "Kebijakan",
    badge: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  },
  {
    value: "Reseller",
    label: "Reseller",
    badge: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  },
  {
    value: "Article",
    label: "Artikel",
    badge: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  },
];

const SOURCE_TYPES: { value: SourceType; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "imported", label: "Impor File" },
  { value: "scraped", label: "Scrape Web" },
  { value: "api", label: "API Eksternal" },
];

const VISIBILITY_CHANNELS = [
  { value: "landing", label: "Landing Page" },
  { value: "customer", label: "Customer Portal" },
  { value: "reseller", label: "Reseller Portal" },
  { value: "admin", label: "Admin Panel" },
];

function categoryBadgeClass(cat: string): string {
  return (
    CATEGORIES.find((c) => c.value === cat)?.badge ||
    "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
  );
}

function categoryLabel(cat: string): string {
  return CATEGORIES.find((c) => c.value === cat)?.label || cat;
}

function parseVisibility(
  v: KbDocument["visibility"]
): Record<string, boolean> {
  if (!v) return {};
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // not JSON
    }
    return {};
  }
  return v as Record<string, boolean>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function KnowledgeBaseView() {
  const qc = useQueryClient();
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [showCreate, setShowCreate] = React.useState(false);
  const [editItem, setEditItem] = React.useState<KbDocument | null>(null);
  const [deleteItem, setDeleteItem] = React.useState<KbDocument | null>(null);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const qs = React.useMemo(() => {
    const params = new URLSearchParams();
    if (categoryFilter && categoryFilter !== "all")
      params.set("category", categoryFilter);
    if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
    return params.toString();
  }, [categoryFilter, debouncedSearch]);

  const docsQ = useQuery<KbListResponse | KbDocument[]>({
    queryKey: ["ai-kb", categoryFilter, debouncedSearch],
    queryFn: () => apiFetch(`/api/ai/knowledge-base?${qs}`),
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Normalize response (might be array or {items})
  const documents: KbDocument[] = React.useMemo(() => {
    const d = docsQ.data;
    if (!d) return [];
    if (Array.isArray(d)) return d;
    return d.items || d.data || [];
  }, [docsQ.data]);

  const createMut = useMutation({
    mutationFn: (payload: {
      title: string;
      category: string;
      content: string;
      sourceType: string;
      visibility: Record<string, boolean>;
    }) =>
      apiFetch("/api/ai/knowledge-base", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-kb"] });
      qc.invalidateQueries({ queryKey: ["kb-docs"] });
      toast.success("Dokumen berhasil ditambahkan");
      setShowCreate(false);
      setEditItem(null);
    },
    onError: (e: any) =>
      toast.error(e?.message || "Gagal menambahkan dokumen"),
  });

  const updateMut = useMutation({
    mutationFn: (payload: {
      id: string;
      title: string;
      category: string;
      content: string;
      visibility: Record<string, boolean>;
    }) =>
      apiFetch(`/api/ai/knowledge-base/${payload.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: payload.title,
          category: payload.category,
          content: payload.content,
          visibilityJson: JSON.stringify(payload.visibility),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-kb"] });
      qc.invalidateQueries({ queryKey: ["kb-docs"] });
      toast.success("Dokumen berhasil diperbarui");
      setEditItem(null);
    },
    onError: (e: any) =>
      toast.error(e?.message || "Gagal memperbarui dokumen"),
  });

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  function handleEdit(doc: KbDocument) {
    setEditItem(doc);
  }

  function handleDelete(doc: KbDocument) {
    setDeleteItem(doc);
  }

  async function confirmDelete() {
    if (!deleteItem) return;
    try {
      await apiFetch(`/api/ai/knowledge-base/${deleteItem.id}`, { method: "DELETE" });
      toast.success(`Dokumen "${deleteItem.title}" dihapus`);
      qc.invalidateQueries({ queryKey: ["kb-docs"] });
      setDeleteItem(null);
    } catch (e: any) {
      toast.error(e?.message || "Gagal menghapus dokumen");
    }
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-4">
      <PageHeader
        title="Basis Pengetahuan"
        description="Kelola dokumen yang menjadi sumber jawaban AI"
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Tambah Dokumen
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cari judul atau isi dokumen…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-9 w-full sm:w-[200px]">
            <SelectValue placeholder="Semua Kategori" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {docsQ.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : docsQ.isError ? (
          <EmptyState
            title="Gagal memuat dokumen"
            description="Terjadi kesalahan saat memuat basis pengetahuan"
            icon={AlertTriangle}
          />
        ) : documents.length === 0 ? (
          <EmptyState
            title="Belum ada dokumen"
            description="Tambahkan dokumen pertama untuk memberi AI sumber pengetahuan"
            icon={Inbox}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Judul</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead className="text-center">Chunk</TableHead>
                <TableHead>Sumber</TableHead>
                <TableHead>Dibuat</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="rounded-md bg-muted/40 p-1.5">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {doc.title}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {doc.content?.slice(0, 80)}
                          {doc.content && doc.content.length > 80 ? "…" : ""}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        categoryBadgeClass(doc.category)
                      )}
                    >
                      {categoryLabel(doc.category)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="inline-flex items-center gap-1 text-sm">
                      <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                      {doc.chunkCount ?? 0}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs capitalize text-muted-foreground">
                      {SOURCE_TYPES.find((s) => s.value === doc.sourceType)
                        ?.label || doc.sourceType}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(doc.createdAt)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => handleEdit(doc)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-rose-400 hover:bg-rose-500/10"
                        onClick={() => handleDelete(doc)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Stats summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3 space-y-0.5">
          <p className="text-xs text-muted-foreground">Total Dokumen</p>
          <p className="text-lg font-semibold text-foreground">
            {documents.length}
          </p>
        </Card>
        <Card className="p-3 space-y-0.5">
          <p className="text-xs text-muted-foreground">Total Chunk</p>
          <p className="text-lg font-semibold text-foreground">
            {documents.reduce((sum, d) => sum + (d.chunkCount ?? 0), 0)}
          </p>
        </Card>
        <Card className="p-3 space-y-0.5">
          <p className="text-xs text-muted-foreground">Kategori</p>
          <p className="text-lg font-semibold text-foreground">
            {new Set(documents.map((d) => d.category)).size}
          </p>
        </Card>
        <Card className="p-3 space-y-0.5">
          <p className="text-xs text-muted-foreground">Sumber</p>
          <p className="text-lg font-semibold text-foreground">
            {new Set(documents.map((d) => d.sourceType)).size}
          </p>
        </Card>
      </div>

      {/* Create / Edit dialog */}
      <KbDocumentDialog
        open={showCreate || !!editItem}
        onOpenChange={(o) => {
          if (!o) {
            setShowCreate(false);
            setEditItem(null);
          }
        }}
        item={editItem}
        onSubmit={(payload) => {
          if (editItem) {
            updateMut.mutate({ ...payload, id: editItem.id });
          } else {
            createMut.mutate(payload);
          }
        }}
        isPending={createMut.isPending || updateMut.isPending}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteItem}
        onOpenChange={(o) => !o && setDeleteItem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus dokumen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dokumen{" "}
              <span className="font-medium text-foreground">
                “{deleteItem?.title}”
              </span>{" "}
              akan dihapus permanen beserta seluruh chunk embedding-nya.
              Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-500 hover:bg-rose-600 text-rose-50"
              onClick={confirmDelete}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Document dialog (Create / Edit)
// ---------------------------------------------------------------------------

interface KbDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: KbDocument | null;
  onSubmit: (payload: {
    title: string;
    category: string;
    content: string;
    sourceType: string;
    visibility: Record<string, boolean>;
  }) => void;
  isPending: boolean;
}

function KbDocumentDialog({
  open,
  onOpenChange,
  item,
  onSubmit,
  isPending,
}: KbDocumentDialogProps) {
  const [title, setTitle] = React.useState("");
  const [category, setCategory] = React.useState<KbCategory>("FAQ");
  const [content, setContent] = React.useState("");
  const [sourceType, setSourceType] = React.useState<SourceType>("manual");
  const [visibility, setVisibility] = React.useState<Record<string, boolean>>({
    landing: true,
    customer: true,
    reseller: false,
    admin: false,
  });

  // Reset form when dialog opens
  React.useEffect(() => {
    if (!open) return;
    if (item) {
      setTitle(item.title);
      setCategory(item.category);
      setContent(item.content);
      setSourceType(item.sourceType);
      setVisibility(parseVisibility(item.visibility));
    } else {
      setTitle("");
      setCategory("FAQ");
      setContent("");
      setSourceType("manual");
      setVisibility({
        landing: true,
        customer: true,
        reseller: false,
        admin: false,
      });
    }
  }, [open, item]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast.error("Judul dan konten wajib diisi");
      return;
    }
    onSubmit({
      title: title.trim(),
      category,
      content: content.trim(),
      sourceType,
      visibility,
    });
  }

  function toggleChannel(channel: string, checked: boolean) {
    setVisibility((prev) => ({ ...prev, [channel]: checked }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {item ? "Edit Dokumen" : "Tambah Dokumen"}
          </DialogTitle>
          <DialogDescription>
            Dokumen akan dipecah menjadi chunk & di-embed ke basis pengetahuan
            AI secara otomatis.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="kb-title">Judul</Label>
            <Input
              id="kb-title"
              placeholder="contoh: Cara reset password VPN"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          {/* Category & Source */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Kategori</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as KbCategory)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.filter((c) => c.value !== "all").map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Sumber</Label>
              <Select
                value={sourceType}
                onValueChange={(v) => setSourceType(v as SourceType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih sumber" />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-1.5">
            <Label htmlFor="kb-content">Konten</Label>
            <Textarea
              id="kb-content"
              rows={8}
              placeholder="Tulis isi dokumen…"
              className="resize-y font-mono text-sm"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
            />
            <p className="text-[11px] text-muted-foreground">
              {content.length} karakter ·{" "}
              {content.split(/\s+/).filter(Boolean).length} kata
            </p>
          </div>

          {/* Visibility */}
          <div className="space-y-2">
            <Label>Visibilitas Kanal</Label>
            <p className="text-[11px] text-muted-foreground">
              Tentukan portal mana yang dapat menggunakan dokumen ini sebagai
              sumber jawaban AI.
            </p>
            <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/20 p-3">
              {VISIBILITY_CHANNELS.map((ch) => (
                <div
                  key={ch.value}
                  className="flex items-center space-x-2"
                >
                  <Checkbox
                    id={`vis-${ch.value}`}
                    checked={!!visibility[ch.value]}
                    onCheckedChange={(v) =>
                      toggleChannel(ch.value, v === true)
                    }
                  />
                  <Label
                    htmlFor={`vis-${ch.value}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {ch.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Database className="mr-1.5 h-4 w-4" />
              )}
              {item ? "Simpan Perubahan" : "Simpan & Embed"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
