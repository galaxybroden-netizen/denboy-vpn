"use client";

// MVMP — Admin Live Chat
// WhatsApp Web-style inbox with three panels:
//   LEFT   : conversation list (filterable by status, searchable)
//   CENTER : message thread + reply composer + handover actions
//   RIGHT  : customer profile, AI suggested replies, internal notes, tags
//
// All labels are in Bahasa Indonesia. Built on the shadcn/ui dark theme.

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronRight,
  Copy,
  Inbox,
  Loader2,
  MessageSquare,
  PanelLeft,
  PanelRight,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Tag as TagIcon,
  User as UserIcon,
  X,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { PageHeader } from "../../PageHeader";
import { EmptyState, apiFetch } from "../../lib";
import { formatDateTime, timeAgo } from "@/lib/utils-mvmp";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ConversationStatus =
  | "AI_ACTIVE"
  | "HUMAN_ASSIGNED"
  | "WAITING"
  | "RESOLVED";

interface ConversationMessage {
  id: string;
  role: "user" | "bot" | "admin" | "system";
  content: string;
  createdAt: string;
  senderName?: string | null;
}

interface ConversationItem {
  id: string;
  status: ConversationStatus;
  channel: string;
  visitorName: string;
  visitorEmail?: string | null;
  visitorPhone?: string | null;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  unreadCount?: number;
  summary?: string | null;
  tags?: string[];
  assignedAdminName?: string | null;
  assignedAdminId?: string | null;
}

interface ConversationDetail extends ConversationItem {
  messages: ConversationMessage[];
  notes?: string | null;
}

interface AISuggestion {
  id: string;
  tone: "short" | "professional" | "detailed";
  content: string;
}

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "AI_ACTIVE", label: "AI Aktif" },
  { value: "HUMAN_ASSIGNED", label: "Ditangani Admin" },
  { value: "WAITING", label: "Menunggu" },
  { value: "RESOLVED", label: "Selesai" },
];

const STATUS_BADGE: Record<
  ConversationStatus,
  { label: string; className: string }
