"use client";

// MVMP — AI Agent View
// Full-page chat for admins to interact directly with the MVMP AI Agent.
// The agent can use tools and propose actions which require explicit approval.
//
// All labels are in Bahasa Indonesia. Built on the shadcn/ui dark theme.

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  Check,
  CircleDot,
  Cpu,
  Loader2,
  Paperclip,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  User as UserIcon,
  Wrench,
  Zap,
  Copy as CopyIcon,
  BookOpen,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

interface AIModel {
  id: string;
  modelId: string;
  label?: string;
  category?: string;
}

interface AgentOverview {
  agentEnabled?: boolean;
  agentModel?: string;
  availableModels?: string[];
}

interface ToolCall {
  name: string;
  args?: Record<string, any>;
  result?: any;
}

interface AgentApproval {
  id: string;
  title: string;
  description?: string;
  action: string;
  payload?: Record<string, any>;
}

interface AgentResponse {
  content: string;
  toolsUsed?: ToolCall[];
  approval?: AgentApproval | null;
  model?: string;
  createdAt?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  toolsUsed?: ToolCall[];
  approval?: AgentApproval | null;
  pendingApproval?: boolean;
  approved?: boolean;
  rejected?: boolean;
  createdAt: string;
  loading?: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AIAgentView() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [selectedModel, setSelectedModel] = React.useState<string>("");
  const [agentMode, setAgentMode] = React.useState<"chat" | "plan" | "build">("chat");
  const [selectedKbIds, setSelectedKbIds] = React.useState<string[]>([]);
  const [lastUserMessage, setLastUserMessage] = React.useState<string>("");
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Overview query — gives us agentEnabled flag & available models
  const overviewQ = useQuery<AgentOverview>({
    queryKey: ["ai-agent-overview"],
    queryFn: () => apiFetch("/api/ai/overview"),
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Models list
  const modelsQ = useQuery<AIModel[]>({
    queryKey: ["ai-models"],
    queryFn: () => apiFetch("/api/ai/models"),
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Knowledge Base list for context selector
  const kbQ = useQuery<{ id: string; title: string }[]>({
    queryKey: ["ai-kb-simple"],
    queryFn: async () => {
      const res = await apiFetch<{ items?: any[]; data?: any[] }>("/api/ai/knowledge-base");
      const items = res.items || res.data || (Array.isArray(res) ? res : []);
      return items.map((d: any) => ({ id: d.id, title: d.title }));
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Set default model once loaded
  React.useEffect(() => {
    if (!selectedModel && overviewQ.data?.agentModel) {
      setSelectedModel(overviewQ.data.agentModel);
    } else if (
      !selectedModel &&
      modelsQ.data &&
      modelsQ.data.length > 0
    ) {
      setSelectedModel(modelsQ.data[0].modelId);
    }
  }, [overviewQ.data, modelsQ.data]);  

  // Auto-scroll
  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const agentEnabled = overviewQ.data?.agentEnabled ?? false;

  // -----------------------------------------------------------------------
  // Mutations
  // -----------------------------------------------------------------------

  const sendMut = useMutation({
    mutationFn: (vars: { message: string; model?: string; mode?: string; contextKbIds?: string[] }) =>
      apiFetch<AgentResponse>("/api/ai/agent", {
        method: "POST",
        body: JSON.stringify({
          message: vars.message,
          model: vars.model,
          mode: vars.mode || "chat",
          contextKbIds: vars.contextKbIds || [],
        }),
      }),
    onSuccess: (data, vars) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === vars.message + "-pending" // placeholder match
            ? {
                ...m,
                id: crypto.randomUUID(),
                loading: false,
                content: data.content,
                toolsUsed: data.toolsUsed,
                approval: data.approval,
                pendingApproval: !!data.approval,
                createdAt: data.createdAt || new Date().toISOString(),
              }
            : m
        )
      );
    },
    onError: (e: any, vars) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === vars.message + "-pending"
            ? {
                ...m,
                loading: false,
                error: e?.message || "Gagal mendapatkan respon dari agent",
              }
            : m
        )
      );
      toast.error(e?.message || "Gagal mendapatkan respon dari agent");
    },
  });

  const approveMut = useMutation({
    mutationFn: (vars: { approvalId: string; action: "approve" | "reject" }) =>
      apiFetch(`/api/ai/agent/approvals/${vars.approvalId}`, {
        method: "POST",
        body: JSON.stringify({ action: vars.action }),
      }),
    onSuccess: (_data, vars) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.approval?.id === vars.approvalId
            ? {
                ...m,
                pendingApproval: false,
                approved: vars.action === "approve",
                rejected: vars.action === "reject",
              }
            : m
        )
      );
      toast.success(
        vars.action === "approve"
          ? "Aksi disetujui & dieksekusi"
          : "Aksi ditolak"
      );
    },
    onError: (e: any) =>
      toast.error(e?.message || "Gagal memproses persetujuan"),
  });

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || sendMut.isPending) return;
    if (!agentEnabled) {
      toast.error("AI Agent sedang nonaktif. Aktifkan di Konfigurasi.");
      return;
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    const pendingId = trimmed + "-pending";
    const pendingMsg: ChatMessage = {
      id: pendingId,
      role: "agent",
      content: "",
      loading: true,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg, pendingMsg]);
    setInput("");
    setLastUserMessage(trimmed);
    sendMut.mutate({ message: trimmed, model: selectedModel, mode: agentMode, contextKbIds: selectedKbIds });
  }

  function handleClearChat() {
    setMessages([]);
    setLastUserMessage("");
    toast.success("Riwayat percakapan dibersihkan");
  }

  function handleRegenerate() {
    if (!lastUserMessage || sendMut.isPending) return;
    // Remove last agent response
    setMessages((prev) => {
      const filtered = prev.filter((m) => !m.loading || m.id !== lastUserMessage + "-pending");
      // Remove last agent message if it exists
      while (filtered.length > 0 && filtered[filtered.length - 1].role === "agent") {
        filtered.pop();
      }
      return filtered;
    });
    // Re-send
    const pendingMsg: ChatMessage = {
      id: lastUserMessage + "-pending-" + Date.now(),
      role: "agent",
      content: "",
      loading: true,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, pendingMsg]);
    sendMut.mutate({ message: lastUserMessage, model: selectedModel, mode: agentMode, contextKbIds: selectedKbIds });
    toast.info("Mengirim ulang pesan terakhir");
  }

  function handleCopyMessage(content: string) {
    navigator.clipboard.writeText(content).then(() => {
      toast.success("Pesan disalin ke clipboard");
    }).catch(() => {
      toast.error("Gagal menyalin pesan");
    });
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-4">
      <PageHeader
        title="AI Agent"
        description="Berkomunikasi langsung dengan agen AI yang dapat memanggil tool & mengusulkan aksi"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleClearChat}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Bersihkan
            </Button>
          </div>
        }
      />

      <Card className="mx-auto flex h-[calc(100vh-12rem)] w-full max-w-5xl flex-col overflow-hidden">
        {/* Header / status bar */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-emerald-500/15 text-emerald-400">
                <Bot className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-foreground">
                  MVMP AI Agent
                </p>
                {agentEnabled ? (
                  <Badge
                    variant="outline"
                    className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] px-1.5 py-0"
                  >
                    <CircleDot className="mr-1 h-2.5 w-2.5" /> Aktif
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="bg-zinc-500/15 text-zinc-400 border-zinc-500/30 text-[10px] px-1.5 py-0"
                  >
                    Nonaktif
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {overviewQ.isLoading
                  ? "Memuat konfigurasi…"
                  : agentEnabled
                  ? "Siap membantu dengan akses tool terbatas"
                  : "Aktifkan agent di tab Konfigurasi"}
              </p>
            </div>
          </div>

        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="space-y-4 p-4">
            {messages.length === 0 ? (
              <EmptyState
                title="Mulai percakapan dengan AI Agent"
                description="Tanyakan status server, buat VPN baru, atau minta ringkasan performa"
                icon={Sparkles}
                className="py-16"
              />
            ) : (
              messages.map((m) => (
                <AgentMessage
                  key={m.id}
                  message={m}
                  onApprove={(approvalId) =>
                    approveMut.mutate({ approvalId, action: "approve" })
                  }
                  onReject={(approvalId) =>
                    approveMut.mutate({ approvalId, action: "reject" })
                  }
                />
              ))
            )}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 border-t border-border px-3 py-2 flex-wrap">
          {/* Mode toggle */}
          <div className="flex items-center gap-1 rounded-md border border-border/60 bg-muted/20 p-0.5">
            <Button
              size="sm"
              variant={agentMode === "chat" ? "default" : "ghost"}
              className="h-7 px-2.5 text-xs gap-1"
              onClick={() => setAgentMode("chat")}
            >
              <MessageSquare className="h-3 w-3" />
              Chat
            </Button>
            <Button
              size="sm"
              variant={agentMode === "plan" ? "default" : "ghost"}
              className="h-7 px-2.5 text-xs gap-1"
              onClick={() => setAgentMode("plan")}
            >
              <BookOpen className="h-3 w-3" />
              Plan
            </Button>
            <Button
              size="sm"
              variant={agentMode === "build" ? "default" : "ghost"}
              className="h-7 px-2.5 text-xs gap-1"
              onClick={() => setAgentMode("build")}
            >
              <Wrench className="h-3 w-3" />
              Build
            </Button>
          </div>

          {/* Context selector (KB) */}
          <Select value={selectedKbIds[0] || "none"} onValueChange={(v) => setSelectedKbIds(v === "none" ? [] : [v])}>
            <SelectTrigger className="h-7 w-[180px] text-xs gap-1.5">
              <BookOpen className="h-3 w-3 text-muted-foreground" />
              <SelectValue placeholder="Context: KB" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Tanpa Knowledge Base</SelectItem>
              {kbQ.data?.map((kb) => (
                <SelectItem key={kb.id} value={kb.id}>{kb.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Regenerate */}
          {lastUserMessage && !sendMut.isPending && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2.5 text-xs gap-1"
              onClick={handleRegenerate}
            >
              <RefreshCw className="h-3 w-3" />
              Regenerate
            </Button>
          )}

          {/* Model selector (moved from header to toolbar for more space) */}
          <div className="ml-auto flex items-center gap-2">
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="h-7 w-[200px] text-xs gap-1.5">
                <Cpu className="h-3 w-3 text-muted-foreground" />
                <SelectValue placeholder="Pilih model" />
              </SelectTrigger>
              <SelectContent>
                {modelsQ.data?.map((m) => (
                  <SelectItem key={m.id} value={m.modelId}>
                    {m.label || m.modelId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-border p-3">
          <div className="flex items-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-9 shrink-0"
              disabled={!agentEnabled || sendMut.isPending}
              onClick={() => toast.info("Upload file segera hadir")}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Input
              placeholder={
                agentEnabled
                  ? `Tulis pesan untuk AI Agent (mode: ${agentMode})...`
                  : "AI Agent nonaktif"
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!agentEnabled || sendMut.isPending}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button
              onClick={handleSend}
              disabled={!agentEnabled || !input.trim() || sendMut.isPending}
            >
              {sendMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              <span className="ml-1.5">Kirim</span>
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Agent dapat memanggil tool & mengusulkan aksi yang memerlukan
            persetujuan Anda
          </p>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent message bubble
// ---------------------------------------------------------------------------

function AgentMessage({
  message,
  onApprove,
  onReject,
}: {
  message: ChatMessage;
  onApprove: (approvalId: string) => void;
  onReject: (approvalId: string) => void;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end gap-2">
        <div className="max-w-[80%] rounded-lg bg-emerald-500 px-3 py-2 text-emerald-950 rounded-br-sm">
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {message.content}
          </p>
          <p className="mt-1 text-[10px] text-emerald-900/60">
            {formatDateTime(message.createdAt)}
          </p>
        </div>
        <Avatar className="h-7 w-7 shrink-0 mt-0.5">
          <AvatarFallback className="bg-muted text-xs">
            <UserIcon className="h-3.5 w-3.5" />
          </AvatarFallback>
        </Avatar>
      </div>
    );
  }

  return (
    <div className="flex justify-start gap-2">
      <Avatar className="h-7 w-7 shrink-0 mt-0.5">
        <AvatarFallback className="bg-emerald-500/15 text-emerald-400">
          <Bot className="h-3.5 w-3.5" />
        </AvatarFallback>
      </Avatar>
      <div className="max-w-[80%] space-y-2">
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-foreground rounded-bl-sm">
          {message.loading ? (
            <div className="flex items-center gap-2 py-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
              <span className="text-xs text-muted-foreground">
                Agent berpikir…
              </span>
            </div>
          ) : message.error ? (
            <div className="flex items-center gap-2 py-1">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
              <span className="text-xs text-rose-400">{message.error}</span>
            </div>
          ) : (
            <>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {message.content}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {formatDateTime(message.createdAt)}
              </p>
            </>
          )}
        </div>

        {/* Tool calls */}
        {message.toolsUsed && message.toolsUsed.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {message.toolsUsed.map((t, idx) => (
              <Tooltip key={idx}>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="gap-1 bg-blue-500/10 text-blue-400 border-blue-500/30 text-[10px] px-1.5 py-0.5"
                  >
                    <Wrench className="h-3 w-3" />
                    Tool: {t.name}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <div className="space-y-1 text-xs">
                    {t.args ? (
                      <p>
                        <span className="text-muted-foreground">Argumen:</span>{" "}
                        <code className="text-foreground">
                          {JSON.stringify(t.args)}
                        </code>
                      </p>
                    ) : null}
                    {t.result !== undefined ? (
                      <p>
                        <span className="text-muted-foreground">Hasil:</span>{" "}
                        <code className="text-foreground">
                          {typeof t.result === "string"
                            ? t.result
                            : JSON.stringify(t.result)}
                        </code>
                      </p>
                    ) : null}
                  </div>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        ) : null}

        {/* Approval card */}
        {message.approval ? (
          <ApprovalCard
            approval={message.approval}
            pending={message.pendingApproval}
            approved={message.approved}
            rejected={message.approved === false ? message.rejected : false}
            onApprove={() => onApprove(message.approval!.id)}
            onReject={() => onReject(message.approval!.id)}
          />
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Approval card
// ---------------------------------------------------------------------------

function ApprovalCard({
  approval,
  pending,
  approved,
  rejected,
  onApprove,
  onReject,
}: {
  approval: AgentApproval;
  pending?: boolean;
  approved?: boolean;
  rejected?: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <Card className="border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <div className="rounded-md bg-amber-500/15 p-1.5">
          <Zap className="h-3.5 w-3.5 text-amber-400" />
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-xs font-medium text-foreground">
            Usulan Aksi: {approval.title}
          </p>
          {approval.description ? (
            <p className="text-[11px] text-muted-foreground">
              {approval.description}
            </p>
          ) : null}
          {approval.payload ? (
            <pre className="mt-1 max-h-24 overflow-auto rounded bg-muted/40 p-1.5 text-[10px] text-muted-foreground">
              {JSON.stringify(approval.payload, null, 2)}
            </pre>
          ) : null}
        </div>
      </div>
      {pending ? (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="h-7 bg-emerald-500 hover:bg-emerald-600 text-emerald-950"
            onClick={onApprove}
          >
            <ThumbsUp className="mr-1 h-3 w-3" /> Setujui
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
            onClick={onReject}
          >
            <ThumbsDown className="mr-1 h-3 w-3" /> Tolak
          </Button>
        </div>
      ) : (
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] px-1.5 py-0",
            approved
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
              : "bg-rose-500/15 text-rose-400 border-rose-500/30"
          )}
        >
          <Check className="mr-1 h-2.5 w-2.5" />
          {approved ? "Disetujui" : "Ditolak"}
        </Badge>
      )}
    </Card>
  );
}
