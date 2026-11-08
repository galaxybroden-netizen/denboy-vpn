"use client";

// MVMP — Prompt Management View
// Browse, edit and version AI prompts. Six default prompt keys cover all
// channels (landing/customer/reseller) plus the admin agent and reply-assist.
// Each prompt keeps a full version history; saving creates a new version.
//
// All labels are in Bahasa Indonesia. Built on the shadcn/ui dark theme.

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Clock,
  FileText,
  History,
  Loader2,
  Pencil,
  Play,
  Save,
  Sparkles,
  Thermometer,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { PageHeader } from "../../PageHeader";
import { EmptyState, apiFetch } from "../../lib";
import { formatDateTime } from "@/lib/utils-mvmp";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PromptVersion {
  id: string;
  version: number;
  content: string;
  temperature?: number;
  maxTokens?: number;
  status: "published" | "draft" | "archived";
  createdAt: string;
  createdBy?: string | null;
  notes?: string | null;
}

interface PromptItem {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  currentVersion?: number;
  status?: "published" | "draft" | "archived";
  content?: string;
  temperature?: number;
  maxTokens?: number;
  versions?: PromptVersion[];
  createdAt?: string;
  updatedAt?: string;
}

interface PromptsResponse {
  items?: PromptItem[];
  data?: PromptItem[];
  total?: number;
}