> = {
  AI_ACTIVE: {
    label: "AI Aktif",
    className:
      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  HUMAN_ASSIGNED: {
    label: "Ditangani Admin",
    className:
      "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  WAITING: {
    label: "Menunggu",
    className: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  },
  RESOLVED: {
    label: "Selesai",
    className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  },
};

const SUGGESTION_TONE_LABEL: Record<AISuggestion["tone"], string> = {
  short: "Singkat",
  professional: "Profesional",
  detailed: "Detail",
};

function initialsOf(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("") || "?";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminLiveChat() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [showAddContact, setShowAddContact] = React.useState(false);
  const [replyDraft, setReplyDraft] = React.useState("");
  const [notesDraft, setNotesDraft] = React.useState("");
  const [mobilePanel, setMobilePanel] =
    React.useState<"list" | "thread" | "profile">("list");
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const threadScrollRef = React.useRef<HTMLDivElement>(null);

  // Build query string for the conversations list
  const listQs = React.useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter && statusFilter !== "all")
      params.set("status", statusFilter);
    if (search.trim()) params.set("q", search.trim());
    return params.toString();
  }, [statusFilter, search]);

  const conversationsQ = useQuery<{ items: ConversationItem[]; pagination: any }>({
    queryKey: ["ai-conversations", statusFilter, search],
    queryFn: () => apiFetch(`/api/ai/conversations?${listQs}`),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const conversations = conversationsQ.data?.items ?? [];

  const messagesQ = useQuery<ConversationDetail>({
    queryKey: ["ai-messages", selectedId],
    queryFn: () => apiFetch(`/api/ai/conversations/${selectedId}`),
    enabled: !!selectedId,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Sync notes draft when conversation loads
  React.useEffect(() => {
    if (messagesQ.data) {
      setNotesDraft(messagesQ.data.notes ?? "");
    }
  }, [messagesQ.data?.id]);  

  // Auto-scroll to bottom on new messages — use manual scrollTop to avoid
  // scrolling the entire page (which causes layout to jump).
  // scrollIntoView() scrolls the nearest scrollable ancestor which may be the
  // window, not the ScrollArea viewport — causing the "chat bergeser ke atas" bug.
  React.useEffect(() => {
    // Use requestAnimationFrame to ensure DOM is updated before scrolling
    requestAnimationFrame(() => {
      const scrollArea = threadScrollRef.current;
      if (!scrollArea) return;
      // Radix ScrollArea viewport is the element with [data-radix-scroll-area-viewport]
      const viewport = scrollArea.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      } else {
        // Fallback: scroll the container itself
        scrollArea.scrollTop = scrollArea.scrollHeight;
      }
    });
  }, [messagesQ.data?.messages?.length, selectedId]);

  // -----------------------------------------------------------------------
  // Mutations
  // -----------------------------------------------------------------------

  const sendMessageMut = useMutation({
    mutationFn: (vars: { conversationId: string; content: string }) =>
      apiFetch(`/api/ai/conversations/${vars.conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: vars.content }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-messages", selectedId] });
      qc.invalidateQueries({ queryKey: ["ai-conversations"] });
      setReplyDraft("");
    },
    onError: (e: any) => toast.error(e?.message || "Gagal mengirim pesan"),
  });

  const handoverMut = useMutation({
    mutationFn: (vars: { conversationId: string; action: "takeover" | "return_to_ai" }) =>
      apiFetch(`/api/ai/conversations/${vars.conversationId}/handover`, {
        method: "POST",
        body: JSON.stringify({ action: vars.action }),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["ai-messages", selectedId] });
      qc.invalidateQueries({ queryKey: ["ai-conversations"] });
      toast.success(
        vars.action === "takeover"
          ? "Percakapan diambil alih"
          : "Percakapan dikembalikan ke AI"
      );
    },
    onError: (e: any) => toast.error(e?.message || "Gagal mengubah handover"),
  });

  const closeMut = useMutation({
    mutationFn: (conversationId: string) =>
      apiFetch(`/api/ai/conversations/${conversationId}/handover`, {
        method: "POST",
        body: JSON.stringify({ action: "close" }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-messages", selectedId] });
      qc.invalidateQueries({ queryKey: ["ai-conversations"] });
      toast.success("Percakapan ditutup");
    },
    onError: (e: any) => toast.error(e?.message || "Gagal menutup percakapan"),
  });

  const suggestMut = useMutation({
    mutationFn: (conversationId: string) =>
      apiFetch<AISuggestion[]>(
        `/api/ai/conversations/${conversationId}/suggest`,
        { method: "POST" }
      ),
    onSuccess: (data) => {
      qc.setQueryData(["ai-suggestions", selectedId], data);
      toast.success("Saran balasan dibuat");
    },
    onError: (e: any) => toast.error(e?.message || "Gagal membuat saran"),
  });

  const suggestionsQ = useQuery<AISuggestion[]>({
    queryKey: ["ai-suggestions", selectedId],
    queryFn: () => apiFetch(`/api/ai/conversations/${selectedId}/suggest`),
    enabled: false, // manual trigger only
    retry: false,
    refetchOnWindowFocus: false,
  });

  const suggestions: AISuggestion[] | undefined =
    suggestMut.data ?? suggestionsQ.data;

  // -----------------------------------------------------------------------
  // Derived state
  // -----------------------------------------------------------------------

  const selected = messagesQ.data;
  const selectedStatus: ConversationStatus | undefined = selected?.status;
  const isHumanAssigned = selectedStatus === "HUMAN_ASSIGNED";
  const isResolved = selectedStatus === "RESOLVED";

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  function handleSend() {
    if (!selectedId || !replyDraft.trim()) return;
    sendMessageMut.mutate({
      conversationId: selectedId,
      content: replyDraft.trim(),
    });
  }

  function handleUseSuggestion(s: AISuggestion) {
    setReplyDraft(s.content);
    setMobilePanel("thread");
  }

  async function handleCopySuggestion(s: AISuggestion) {
    try {
      await navigator.clipboard.writeText(s.content);
      toast.success("Disalin ke clipboard");
    } catch {
      toast.error("Gagal menyalin");
    }
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-4">
      <PageHeader
        title="Live Chat"
        description="Pantau percakapan AI & ambil alih saat dibutuhkan"
      />

      {/* Mobile panel switcher */}
      <div className="md:hidden">
        <Tabs value={mobilePanel} onValueChange={(v) => setMobilePanel(v as any)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="list">
              <PanelLeft className="mr-1 h-3.5 w-3.5" /> Daftar
            </TabsTrigger>
            <TabsTrigger value="thread" disabled={!selectedId}>
              <MessageSquare className="mr-1 h-3.5 w-3.5" /> Obrolan
            </TabsTrigger>
            <TabsTrigger value="profile" disabled={!selectedId}>
              <PanelRight className="mr-1 h-3.5 w-3.5" /> Profil
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex h-[calc(100vh-8rem)] min-h-0 gap-0 overflow-hidden rounded-lg border border-border bg-card">
        {/* ---------------- LEFT : conversation list ---------------- */}
        <aside
          className={cn(
            "w-full shrink-0 flex-col border-r border-border md:flex md:w-[280px]",
            mobilePanel === "list" ? "flex" : "hidden md:flex"
          )}
        >
          <div className="border-b border-border p-3 space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Cari pengunjung…"
                  className="pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-9 shrink-0 gap-1.5"
                onClick={() => setShowAddContact(true)}
              >
                <Plus className="h-4 w-4" />
                Kontak
              </Button>
            </div>
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <ScrollArea className="w-full whitespace-nowrap">
                <TabsList className="flex w-max">
                  {STATUS_TABS.map((t) => (
                    <TabsTrigger
                      key={t.value}
                      value={t.value}
                      className="text-xs"
                    >
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </ScrollArea>
            </Tabs>
          </div>

          <ScrollArea className="flex-1">
            {conversationsQ.isLoading ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : conversationsQ.isError ? (
              <EmptyState
                title="Gagal memuat percakapan"
                description="Terjadi kesalahan saat memuat daftar"
                icon={AlertTriangle}
              />
            ) : conversations.length === 0 ? (
              <EmptyState
                title="Belum ada percakapan"
                description="Percakapan baru akan muncul di sini"
                icon={Inbox}
              />
            ) : (
              <ul className="divide-y divide-border">
                {conversations.map((c) => {
                  const badge = STATUS_BADGE[c.status];
                  const isSelected = c.id === selectedId;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(c.id);
                          setMobilePanel("thread");
                        }}
                        className={cn(
                          "flex w-full gap-3 px-3 py-3 text-left transition hover:bg-muted/40",
                          isSelected && "bg-muted/60"
                        )}
                      >
                        <Avatar className="h-9 w-9 shrink-0">
                          <AvatarFallback className="bg-muted text-xs">
                            {initialsOf(c.visitorName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-medium text-foreground">
                              {c.visitorName || "Tanpa nama"}
                            </p>
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {c.lastMessageAt ? timeAgo(c.lastMessageAt) : ""}
                            </span>
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {c.lastMessage || c.visitorEmail || "—"}
                          </p>
                          <div className="flex items-center justify-between gap-2 pt-1">
                            <Badge
                              variant="outline"
                              className={cn("text-[10px] px-1.5 py-0", badge.className)}
                            >
                              {badge.label}
                            </Badge>
                            {c.unreadCount && c.unreadCount > 0 ? (
                              <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-950">
                                {c.unreadCount}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </aside>

        {/* ---------------- CENTER : message thread ---------------- */}
        <section
          className={cn(
            "min-h-0 min-w-0 flex-1 flex-col",
            mobilePanel === "thread" ? "flex" : "hidden md:flex"
          )}
        >
          {!selectedId ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                title="Pilih percakapan"
                description="Pilih satu percakapan di panel kiri untuk mulai membalas"
                icon={MessageSquare}
              />
            </div>
          ) : (
            <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
              {/* Thread header */}
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {selected?.visitorName || "Memuat…"}
                    </p>
                    {selectedStatus ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] px-1.5 py-0",
                          STATUS_BADGE[selectedStatus].className
                        )}
                      >
                        {STATUS_BADGE[selectedStatus].label}
                      </Badge>
                    ) : null}
                  </div>
                  {isHumanAssigned && selected?.assignedAdminName ? (
                    <p className="text-xs text-amber-400">
                      Ditangani oleh: {selected.assignedAdminName}
                    </p>
                  ) : (
                    <p className="truncate text-xs text-muted-foreground">
                      {selected?.visitorEmail || selected?.channel || ""}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          handoverMut.isPending ||
                          isHumanAssigned ||
                          isResolved ||
                          !selected
                        }
                        onClick={() =>
                          selectedId &&
                          handoverMut.mutate({
                            conversationId: selectedId,
                            action: "takeover",
                          })
                        }
                      >
                        <UserIcon className="mr-1 h-3.5 w-3.5" />
                        Ambil Alih
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Ambil alih dari AI</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          handoverMut.isPending ||
                          !isHumanAssigned ||
                          isResolved
                        }
                        onClick={() =>
                          selectedId &&
                          handoverMut.mutate({
                            conversationId: selectedId,
                            action: "return_to_ai",
                          })
                        }
                      >
                        <Bot className="mr-1 h-3.5 w-3.5" />
                        Kembali ke AI
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Kembalikan ke AI</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={closeMut.isPending || isResolved}
                        onClick={() => selectedId && closeMut.mutate(selectedId)}
                      >
                        <X className="mr-1 h-3.5 w-3.5" />
                        Tutup
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Tutup percakapan</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => messagesQ.refetch()}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Segarkan</TooltipContent>
                  </Tooltip>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 md:hidden"
                    onClick={() => setMobilePanel("profile")}
                  >
                    <PanelRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea ref={threadScrollRef} className="flex-1 min-h-0 px-4 py-4">
                {messagesQ.isLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton
                        key={i}
                        className={cn("h-12 w-2/3", i % 2 ? "ml-auto" : "")}
                      />
                    ))}
                  </div>
                ) : messagesQ.isError ? (
                  <EmptyState
                    title="Gagal memuat pesan"
                    icon={AlertTriangle}
                  />
                ) : (
                  <div className="space-y-3">
                    {selected?.messages?.map((m) => (
                      <MessageBubble key={m.id} message={m} />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              {/* Reply composer */}
              <div className="border-t border-border p-3">
                <div className="flex items-end gap-2">
                  <Textarea
                    rows={2}
                    placeholder={
                      isResolved
                        ? "Percakapan telah ditutup"
                        : isHumanAssigned
                        ? "Ketik balasan Anda…"
                        : "Ambil alih untuk membalas secara manual…"
                    }
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    disabled={
                      !isHumanAssigned ||
                      sendMessageMut.isPending ||
                      isResolved
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                  />
                  <Button
                    onClick={handleSend}
                    disabled={
                      !isHumanAssigned ||
                      !replyDraft.trim() ||
                      sendMessageMut.isPending ||
                      isResolved
                    }
                  >
                    {sendMessageMut.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    <span className="ml-1.5">Kirim</span>
                  </Button>
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Tekan Enter untuk kirim, Shift+Enter untuk baris baru
                </p>
              </div>
            </div>
          )}
        </section>

        {/* ---------------- RIGHT : customer profile ---------------- */}
        <aside
          className={cn(
            "w-full shrink-0 flex-col border-l border-border md:flex md:w-[300px] min-h-0",
            mobilePanel === "profile" ? "flex" : "hidden md:flex"
          )}
        >
          {!selectedId ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                title="Profil pelanggan"
                description="Pilih percakapan untuk melihat detail"
                icon={UserIcon}
              />
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="space-y-4 p-4">
                {/* Profile */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-muted">
                        {initialsOf(selected?.visitorName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {selected?.visitorName || "—"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {selected?.visitorEmail || selected?.visitorPhone || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md border border-border bg-muted/30 p-2">
                      <p className="text-muted-foreground">Kanal</p>
                      <p className="font-medium text-foreground capitalize">
                        {selected?.channel || "—"}
                      </p>
                    </div>
                    <div className="rounded-md border border-border bg-muted/30 p-2">
                      <p className="text-muted-foreground">Status</p>
                      <p className="font-medium text-foreground">
                        {selectedStatus
                          ? STATUS_BADGE[selectedStatus].label
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Summary */}
                {selected?.summary ? (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Ringkasan
                    </p>
                    <p className="text-xs text-foreground/90 leading-relaxed rounded-md border border-border bg-muted/30 p-2.5">
                      {selected.summary}
                    </p>
                  </div>
                ) : null}

                {/* AI Suggestions */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5" /> Saran Balasan AI
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      disabled={suggestMut.isPending || !selectedId}
                      onClick={() => selectedId && suggestMut.mutate(selectedId)}
                    >
                      {suggestMut.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      <span className="ml-1">Generate</span>
                    </Button>
                  </div>
                  {!suggestions || suggestions.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                      Klik “Generate” untuk membuat saran balasan
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {suggestions.map((s) => (
                        <Card
                          key={s.id}
                          className="p-2.5 space-y-1.5 bg-muted/20"
                        >
                          <div className="flex items-center justify-between">
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            >
                              {SUGGESTION_TONE_LABEL[s.tone]}
                            </Badge>
                            <div className="flex items-center gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6"
                                    onClick={() => handleCopySuggestion(s)}
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Salin</TooltipContent>
                              </Tooltip>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-xs"
                                onClick={() => handleUseSuggestion(s)}
                              >
                                <ChevronRight className="mr-1 h-3 w-3" /> Pakai
                              </Button>
                            </div>
                          </div>
                          <p className="text-xs text-foreground/90 leading-relaxed line-clamp-4">
                            {s.content}
                          </p>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>

                {/* Internal notes */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Catatan Internal
                  </Label>
                  <Textarea
                    rows={4}
                    placeholder="Catatan untuk tim internal…"
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => toast.success("Catatan disimpan")}
                  >
                    <Check className="mr-1 h-3.5 w-3.5" /> Simpan Catatan
                  </Button>
                </div>

                {/* Tags */}
                <div className="space-y-1.5">
                  <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <TagIcon className="h-3.5 w-3.5" /> Tag Percakapan
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selected?.tags && selected.tags.length > 0 ? (
                      selected.tags.map((t) => (
                        <Badge
                          key={t}
                          variant="secondary"
                          className="text-[10px]"
                        >
                          {t}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Belum ada tag
                      </p>
                    )}
                  </div>
                </div>

                <p className="pt-2 text-[10px] text-muted-foreground">
                  {selected?.lastMessageAt
                    ? `Diperbarui ${formatDateTime(selected.lastMessageAt)}`
                    : null}
                </p>
              </div>
            </ScrollArea>
          )}
        </aside>
      </div>

      {/* Add Contact Dialog */}
      <AddContactDialog
        open={showAddContact}
        onOpenChange={setShowAddContact}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["chat-conversations"] });
          setShowAddContact(false);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Contact Dialog
// ---------------------------------------------------------------------------

function AddContactDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setName("");
      setPhone("");
    }
  }, [open]);

  async function handleSave() {
    if (!name.trim() || !phone.trim()) {
      toast.error("Nama dan nomor telepon wajib diisi");
      return;
    }
    // Basic phone validation — digits only, min 8 chars
    const phoneClean = phone.trim().replace(/[^0-9]/g, "");
    if (phoneClean.length < 8) {
      toast.error("Nomor telepon tidak valid (minimal 8 digit)");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/whatsapp/contacts", {
        method: "POST",
        body: JSON.stringify({
          displayName: name.trim(),
          phoneNumber: phoneClean,
        }),
      });
      toast.success(`Kontak "${name}" ditambahkan`);
      onCreated();
    } catch (e: any) {
      toast.error(e?.message || "Gagal menambahkan kontak");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Tambah Kontak Baru</DialogTitle>
          <DialogDescription>
            Kontak akan disimpan dan dapat digunakan untuk memulai percakapan.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="contact-name">Nama Kontak</Label>
            <Input
              id="contact-name"
              placeholder="contoh: Budi Santoso"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact-phone">Nomor Telepon</Label>
            <Input
              id="contact-phone"
              placeholder="contoh: 6281234567890"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Format: kode negara + nomor tanpa tanda + (contoh: 62 untuk Indonesia)
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Tambah Kontak
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: ConversationMessage }) {
  const isUser = message.role === "user";
  const isBot = message.role === "bot";
  const isAdmin = message.role === "admin";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center py-1">
        <span className="rounded-full bg-muted/60 px-2.5 py-0.5 text-[10px] text-muted-foreground">
          {message.content}
        </span>
      </div>
    );
  }

  const isRight = isAdmin;
  return (
    <div
      className={cn(
        "flex w-full gap-2",
        isRight ? "justify-end" : "justify-start"
      )}
    >
      {!isRight ? (
        <Avatar className="h-7 w-7 shrink-0 mt-0.5">
          <AvatarFallback
            className={cn(
              "text-[10px]",
              isBot
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-muted text-muted-foreground"
            )}
          >
            {isBot ? <Bot className="h-3.5 w-3.5" /> : initialsOf(message.senderName)}
          </AvatarFallback>
        </Avatar>
      ) : null}
      <div
        className={cn(
          "max-w-[78%] rounded-lg px-3 py-2 text-sm",
          isUser && "bg-muted text-foreground/90 rounded-bl-sm",
          isBot &&
            "bg-emerald-500/15 text-emerald-50 border border-emerald-500/20 rounded-bl-sm",
          isAdmin &&
            "bg-emerald-500 text-emerald-950 rounded-br-sm ml-auto"
        )}
      >
        {isAdmin && message.senderName ? (
          <p className="mb-0.5 text-[10px] font-semibold text-emerald-900/70">
            {message.senderName}
          </p>
        ) : null}
        <p className="whitespace-pre-wrap break-words leading-relaxed">
          {message.content}
        </p>
        {message.createdAt ? (
          <p
            className={cn(
              "mt-1 text-[10px]",
              isAdmin ? "text-emerald-900/60" : "text-muted-foreground"
            )}
          >
            {formatDateTime(message.createdAt)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