interface TestResponseData {
  content: string;
  model?: string;
  tokensUsed?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PROMPT_META: Record<
  string,
  { name: string; description: string }
> = {
  global_system: {
    name: "Global System Prompt",
    description:
      "Prompt sistem utama yang menjadi konteks dasar untuk semua interaksi AI.",
  },
  chatbot_landing: {
    name: "Chatbot Landing Page",
    description:
      "Prompt untuk chatbot publik di landing page — fokus konversi & info umum.",
  },
  chatbot_customer: {
    name: "Chatbot Customer Portal",
    description:
      "Prompt untuk chatbot di portal pelanggan — dukungan teknis & billing.",
  },
  chatbot_reseller: {
    name: "Chatbot Reseller Portal",
    description:
      "Prompt untuk chatbot di portal reseller — komisi, paket reseller, onboarding.",
  },
  agent_admin: {
    name: "Admin AI Agent",
    description:
      "Prompt untuk agen AI admin — tool calling & rekomendasi aksi operasional.",
  },
  reply_assist: {
    name: "Reply Assist",
    description:
      "Prompt untuk generator saran balasan admin pada live chat WhatsApp.",
  },
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  published: {
    label: "Dipublikasi",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  draft: {
    label: "Draft",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  archived: {
    label: "Arsip",
    className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PromptManagementView() {
  const qc = useQueryClient();
  const [editing, setEditing] = React.useState<PromptItem | null>(null);

  const promptsQ = useQuery<PromptsResponse | PromptItem[]>({
    queryKey: ["ai-prompts"],
    queryFn: () => apiFetch("/api/ai/prompts"),
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Normalize — handle both array and {items} responses; ensure all 6
  // default keys are always present even if the API hasn't created them yet.
  const prompts: PromptItem[] = React.useMemo(() => {
    const d = promptsQ.data;
    let raw: any[] = [];
    if (Array.isArray(d)) raw = d;
    else if (d) raw = d.items || d.data || [];

    // Map API response to component's PromptItem shape
    // API returns currentVersion as an object (AIPromptVersion record);
    // component expects currentVersion as a number (version number).
    const mapped: PromptItem[] = raw.map((p: any) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      description: p.description,
      // Extract version number from the currentVersion object if it's an object
      currentVersion: typeof p.currentVersion === "object" && p.currentVersion
        ? p.currentVersion.version
        : typeof p.currentVersion === "number"
          ? p.currentVersion
          : 0,
      status: typeof p.currentVersion === "object" && p.currentVersion
        ? p.currentVersion.status
        : p.status || "draft",
      content: typeof p.currentVersion === "object" && p.currentVersion
        ? p.currentVersion.content
        : p.content || "",
      temperature: typeof p.currentVersion === "object" && p.currentVersion
        ? p.currentVersion.temperature
        : p.temperature,
      maxTokens: typeof p.currentVersion === "object" && p.currentVersion
        ? p.currentVersion.maxTokens
        : p.maxTokens,
      versions: p.versions || [],
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    // Ensure all 6 default prompts are shown
    const result: PromptItem[] = [...mapped];
    for (const key of Object.keys(DEFAULT_PROMPT_META)) {
      if (!result.some((p) => p.key === key)) {
        const meta = DEFAULT_PROMPT_META[key];
        result.push({
          id: `__placeholder_${key}`,
          key,
          name: meta.name,
          description: meta.description,
          currentVersion: 0,
          status: "draft",
          content: "",
          versions: [],
        });
      }
    }
    // Sort by canonical order
    const order = Object.keys(DEFAULT_PROMPT_META);
    result.sort(
      (a, b) => order.indexOf(a.key) - order.indexOf(b.key)
    );
    return result;
  }, [promptsQ.data]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-4">
      <PageHeader
        title="Manajemen Prompt"
        description="Kelola & versioning prompt yang mengarahkan perilaku AI di seluruh kanal"
      />

      {/* Grid of prompt cards */}
      {promptsQ.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : promptsQ.isError ? (
        <Card>
          <EmptyState
            title="Gagal memuat prompt"
            description="Terjadi kesalahan saat memuat daftar prompt"
            icon={AlertTriangle}
          />
        </Card>
      ) : prompts.length === 0 ? (
        <Card>
          <EmptyState
            title="Belum ada prompt"
            description="Prompt default akan dibuat otomatis saat sistem dijalankan"
            icon={FileText}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {prompts.map((p) => (
            <PromptCard key={p.key} prompt={p} onEdit={() => setEditing(p)} />
          ))}
        </div>
      )}

      {/* Editor dialog */}
      <PromptEditorDialog
        prompt={editing}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prompt card
// ---------------------------------------------------------------------------

function PromptCard({
  prompt,
  onEdit,
}: {
  prompt: PromptItem;
  onEdit: () => void;
}) {
  const status = prompt.status || "draft";
  const badge = STATUS_BADGE[status] || STATUS_BADGE.draft;
  const versionCount = prompt.versions?.length ?? 0;

  return (
    <Card className="flex flex-col p-4 gap-3 transition hover:border-emerald-500/40">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="truncate text-sm font-medium text-foreground">
            {prompt.name}
          </p>
          <p className="font-mono text-[10px] text-muted-foreground">
            {prompt.key}
          </p>
        </div>
        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", badge.className)}>
          {badge.label}
        </Badge>
      </div>

      <p className="line-clamp-3 text-xs text-muted-foreground leading-relaxed min-h-[3rem]">
        {prompt.description || "—"}
      </p>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <History className="h-3 w-3" />
          v{prompt.currentVersion ?? 0}
          {versionCount > 0 ? ` · ${versionCount} versi` : ""}
        </span>
        {prompt.updatedAt ? (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDateTime(prompt.updatedAt)}
          </span>
        ) : null}
      </div>

      <Button size="sm" variant="outline" onClick={onEdit} className="w-full">
        <Pencil className="mr-1.5 h-3.5 w-3.5" />
        Edit Prompt
      </Button>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Editor dialog
// ---------------------------------------------------------------------------

interface EditorDialogProps {
  prompt: PromptItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function PromptEditorDialog({ prompt, open, onOpenChange }: EditorDialogProps) {
  const qc = useQueryClient();

  const [content, setContent] = React.useState("");
  const [temperature, setTemperature] = React.useState(0.7);
  const [maxTokens, setMaxTokens] = React.useState(1024);
  const [testResult, setTestResult] = React.useState<string>("");
  const [versionNotes, setVersionNotes] = React.useState("");

  // Reset state when prompt changes
  React.useEffect(() => {
    if (!prompt) return;
    setContent(prompt.content || "");
    setTemperature(prompt.temperature ?? 0.7);
    setMaxTokens(prompt.maxTokens ?? 1024);
    setTestResult("");
    setVersionNotes("");
  }, [prompt?.id]);  

  // Save new version
  const saveMut = useMutation({
    mutationFn: (payload: {
      key: string;
      name: string;
      description: string;
      content: string;
      temperature: number;
      maxTokens: number;
      notes?: string;
    }) =>
      apiFetch("/api/ai/prompts", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-prompts"] });
      toast.success("Versi baru prompt disimpan");
      onOpenChange(false);
    },
    onError: (e: any) =>
      toast.error(e?.message || "Gagal menyimpan versi baru"),
  });

  // Test response
  const testMut = useMutation({
    mutationFn: (message: string) =>
      apiFetch<TestResponseData>("/api/ai/agent", {
        method: "POST",
        body: JSON.stringify({
          message,
          promptOverride: content,
          temperature,
          maxTokens,
        }),
      }),
    onSuccess: (data) => {
      setTestResult(data.content || "(respons kosong)");
      toast.success("Respons uji diterima");
    },
    onError: (e: any) => {
      setTestResult("Error: " + (e?.message || "Gagal menguji prompt"));
      toast.error(e?.message || "Gagal menguji prompt");
    },
  });

  function handleSave() {
    if (!prompt) return;
    if (!content.trim()) {
      toast.error("Konten prompt tidak boleh kosong");
      return;
    }
    saveMut.mutate({
      key: prompt.key,
      name: prompt.name,
      description: prompt.description || "",
      content: content.trim(),
      temperature,
      maxTokens,
      notes: versionNotes.trim() || undefined,
    });
  }

  function handleTest() {
    if (!content.trim()) {
      toast.error("Isi konten prompt sebelum menguji");
      return;
    }
    // Mock test: send a generic test message with the prompt as override
    testMut.mutate("Tolong berikan respons singkat sebagai uji coba.");
  }

  if (!prompt) return null;

  const versions = prompt.versions || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-emerald-400" />
            {prompt.name}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <code className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
              {prompt.key}
            </code>
            <span>·</span>
            <span>Versi saat ini: v{prompt.currentVersion ?? 0}</span>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[60vh]">
          <div className="space-y-4 pr-2">
            {/* Description (read-only) */}
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                {prompt.description || "Tidak ada deskripsi."}
              </p>
            </div>

            {/* Content */}
            <div className="space-y-1.5">
              <Label htmlFor="prompt-content">Konten Prompt</Label>
              <Textarea
                id="prompt-content"
                rows={10}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="resize-y font-mono text-xs leading-relaxed"
                placeholder="Tulis instruksi sistem untuk AI…"
              />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{content.length} karakter</span>
                <span>{content.split(/\s+/).filter(Boolean).length} kata</span>
              </div>
            </div>

            {/* Temperature & Max tokens */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Thermometer className="h-3.5 w-3.5 text-amber-400" />
                  Temperature
                  <span className="ml-auto font-mono text-xs text-foreground">
                    {temperature.toFixed(1)}
                  </span>
                </Label>
                <Slider
                  value={[temperature]}
                  min={0}
                  max={1}
                  step={0.1}
                  onValueChange={(v) => setTemperature(v[0])}
                />
                <p className="text-[10px] text-muted-foreground">
                  Nilai rendah = respons konsisten · Tinggi = kreatif
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="max-tokens">Max Tokens</Label>
                <Input
                  id="max-tokens"
                  type="number"
                  min={64}
                  max={8192}
                  step={64}
                  value={maxTokens}
                  onChange={(e) =>
                    setMaxTokens(Number(e.target.value) || 0)
                  }
                />
                <p className="text-[10px] text-muted-foreground">
                  Batas panjang respons (64 – 8192)
                </p>
              </div>
            </div>

            {/* Test response */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Play className="h-3.5 w-3.5 text-emerald-400" />
                  Uji Respons
                </Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleTest}
                  disabled={testMut.isPending}
                >
                  {testMut.isPending ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1 h-3 w-3" />
                  )}
                  Test Respons
                </Button>
              </div>
              {testResult ? (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <p className="text-xs text-muted-foreground mb-1">
                    Hasil uji:
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-foreground/90 leading-relaxed">
                    {testResult}
                  </p>
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border p-3 text-center">
                  <p className="text-xs text-muted-foreground">
                    Klik “Test Respons” untuk melihat output AI dengan prompt
                    ini
                  </p>
                </div>
              )}
            </div>

            {/* Version notes */}
            <div className="space-y-1.5">
              <Label htmlFor="version-notes">
                Catatan Versi{" "}
                <span className="text-muted-foreground font-normal">
                  (opsional)
                </span>
              </Label>
              <Input
                id="version-notes"
                placeholder="contoh: tambahkan instruksi bahasa Indonesia"
                value={versionNotes}
                onChange={(e) => setVersionNotes(e.target.value)}
              />
            </div>

            {/* Version history */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <History className="h-3.5 w-3.5" />
                Riwayat Versi
              </Label>
              {versions.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-3 text-center">
                  <p className="text-xs text-muted-foreground">
                    Belum ada riwayat versi tersimpan
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {[...versions]
                    .sort((a, b) => b.version - a.version)
                    .map((v) => (
                      <div
                        key={v.id}
                        className="flex items-start gap-2 rounded-md border border-border bg-muted/20 p-2"
                      >
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] px-1.5 py-0 shrink-0",
                            (
                              STATUS_BADGE[v.status] || STATUS_BADGE.draft
                            ).className
                          )}
                        >
                          v{v.version}
                        </Badge>
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p className="text-[11px] text-muted-foreground">
                            {formatDateTime(v.createdAt)}
                            {v.createdBy ? ` · ${v.createdBy}` : ""}
                          </p>
                          {v.notes ? (
                            <p className="text-xs text-foreground/80">
                              {v.notes}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="border-t border-border pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveMut.isPending || !content.trim()}
          >
            {saveMut.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            Simpan sebagai Versi Baru
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
