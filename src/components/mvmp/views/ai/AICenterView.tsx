"use client";

// MVMP — AI Management Center
// A comprehensive multi-provider AI engine dashboard with four tabs:
//   1. Overview      — dashboard stats, provider status, usage summary, config summary
//   2. Providers     — table of AI providers with configure dialog & test connection
//   3. Models        — table of AI models with filters (category, provider) & pricing
//   4. Configuration — full AIConfiguration form (routing, model selectors, budgets, toggles)
//
// All labels are in Bahasa Indonesia. Built on the shadcn/ui dark theme.

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Bot,
  Brain,
  Cloud,
  CloudOff,
  Cpu,
  FileText,
  GaugeCircle,
  Loader2,
  MessageSquare,
  Plug,
  Plus,
  Power,
  Save,
  ServerCog,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TestTube2,
  Wallet,
  Zap,
  ChevronDown,
  ChevronRight,
  Download,
  CheckIcon,
  Send,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

// Import the 4 new sub-views
import { AdminLiveChat } from "./AdminLiveChat";
import { AIAgentView } from "./AIAgentView";
import { KnowledgeBaseView } from "./KnowledgeBaseView";
import { PromptManagementView } from "./PromptManagementView";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { PageHeader } from "../../PageHeader";
import { StatCard } from "../../StatCard";
import { StatusBadge } from "../../StatusBadge";
import { EmptyState, apiFetch } from "../../lib";
import {
  formatCurrency,
  formatCurrencyRaw,
  formatDateTime,
  formatNumber,
  timeAgo,
} from "@/lib/utils-mvmp";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AIProviderItem {
  id: string;
  name: string;
  type: string; // cloud | local | coding_agent
  baseUrl: string;
  apiKeyPrefix: string | null;
  apiKeyPresent: boolean;
  orgId: string | null;
  apiVersion: string | null;
  authType: string;
  timeout: number;
  retryCount: number;
  rateLimitPerMin: number;
  priority: number;
  isActive: boolean;
  lastConnectedAt: string | null;
  lastError: string | null;
  metadataJson: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { models: number };
}

interface AIModelItem {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string;
  description: string | null;
  category: string;
  contextWindow: number;
  maxOutputTokens: number;
  inputPricePer1M: number;
  outputPricePer1M: number;
  currency: string;
  isFree: boolean;
  recommendedUse: string | null;
  isActive: boolean;
  provider: { id: string; name: string; type: string; isActive: boolean };
}

interface AIConfiguration {
  id: string;
  routingMode: string;
  defaultModelId: string | null;
  chatbotModelId: string | null;
  agentModelId: string | null;
  reasoningModelId: string | null;
  codingModelId: string | null;
  fallbackModelId: string | null;
  dailyBudgetUsd: number;
  monthlyBudgetUsd: number;
  maxCostPerRequestUsd: number;
  maxCostPerUserUsd: number;
  tokenQuotaDaily: number;
  requestQuotaDaily: number;
  chatbotEnabled: boolean;
  agentEnabled: boolean;
  defaultTemperature: number;
  defaultMaxTokens: number;
  streamingEnabled: boolean;
  emergencyShutdown: boolean;
  redactPII: boolean;
  redactCredentials: boolean;
}

interface AIOverview {
  providers: {
    activeCount: number;
    items: Array<{
      id: string;
      name: string;
      type: string;
      isActive: boolean;
      lastConnectedAt: string | null;
      lastError: string | null;
      priority: number;
      baseUrl: string;
    }>;
  };
  models: {
    total: number;
    freeCount: number;
    byCategory: Record<string, number>;
  };
  todayUsage: {
    totalRequests: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    totalCostUsd: number;
    failedRequests: number;
  };
  monthUsage: {
    totalRequests: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    totalCostUsd: number;
  };
  config: {
    routingMode: string;
    chatbotEnabled: boolean;
    agentEnabled: boolean;
    dailyBudgetUsd: number;
    monthlyBudgetUsd: number;
    maxCostPerRequestUsd: number;
    maxCostPerUserUsd: number;
    emergencyShutdown: boolean;
    streamingEnabled: boolean;
    redactPII: boolean;
    redactCredentials: boolean;
    defaultTemperature: number;
    defaultMaxTokens: number;
    defaultModelId: string | null;
    chatbotModelId: string | null;
    agentModelId: string | null;
    reasoningModelId: string | null;
    codingModelId: string | null;
    fallbackModelId: string | null;
  };
  conversations: {
    total: number;
    AI_ACTIVE: number;
    HUMAN_ASSIGNED: number;
    RESOLVED: number;
  };
  mostUsedModel: {
    modelId: string | null;
    displayName: string | null;
    category: string | null;
    providerName: string | null;
    requestCount: number;
  } | null;
  errorRate: number;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Constants & badges
// ---------------------------------------------------------------------------

const ROUTING_MODES: Array<{ value: string; label: string; desc: string }> = [
  { value: "free_first", label: "Gratis Utama", desc: "Prioritas model gratis (Groq, Gemini, Ollama)" },
  { value: "cheapest_first", label: "Termurah", desc: "Harga input+output terendah" },
  { value: "performance_first", label: "Performa", desc: "Context window & output terbesar" },
  { value: "quality_first", label: "Kualitas", desc: "Model premium (GPT-4o, Claude Sonnet)" },
  { value: "manual", label: "Manual", desc: "Gunakan model per-fitur yang dikonfigurasi" },
];

const CATEGORY_META: Record<
  string,
  { label: string; className: string }
> = {
  free: { label: "Free", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  free_local: { label: "Free (Local)", className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
  paid: { label: "Paid", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  premium: { label: "Premium", className: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  reasoning: { label: "Reasoning", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  fast: { label: "Fast", className: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
  coding: { label: "Coding", className: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  multimodal: { label: "Multimodal", className: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
  custom: { label: "Custom", className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
};

const PROVIDER_TYPE_META: Record<
  string,
  { label: string; className: string }
> = {
  cloud: { label: "Cloud", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  local: { label: "Local", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  coding_agent: { label: "Coding Agent", className: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
};

const RECOMMEND_USE_LABEL: Record<string, string> = {
  chatbot: "Chatbot",
  agent: "Agent",
  reasoning: "Penalaran",
  coding: "Coding",
  fast_reply: "Balas Cepat",
};

function categoryMeta(c: string) {
  return (
    CATEGORY_META[c] ?? {
      label: c || "Lainnya",
      className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
    }
  );
}

function providerTypeMeta(t: string) {
  return (
    PROVIDER_TYPE_META[t] ?? {
      label: t || "Lainnya",
      className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
    }
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AICenterView() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Management Center"
        description="Multi-provider AI engine, chatbot, agent, dan knowledge base"
      />

      <Tabs defaultValue="overview">
        <TabsList className="w-fit flex-wrap h-auto">
          <TabsTrigger value="overview" className="gap-1.5">
            <GaugeCircle className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="providers" className="gap-1.5">
            <ServerCog className="h-3.5 w-3.5" />
            Providers
          </TabsTrigger>
          <TabsTrigger value="models" className="gap-1.5">
            <Brain className="h-3.5 w-3.5" />
            Models
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />
            Configuration
          </TabsTrigger>
          <TabsTrigger value="livechat" className="gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            Live Chat
          </TabsTrigger>
          <TabsTrigger value="agent" className="gap-1.5">
            <Bot className="h-3.5 w-3.5" />
            AI Agent
          </TabsTrigger>
          <TabsTrigger value="kb" className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            Knowledge Base
          </TabsTrigger>
          <TabsTrigger value="telegram" className="gap-1.5">
            <Send className="h-3.5 w-3.5" />
            Telegram
          </TabsTrigger>
          <TabsTrigger value="prompts" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Prompts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="providers">
          <ProvidersTab />
        </TabsContent>
        <TabsContent value="models">
          <ModelsTab />
        </TabsContent>
        <TabsContent value="config">
          <ConfigTab />
        </TabsContent>
        <TabsContent value="livechat">
          <AdminLiveChat />
        </TabsContent>
        <TabsContent value="agent">
          <AIAgentView />
        </TabsContent>
        <TabsContent value="telegram">
          <TelegramIntegrationView />
        </TabsContent>
        <TabsContent value="kb">
          <KnowledgeBaseView />
        </TabsContent>
        <TabsContent value="prompts">
          <PromptManagementView />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

function OverviewTab() {
  const { data, isLoading, isError, error } = useQuery<AIOverview>({
    queryKey: ["ai-overview"],
    queryFn: () => apiFetch("/api/ai/overview"),
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (isError) {
    return (
      <Card className="p-6">
        <EmptyState icon={AlertTriangle} title="Gagal memuat data" description={error?.message || "Terjadi kesalahan saat memuat overview AI Center."} />
      </Card>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 rounded-xl lg:col-span-2" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  const todayCost = data.todayUsage.totalCostUsd;
  const monthCost = data.monthUsage.totalCostUsd;
  const errPct = (data.errorRate ?? 0) * 100;
  const mostUsed = data.mostUsedModel;
  const cfg = data.config;
  const routingLabel =
    ROUTING_MODES.find((r) => r.value === cfg.routingMode)?.label ?? cfg.routingMode;

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Provider Aktif"
          value={formatNumber(data.providers.activeCount)}
          icon={ServerCog}
          accent="emerald"
          sublabel={`${data.models.total} model terdaftar`}
        />
        <StatCard
          title="Total Model"
          value={formatNumber(data.models.total)}
          icon={Brain}
          accent="cyan"
          sublabel={`${data.models.freeCount} model gratis`}
        />
        <StatCard
          title="Biaya Hari Ini"
          value={formatCurrency(todayCost, "USD")}
          icon={Wallet}
          accent="amber"
          sublabel={`Bulan ini: ${formatCurrency(monthCost, "USD")}`}
        />
        <StatCard
          title="Request Hari Ini"
          value={formatNumber(data.todayUsage.totalRequests)}
          icon={Activity}
          accent="rose"
          trend={errPct > 5 ? `${errPct.toFixed(1)}% error` : "Stabil"}
          trendUp={false}
          sublabel={`${formatNumber(data.todayUsage.totalTokens)} token`}
        />
      </div>

      {/* Provider status + usage placeholder */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-6 gap-4 lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Plug className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-foreground">
                Status Provider
              </h2>
            </div>
            <Badge variant="outline" className="bg-muted text-muted-foreground">
              {data.providers.activeCount} aktif
            </Badge>
          </div>
          {data.providers.items.length === 0 ? (
            <EmptyState
              icon={CloudOff}
              title="Belum ada provider aktif"
              description="Aktifkan provider di tab Providers untuk mulai menggunakan AI Center."
            />
          ) : (
            <ul className="space-y-2">
              {data.providers.items.map((p) => {
                const tm = providerTypeMeta(p.type);
                return (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border",
                          tm.className
                        )}
                      >
                        {p.type === "local" ? (
                          <Cpu className="h-4 w-4" />
                        ) : (
                          <Cloud className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {p.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {p.baseUrl}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className={cn(tm.className)}>
                        {tm.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {p.lastConnectedAt ? timeAgo(p.lastConnectedAt) : "Belum terhubung"}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="p-6 gap-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-foreground">
              Penggunaan 7 Hari
            </h2>
          </div>
          {/* Lightweight chart placeholder — bar visualization */}
          <div className="flex items-end justify-between gap-1.5 h-32 pt-2">
            {Array.from({ length: 7 }).map((_, i) => {
              const seed = (i * 31 + (data.todayUsage.totalRequests % 13)) % 100;
              const h = 25 + (seed % 70);
              return (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-gradient-to-t from-cyan-500/40 to-cyan-400/80"
                  style={{ height: `${h}%` }}
                />
              );
            })}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>7 hari lalu</span>
            <span>Hari ini</span>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-border/60 pt-3 text-xs">
            <div>
              <p className="text-muted-foreground">Token hari ini</p>
              <p className="font-semibold text-foreground">
                {formatNumber(data.todayUsage.totalTokens)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Token bulan ini</p>
              <p className="font-semibold text-foreground">
                {formatNumber(data.monthUsage.totalTokens)}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Config summary + conversations */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-6 gap-4 lg:col-span-2">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-violet-400" />
            <h2 className="text-sm font-semibold text-foreground">
              Ringkasan Konfigurasi
            </h2>
          </div>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 text-sm">
            <InfoRow label="Routing Mode" value={routingLabel} />
            <InfoRow
              label="Chatbot"
              value={cfg.chatbotEnabled ? "Aktif" : "Nonaktif"}
              accent={cfg.chatbotEnabled ? "emerald" : "zinc"}
            />
            <InfoRow
              label="AI Agent"
              value={cfg.agentEnabled ? "Aktif" : "Nonaktif"}
              accent={cfg.agentEnabled ? "emerald" : "zinc"}
            />
            <InfoRow
              label="Emergency Shutdown"
              value={cfg.emergencyShutdown ? "AKTIF" : "Nonaktif"}
              accent={cfg.emergencyShutdown ? "rose" : "emerald"}
            />
            <InfoRow
              label="Anggaran Harian"
              value={formatCurrency(cfg.dailyBudgetUsd, "USD")}
            />
            <InfoRow
              label="Anggaran Bulanan"
              value={formatCurrency(cfg.monthlyBudgetUsd, "USD")}
            />
            <InfoRow
              label="Biaya Maks / Request"
              value={formatCurrency(cfg.maxCostPerRequestUsd, "USD")}
            />
            <InfoRow
              label="Biaya Maks / User"
              value={formatCurrency(cfg.maxCostPerUserUsd, "USD")}
            />
          </div>
        </Card>

        <Card className="p-6 gap-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-foreground">
              Percakapan
            </h2>
          </div>
          <ul className="space-y-2.5">
            <ConversationRow
              label="Total Percakapan"
              value={data.conversations.total}
            />
            <ConversationRow
              label="Ditangani AI"
              value={data.conversations.AI_ACTIVE}
              color="emerald"
            />
            <ConversationRow
              label="Ditangan Admin"
              value={data.conversations.HUMAN_ASSIGNED}
              color="amber"
            />
            <ConversationRow
              label="Selesai"
              value={data.conversations.RESOLVED}
              color="zinc"
            />
          </ul>
          {mostUsed ? (
            <div className="mt-3 border-t border-border/60 pt-3">
              <p className="text-xs text-muted-foreground">Model Paling Sering Dipakai</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground">
                  {mostUsed.displayName ?? mostUsed.modelId ?? "Tidak diketahui"}
                </span>
                <span className="shrink-0 text-xs font-mono text-muted-foreground">
                  {formatNumber(mostUsed.requestCount)}×
                </span>
              </div>
              {mostUsed.providerName ? (
                <p className="text-xs text-muted-foreground">
                  via {mostUsed.providerName}
                </p>
              ) : null}
            </div>
          ) : null}
        </Card>
      </div>

      {/* Model category breakdown */}
      <Card className="p-6 gap-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-400" />
          <h2 className="text-sm font-semibold text-foreground">
            Distribusi Model per Kategori
          </h2>
        </div>
        {Object.keys(data.models.byCategory).length === 0 ? (
          <EmptyState icon={Brain} title="Belum ada model" />
        ) : (
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.models.byCategory)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, count]) => {
                const meta = categoryMeta(cat);
                return (
                  <Badge key={cat} variant="outline" className={cn(meta.className, "px-2.5 py-1")}>
                    {meta.label} · {count}
                  </Badge>
                );
              })}
          </div>
        )}
      </Card>
    </div>
  );
}

function InfoRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "emerald" | "rose" | "zinc" | "amber" | "cyan" | "blue";
}) {
  const accentClass = accent
    ? {
        emerald: "text-emerald-400",
        rose: "text-rose-400",
        zinc: "text-zinc-400",
        amber: "text-amber-400",
        cyan: "text-cyan-400",
        blue: "text-blue-400",
      }[accent]
    : "text-foreground";
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-medium", accentClass)}>{value}</span>
    </div>
  );
}

function ConversationRow({
  label,
  value,
  color = "zinc",
}: {
  label: string;
  value: number;
  color?: "emerald" | "amber" | "zinc" | "rose" | "blue";
}) {
  const dotClass = {
    emerald: "bg-emerald-400",
    amber: "bg-amber-400",
    zinc: "bg-zinc-400",
    rose: "bg-rose-400",
    blue: "bg-blue-400",
  }[color];
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />
        {label}
      </span>
      <span className="text-sm font-semibold text-foreground">
        {formatNumber(value)}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Providers tab
// ---------------------------------------------------------------------------

function ProvidersTab() {
  const qc = useQueryClient();
  const { data: providers, isLoading, isError: provError } = useQuery<AIProviderItem[]>({
    queryKey: ["ai-providers"],
    queryFn: () => apiFetch("/api/ai/providers"),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [configureFor, setConfigureFor] = React.useState<AIProviderItem | null>(null);
  const [showAdd, setShowAdd] = React.useState(false);
  const [testing, setTesting] = React.useState<string | null>(null);

  async function handleTestConnection(p: AIProviderItem) {
    setTesting(p.id);
    // Demo — wire to a real /api/ai/providers/[id]/test endpoint when available.
    setTimeout(() => {
      setTesting(null);
      if (p.isActive) {
        toast.success(`Koneksi ke ${p.name} berhasil (mock)`);
      } else {
        toast.error(`${p.name} belum diaktifkan`);
      }
    }, 700);
  }

  function handleSaved() {
    qc.invalidateQueries({ queryKey: ["ai-providers"] });
    qc.invalidateQueries({ queryKey: ["ai-overview"] });
    setConfigureFor(null);
    setShowAdd(false);
  }

  return (
    <div className="space-y-4">
      <Card className="p-0 gap-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Daftar Provider AI</h2>
            <p className="text-xs text-muted-foreground">
              Kelola kredensial, prioritas routing, dan status koneksi
            </p>
          </div>
          <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Tambah Provider
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : provError ? (
          <EmptyState
            icon={CloudOff}
            title="Gagal memuat provider"
            description="Terjadi kesalahan. Coba refresh halaman."
          />
        ) : !providers || providers.length === 0 ? (
          <EmptyState
            icon={CloudOff}
            title="Belum ada provider"
            description="Tambahkan provider AI (OpenAI, Anthropic, Gemini, Ollama, dll) untuk mulai."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Base URL</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>API Key</TableHead>
                <TableHead>Terakhir Terhubung</TableHead>
                <TableHead className="text-center">Model</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.map((p) => {
                const tm = providerTypeMeta(p.type);
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
                            tm.className
                          )}
                        >
                          {p.type === "local" ? (
                            <Cpu className="h-3.5 w-3.5" />
                          ) : (
                            <Cloud className="h-3.5 w-3.5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {p.name}
                          </p>
                          {p.lastError ? (
                            <p className="truncate text-xs text-rose-400 max-w-[180px]">
                              {p.lastError}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              priority {p.priority} · {p.authType}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn(tm.className)}>
                        {tm.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground max-w-[220px] truncate">
                      {p.baseUrl}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={p.isActive ? "ACTIVE" : "OFFLINE"}
                        label={p.isActive ? "Aktif" : "Nonaktif"}
                      />
                    </TableCell>
                    <TableCell>
                      {p.apiKeyPresent ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {p.apiKeyPrefix ?? "••••••••"}
                        </span>
                      ) : (
                        <span className="text-xs text-amber-400">Belum diset</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.lastConnectedAt ? formatDateTime(p.lastConnectedAt) : "-"}
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {p._count?.models ?? 0}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1.5"
                              onClick={() => handleTestConnection(p)}
                              disabled={testing === p.id}
                            >
                              {testing === p.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <TestTube2 className="h-3.5 w-3.5" />
                              )}
                              Test
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Tes koneksi ke provider</TooltipContent>
                        </Tooltip>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5"
                          onClick={() => setConfigureFor(p)}
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                          Configure
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <ProviderConfigureDialog
        provider={configureFor}
        open={Boolean(configureFor)}
        onOpenChange={(o) => !o && setConfigureFor(null)}
        onSaved={handleSaved}
      />

      <ProviderConfigureDialog
        provider={null}
        open={showAdd}
        onOpenChange={(o) => !o && setShowAdd(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider configure dialog
// ---------------------------------------------------------------------------

interface ProviderFormState {
  name: string;
  type: string;
  baseUrl: string;
  authType: string;
  apiKey: string;
  orgId: string;
  apiVersion: string;
  timeout: number;
  retryCount: number;
  rateLimitPerMin: number;
  priority: number;
  isActive: boolean;
  // Phase 14: default model config (saved as metadataJson on provider +
  // optionally auto-creates a default AIModel row via API).
  presetKey: string;          // selected preset key
  defaultModelId: string;     // e.g. "gpt-4o" — manual input OR chosen from fetched models
  contextWindow: number;      // tokens
  maxOutputTokens: number;    // tokens
  autoCreateModel: boolean;   // create AIModel row on provider save
}

// ---------------------------------------------------------------------------
// Provider presets — ketika user pilih dari dropdown, form auto-isi.
// Tambahkan preset baru di sini jika ada provider tambahan.
// ---------------------------------------------------------------------------
const PROVIDER_PRESETS: Array<{
  key: string;
  label: string;
  shortLabel: string;       // untuk display di trigger setelah dipilih
  description: string;
  type: string;             // "cloud" | "local" | "coding_agent"
  pricing: "free" | "freemium" | "paid" | "local";  // untuk grouping
  baseUrl: string;
  authType: string;         // "bearer" | "x-api-key" | "query" | "none"
  apiVersion: string;
  providerHint: string;     // diteruskan ke /api/ai/providers/fetch-models
  suggestedModelId: string;
  contextWindow: number;
  maxOutputTokens: number;
}> = [
  {
    key: "openai",
    label: "OpenAI",
    shortLabel: "OpenAI",
    description: "GPT-4o, GPT-4o-mini, o1, o3-mini",
    type: "cloud",
    pricing: "paid",
    baseUrl: "https://api.openai.com/v1",
    authType: "bearer",
    apiVersion: "",
    providerHint: "openai",
    suggestedModelId: "gpt-4o-mini",
    contextWindow: 128000,
    maxOutputTokens: 16384,
  },
  {
    key: "openrouter",
    label: "OpenRouter",
    shortLabel: "OpenRouter",
    description: "200+ model lewat satu API (Claude, GPT, Gemini, Llama)",
    type: "cloud",
    pricing: "freemium",
    baseUrl: "https://openrouter.ai/api/v1",
    authType: "bearer",
    apiVersion: "",
    providerHint: "openai-compatible",
    suggestedModelId: "openai/gpt-4o-mini",
    contextWindow: 128000,
    maxOutputTokens: 16384,
  },
  {
    key: "anthropic",
    label: "Anthropic Claude",
    shortLabel: "Anthropic",
    description: "Claude Sonnet 4, Opus 4, Haiku",
    type: "cloud",
    pricing: "paid",
    baseUrl: "https://api.anthropic.com/v1",
    authType: "x-api-key",
    apiVersion: "2023-06-01",
    providerHint: "anthropic",
    suggestedModelId: "claude-sonnet-4-20250514",
    contextWindow: 200000,
    maxOutputTokens: 8192,
  },
  {
    key: "gemini",
    label: "Google Gemini",
    shortLabel: "Gemini",
    description: "Gemini 2.0 Flash, 1.5 Pro (ada free tier)",
    type: "cloud",
    pricing: "freemium",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    authType: "query",
    apiVersion: "",
    providerHint: "gemini",
    suggestedModelId: "gemini-2.0-flash",
    contextWindow: 1048576,
    maxOutputTokens: 8192,
  },
  {
    key: "groq",
    label: "Groq",
    shortLabel: "Groq",
    description: "Llama 3.3 70B, Mixtral — cepat (LPU)",
    type: "cloud",
    pricing: "free",
    baseUrl: "https://api.groq.com/openai/v1",
    authType: "bearer",
    apiVersion: "",
    providerHint: "openai-compatible",
    suggestedModelId: "llama-3.3-70b-versatile",
    contextWindow: 131072,
    maxOutputTokens: 32768,
  },
  {
    key: "deepseek",
    label: "DeepSeek",
    shortLabel: "DeepSeek",
    description: "DeepSeek V3, R1 — murah",
    type: "cloud",
    pricing: "paid",
    baseUrl: "https://api.deepseek.com/v1",
    authType: "bearer",
    apiVersion: "",
    providerHint: "openai-compatible",
    suggestedModelId: "deepseek-chat",
    contextWindow: 65536,
    maxOutputTokens: 8192,
  },
  {
    key: "mistral",
    label: "Mistral AI",
    shortLabel: "Mistral",
    description: "Mistral Large, Codestral, Pixtral",
    type: "cloud",
    pricing: "paid",
    baseUrl: "https://api.mistral.ai/v1",
    authType: "bearer",
    apiVersion: "",
    providerHint: "openai-compatible",
    suggestedModelId: "mistral-large-latest",
    contextWindow: 131072,
    maxOutputTokens: 8192,
  },
  {
    key: "ollama",
    label: "Ollama",
    shortLabel: "Ollama",
    description: "Local LLM — Llama 3.2, Phi-3, Qwen (gratis)",
    type: "local",
    pricing: "local",
    baseUrl: "http://localhost:11434",
    authType: "none",
    apiVersion: "",
    providerHint: "ollama",
    suggestedModelId: "llama3.2",
    contextWindow: 8192,
    maxOutputTokens: 2048,
  },
  {
    key: "vllm",
    label: "vLLM",
    shortLabel: "vLLM",
    description: "Local OpenAI-compatible untuk HuggingFace",
    type: "local",
    pricing: "local",
    baseUrl: "http://localhost:8000/v1",
    authType: "bearer",
    apiVersion: "",
    providerHint: "openai-compatible",
    suggestedModelId: "",
    contextWindow: 8192,
    maxOutputTokens: 2048,
  },
  {
    key: "lmstudio",
    label: "LM Studio",
    shortLabel: "LM Studio",
    description: "Local OpenAI-compatible dari LM Studio app",
    type: "local",
    pricing: "local",
    baseUrl: "http://localhost:1234/v1",
    authType: "bearer",
    apiVersion: "",
    providerHint: "openai-compatible",
    suggestedModelId: "",
    contextWindow: 8192,
    maxOutputTokens: 2048,
  },
  {
    key: "openai-compatible",
    label: "OpenAI-Compatible (Custom)",
    shortLabel: "OpenAI-Compatible",
    description: "Provider custom yang implement OpenAI API",
    type: "cloud",
    pricing: "freemium",
    baseUrl: "",
    authType: "bearer",
    apiVersion: "",
    providerHint: "openai-compatible",
    suggestedModelId: "",
    contextWindow: 4096,
    maxOutputTokens: 2048,
  },
  {
    key: "custom",
    label: "Custom (Manual)",
    shortLabel: "Custom",
    description: "Semua field diisi manual",
    type: "cloud",
    pricing: "paid",
    baseUrl: "",
    authType: "bearer",
    apiVersion: "",
    providerHint: "",
    suggestedModelId: "",
    contextWindow: 4096,
    maxOutputTokens: 2048,
  },
];

function applyPreset(key: string): Partial<ProviderFormState> {
  const p = PROVIDER_PRESETS.find((x) => x.key === key);
  if (!p) return {};
  return {
    name: p.label,
    type: p.type,
    baseUrl: p.baseUrl,
    authType: p.authType,
    apiVersion: p.apiVersion,
    defaultModelId: p.suggestedModelId,
    contextWindow: p.contextWindow,
    maxOutputTokens: p.maxOutputTokens,
    presetKey: p.key,
  };
}

// Get short label for display in trigger after selection
function getPresetShortLabel(key: string): string {
  const p = PROVIDER_PRESETS.find((x) => x.key === key);
  return p?.shortLabel || "";
}

// Pricing badge config — color-coded for visual distinction
function pricingBadge(pricing: string): { label: string; className: string } {
  switch (pricing) {
    case "free":
      return { label: "GRATIS", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" };
    case "freemium":
      return { label: "FREEMIUM", className: "bg-sky-500/15 text-sky-300 border-sky-500/30" };
    case "paid":
      return { label: "BERBAYAR", className: "bg-amber-500/15 text-amber-300 border-amber-500/30" };
    case "local":
      return { label: "LOCAL", className: "bg-violet-500/15 text-violet-300 border-violet-500/30" };
    default:
      return { label: "", className: "" };
  }
}

// Provider logo placeholder — first 1-2 letters in a colored square
function providerLogo(label: string): string {
  const words = label.split(" ").filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Preset dropdown item — rapih dengan logo, nama, badge pricing, dan base URL
function PresetSelectItem({ preset }: { preset: typeof PROVIDER_PRESETS[number] }) {
  const badge = pricingBadge(preset.pricing);
  const logo = providerLogo(preset.shortLabel || preset.label);
  // Parse host safely — fallback to display placeholder if URL invalid
  let host = "";
  if (preset.baseUrl) {
    try { host = new URL(preset.baseUrl).host; } catch { host = preset.baseUrl; }
  }
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      value={preset.key}
      textValue={preset.shortLabel || preset.label}
      className="min-h-[80px] relative flex w-full cursor-default items-center gap-2 rounded-sm py-3 pl-2 pr-8 text-sm select-none outline-none focus:bg-accent/60 data-[highlighted]:bg-accent/60 data-[state=checked]:bg-accent/40"
    >
      {/* ItemText — string only, ini yang akan muncul di SelectValue trigger.
          sr-only agar tidak terlihat di dropdown item (visual content ada di sibling). */}
      <SelectPrimitive.ItemText className="sr-only">
        {preset.shortLabel || preset.label}
      </SelectPrimitive.ItemText>

      {/* ItemIndicator — checkmark di kanan */}
      <span className="absolute right-2 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>

      {/* Visual content untuk display di dropdown item */}
      <div className="flex w-full items-center gap-3 text-left">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-[11px] font-bold uppercase leading-[11px] text-foreground">
          {logo}
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-left text-[13px] font-medium leading-[18px] text-foreground">
              {preset.label}
            </span>
            <Badge
              variant="outline"
              className={`shrink-0 whitespace-nowrap px-1.5 py-0 text-[9px] font-semibold leading-[12px] ${badge.className}`}
            >
              {badge.label}
            </Badge>
          </div>
          <span className="block w-full truncate text-left text-[11px] leading-[15px] text-muted-foreground">
            {preset.description}
          </span>
          {host && (
            <span className="block w-full truncate text-left font-mono text-[10px] leading-[14px] text-muted-foreground/60">
              {host}
            </span>
          )}
        </div>
      </div>
    </SelectPrimitive.Item>
  );
}

function ProviderConfigureDialog({
  provider,
  open,
  onOpenChange,
  onSaved,
}: {
  provider: AIProviderItem | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(provider);
  const [form, setForm] = React.useState<ProviderFormState>(defaultForm());
  const [saving, setSaving] = React.useState(false);
  // Phase 14: dynamic model fetch state
  const [fetchedModels, setFetchedModels] = React.useState<Array<{ id: string; displayName?: string; contextWindow?: number }>>([]);
  const [fetchingModels, setFetchingModels] = React.useState(false);
  const [showModelDropdown, setShowModelDropdown] = React.useState(false);
  const [advancedOpen, setAdvancedOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (provider) {
      // Parse existing metadataJson for default model config
      let parsedCtx = 4096;
      let parsedMax = 2048;
      let parsedModelId = "";
      if (provider.metadataJson) {
        try {
          const meta = JSON.parse(provider.metadataJson);
          parsedCtx = Number(meta.defaultModelConfig?.contextWindow) || 4096;
          parsedMax = Number(meta.defaultModelConfig?.maxOutputTokens) || 2048;
          parsedModelId = String(meta.defaultModelConfig?.modelId || "");
        } catch {}
      }
      setForm({
        name: provider.name,
        type: provider.type,
        baseUrl: provider.baseUrl,
        authType: provider.authType,
        apiKey: "",
        orgId: provider.orgId ?? "",
        apiVersion: provider.apiVersion ?? "",
        timeout: provider.timeout,
        retryCount: provider.retryCount,
        rateLimitPerMin: provider.rateLimitPerMin,
        priority: provider.priority,
        isActive: provider.isActive,
        presetKey: "",
        defaultModelId: parsedModelId,
        contextWindow: parsedCtx,
        maxOutputTokens: parsedMax,
        autoCreateModel: false,
      });
    } else {
      setForm(defaultForm());
    }
  }, [open, provider]);

  function update<K extends keyof ProviderFormState>(key: K, value: ProviderFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Phase 14: apply preset to form when user selects from dropdown
  function handlePresetChange(key: string) {
    if (!key) {
      update("presetKey", "");
      return;
    }
    const patch = applyPreset(key);
    setForm((prev) => ({ ...prev, ...patch }));
    // Reset fetched models when preset changes
    setFetchedModels([]);
    setShowModelDropdown(false);
  }

  // Phase 14: fetch models dynamically from the provider's /models endpoint
  async function handleFetchModels() {
    if (!form.baseUrl.trim()) {
      toast.error("Base URL wajib diisi sebelum fetch models");
      return;
    }
    if (form.authType !== "none" && !form.apiKey.trim() && !form.presetKey.includes("ollama")) {
      toast.error("API Key wajib diisi sebelum fetch models (atau pilih Ollama preset)");
      return;
    }
    const preset = PROVIDER_PRESETS.find((p) => p.key === form.presetKey);
    setFetchingModels(true);
    try {
      const resp = await fetch("/api/ai/providers/fetch-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          baseUrl: form.baseUrl.trim(),
          authType: form.authType,
          apiKey: form.apiKey.trim(),
          apiVersion: form.apiVersion.trim(),
          orgId: form.orgId.trim(),
          providerType: preset?.providerHint || "",
        }),
      });
      const json = await resp.json();
      if (!json.success) {
        throw new Error(json.error?.message || "Fetch failed");
      }
      const models = json.data?.models || [];
      if (models.length === 0) {
        toast.warning("Provider tidak mengembalikan model apapun");
      } else {
        toast.success(`${models.length} model ditemukan dari ${form.baseUrl}`);
        // If a fetched model has contextWindow, auto-fill the Advanced Settings
        const firstWithContext = models.find((m: any) => m.contextWindow);
        if (firstWithContext && !form.contextWindow) {
          update("contextWindow", firstWithContext.contextWindow);
        }
      }
      setFetchedModels(models);
      setShowModelDropdown(models.length > 0);
    } catch (e: any) {
      toast.error(e?.message || "Gagal fetch models");
      setFetchedModels([]);
    } finally {
      setFetchingModels(false);
    }
  }

  async function handleSave() {
    if (!form.name.trim() || !form.baseUrl.trim()) {
      toast.error("Nama dan Base URL wajib diisi");
      return;
    }
    setSaving(true);
    try {
      // Build metadataJson — store default model config + preset hint
      const metadata = {
        presetKey: form.presetKey || null,
        defaultModelConfig: {
          modelId: form.defaultModelId.trim() || null,
          contextWindow: Number(form.contextWindow) || 4096,
          maxOutputTokens: Number(form.maxOutputTokens) || 2048,
        },
      };

      const payload: any = {
        name: form.name.trim(),
        type: form.type,
        baseUrl: form.baseUrl.trim(),
        authType: form.authType,
        orgId: form.orgId.trim() || null,
        apiVersion: form.apiVersion.trim() || null,
        timeout: Number(form.timeout) || 30,
        retryCount: Number(form.retryCount) || 2,
        rateLimitPerMin: Number(form.rateLimitPerMin) || 60,
        priority: Number(form.priority) || 100,
        metadataJson: JSON.stringify(metadata),
      };
      if (form.apiKey.trim()) {
        payload.apiKey = form.apiKey.trim();
      }

      // If creating new provider + autoCreateModel + defaultModelId set,
      // ask the API to also create a default AIModel row
      if (!isEdit && form.autoCreateModel && form.defaultModelId.trim()) {
        const preset = PROVIDER_PRESETS.find((p) => p.key === form.presetKey);
        payload.defaultModel = {
          modelId: form.defaultModelId.trim(),
          displayName: form.defaultModelId.trim(),
          category: form.type === "local" ? "free_local" : "custom",
          contextWindow: Number(form.contextWindow) || 4096,
          maxOutputTokens: Number(form.maxOutputTokens) || 2048,
          isFree: form.type === "local",
          recommendedUse: "chatbot",
        };
      }

      if (isEdit && provider) {
        await apiFetch(`/api/ai/providers/${provider.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ...payload, isActive: form.isActive }),
        });
        toast.success(`Provider "${form.name}" diperbarui`);
      } else {
        await apiFetch("/api/ai/providers", {
          method: "POST",
          body: JSON.stringify({ ...payload, isActive: form.isActive }),
        });
        toast.success(`Provider "${form.name}" dibuat`);
      }
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Gagal menyimpan provider");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Konfigurasi ${provider?.name}` : "Tambah Provider AI"}
          </DialogTitle>
          <DialogDescription>
            Atur kredensial dan parameter koneksi. API Key disimpan terenkripsi
            dan tidak pernah dikirim kembali ke klien.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {/* Phase 14: PRESET DROPDOWN — pilih provider populer, auto-isi form */}
          {!isEdit && (
            <div className="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <Label htmlFor="prov-preset" className="flex items-center gap-1.5 text-emerald-300">
                <Sparkles className="h-3.5 w-3.5" />
                Pilih Provider (preset)
              </Label>
              <Select value={form.presetKey} onValueChange={handlePresetChange}>
                <SelectTrigger
                  id="prov-preset"
                  className="w-full h-10 text-sm leading-5 font-medium"
                >
                  <SelectValue placeholder="— Pilih provider atau isi manual —" />
                </SelectTrigger>
                <SelectContent
                  className="max-h-[80vh] min-h-[400px] w-[var(--radix-select-trigger-width)] min-w-[min(500px,calc(100vw-1.5rem))] max-w-[calc(100vw-1rem)] overflow-y-auto overflow-x-hidden p-1.5"
                  position="popper"
                  sideOffset={6}
                >
                  {/* Group: Cloud Berbayar — exclude "custom" (akan masuk group Custom) */}
                  <SelectGroup>
                    <SelectLabel className="text-[10px] font-semibold uppercase tracking-wider leading-[14px] text-amber-300/80 px-2 py-1.5 sticky top-0 bg-popover/95 backdrop-blur z-10">
                      Cloud — Berbayar
                    </SelectLabel>
                    {PROVIDER_PRESETS.filter((p) => p.pricing === "paid" && p.type === "cloud" && p.key !== "custom").map((p) => (
                      <PresetSelectItem key={p.key} preset={p} />
                    ))}
                  </SelectGroup>

                  <SelectSeparator />

                  {/* Group: Cloud Freemium */}
                  <SelectGroup>
                    <SelectLabel className="text-[10px] font-semibold uppercase tracking-wider leading-[14px] text-sky-300/80 px-2 py-1.5 sticky top-0 bg-popover/95 backdrop-blur z-10">
                      Cloud — Freemium (ada free tier)
                    </SelectLabel>
                    {PROVIDER_PRESETS.filter((p) => p.pricing === "freemium" && p.type === "cloud").map((p) => (
                      <PresetSelectItem key={p.key} preset={p} />
                    ))}
                  </SelectGroup>

                  <SelectSeparator />

                  {/* Group: Cloud Gratis */}
                  <SelectGroup>
                    <SelectLabel className="text-[10px] font-semibold uppercase tracking-wider leading-[14px] text-emerald-300/80 px-2 py-1.5 sticky top-0 bg-popover/95 backdrop-blur z-10">
                      Cloud — Gratis
                    </SelectLabel>
                    {PROVIDER_PRESETS.filter((p) => p.pricing === "free" && p.type === "cloud").map((p) => (
                      <PresetSelectItem key={p.key} preset={p} />
                    ))}
                  </SelectGroup>

                  <SelectSeparator />

                  {/* Group: Local */}
                  <SelectGroup>
                    <SelectLabel className="text-[10px] font-semibold uppercase tracking-wider leading-[14px] text-violet-300/80 px-2 py-1.5 sticky top-0 bg-popover/95 backdrop-blur z-10">
                      Local — Jalankan di server sendiri
                    </SelectLabel>
                    {PROVIDER_PRESETS.filter((p) => p.type === "local").map((p) => (
                      <PresetSelectItem key={p.key} preset={p} />
                    ))}
                  </SelectGroup>

                  <SelectSeparator />

                  {/* Group: Custom — HANYA "custom" (openai-compatible sudah muncul di Freemium) */}
                  <SelectGroup>
                    <SelectLabel className="text-[10px] font-semibold uppercase tracking-wider leading-[14px] text-muted-foreground/80 px-2 py-1.5 sticky top-0 bg-popover/95 backdrop-blur z-10">
                      Custom — Isi semua field manual
                    </SelectLabel>
                    {PROVIDER_PRESETS.filter((p) => p.key === "custom").map((p) => (
                      <PresetSelectItem key={p.key} preset={p} />
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {form.presetKey && (
                <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-200">
                  <span className="font-medium">Terpilih:</span>
                  <span className="font-semibold">{getPresetShortLabel(form.presetKey)}</span>
                  <span className="text-emerald-300/60">·</span>
                  <span className="text-emerald-300/70">
                    {PROVIDER_PRESETS.find((p) => p.key === form.presetKey)?.baseUrl || "(isi Base URL manual)"}
                  </span>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Pilih preset untuk auto-isi Base URL, Auth Type, Model ID, dan Context Window.
                Anda masih bisa edit semua field setelah memilih.
              </p>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="prov-name">Nama Provider</Label>
              <Input
                id="prov-name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="OpenAI"
                disabled={isEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prov-type">Tipe</Label>
              <Select
                value={form.type}
                onValueChange={(v) => update("type", v)}
              >
                <SelectTrigger id="prov-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cloud">Cloud</SelectItem>
                  <SelectItem value="local">Local</SelectItem>
                  <SelectItem value="coding_agent">Coding Agent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prov-baseurl">Base URL</Label>
            <Input
              id="prov-baseurl"
              value={form.baseUrl}
              onChange={(e) => update("baseUrl", e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="font-mono text-xs"
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="prov-auth">Auth Type</Label>
              <Select
                value={form.authType}
                onValueChange={(v) => update("authType", v)}
              >
                <SelectTrigger id="prov-auth" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bearer">Bearer Token</SelectItem>
                  <SelectItem value="x-api-key">x-api-key Header</SelectItem>
                  <SelectItem value="query">Query Parameter</SelectItem>
                  <SelectItem value="none">Tanpa Auth</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prov-apiversion">API Version (opsional)</Label>
              <Input
                id="prov-apiversion"
                value={form.apiVersion}
                onChange={(e) => update("apiVersion", e.target.value)}
                placeholder="2024-02-15"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prov-apikey">
              API Key{" "}
              {isEdit && provider?.apiKeyPresent ? (
                <span className="text-xs text-muted-foreground">
                  · saat ini: {provider.apiKeyPrefix} (kosongkan jika tidak ingin mengganti)
                </span>
              ) : null}
            </Label>
            <Input
              id="prov-apikey"
              type="password"
              value={form.apiKey}
              onChange={(e) => update("apiKey", e.target.value)}
              placeholder="sk-..."
              className="font-mono text-xs"
              autoComplete="off"
            />
          </div>

          {/* Phase 14: MODEL ID — fetch dinamis dari provider atau input manual */}
          <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="prov-modelid" className="flex items-center gap-1.5">
                <Bot className="h-3.5 w-3.5" />
                Model ID (default)
              </Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleFetchModels}
                disabled={fetchingModels || !form.baseUrl.trim()}
                className="h-7 gap-1.5 text-xs"
              >
                {fetchingModels ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Download className="h-3 w-3" />
                )}
                Fetch Models
              </Button>
            </div>

            {showModelDropdown && fetchedModels.length > 0 ? (
              <Select
                value={form.defaultModelId}
                onValueChange={(v) => {
                  update("defaultModelId", v);
                  // Auto-fill context window if the selected model has it
                  const m = fetchedModels.find((x) => x.id === v);
                  if (m?.contextWindow) update("contextWindow", m.contextWindow);
                }}
              >
                <SelectTrigger id="prov-modelid" className="w-full font-mono text-xs">
                  <SelectValue placeholder={`— Pilih dari ${fetchedModels.length} model —`} />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {fetchedModels.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="font-mono text-xs">
                      <div className="flex flex-col">
                        <span>{m.id}</span>
                        {m.displayName && m.displayName !== m.id && (
                          <span className="text-xs text-muted-foreground">{m.displayName}</span>
                        )}
                        {m.contextWindow && (
                          <span className="text-xs text-emerald-400">ctx: {m.contextWindow.toLocaleString()} tokens</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="prov-modelid"
                value={form.defaultModelId}
                onChange={(e) => update("defaultModelId", e.target.value)}
                placeholder="gpt-4o-mini / claude-sonnet-4-20250514 / llama3.2"
                className="font-mono text-xs"
              />
            )}

            {fetchedModels.length > 0 && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {fetchedModels.length} model ditemukan ·{" "}
                  <button
                    type="button"
                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                    className="text-emerald-400 underline-offset-2 hover:underline"
                  >
                    {showModelDropdown ? "Input manual" : "Pilih dari dropdown"}
                  </button>
                </p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Klik <strong>Fetch Models</strong> untuk mengambil daftar model dari provider secara
              dinamis (memanggil endpoint <code>/v1/models</code> atau <code>/api/tags</code>).
            </p>
          </div>

          {/* Phase 14: ADVANCED SETTINGS — collapsible */}
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="flex w-full items-center justify-between px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <span className="flex items-center gap-1.5">
                  <Settings2 className="h-3.5 w-3.5" />
                  Advanced Settings
                </span>
                {advancedOpen ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="prov-ctx" className="text-xs">
                    Context Window (tokens)
                  </Label>
                  <Input
                    id="prov-ctx"
                    type="number"
                    min={256}
                    value={form.contextWindow}
                    onChange={(e) => update("contextWindow", Number(e.target.value))}
                    placeholder="4096"
                    className="text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Maximum input tokens yang bisa diproses model (e.g. GPT-4o: 128000)
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prov-maxout" className="text-xs">
                    Maximum Output Tokens
                  </Label>
                  <Input
                    id="prov-maxout"
                    type="number"
                    min={64}
                    value={form.maxOutputTokens}
                    onChange={(e) => update("maxOutputTokens", Number(e.target.value))}
                    placeholder="2048"
                    className="text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Maximum tokens yang bisa dihasilkan per response
                  </p>
                </div>
              </div>

              {!isEdit && (
                <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                  <div>
                    <p className="text-xs font-medium">Auto-create Model row</p>
                    <p className="text-[10px] text-muted-foreground">
                      Buat entri AIModel otomatis dengan Model ID di atas saat provider disimpan
                    </p>
                  </div>
                  <Switch
                    checked={form.autoCreateModel}
                    onCheckedChange={(v) => update("autoCreateModel", v)}
                  />
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          <div className="space-y-1.5">
            <Label htmlFor="prov-orgid">Organization / Project ID (opsional)</Label>
            <Input
              id="prov-orgid"
              value={form.orgId}
              onChange={(e) => update("orgId", e.target.value)}
              placeholder="org-..."
              className="font-mono text-xs"
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="prov-timeout">Timeout (detik)</Label>
              <Input
                id="prov-timeout"
                type="number"
                min={1}
                value={form.timeout}
                onChange={(e) => update("timeout", Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prov-retry">Retry Count</Label>
              <Input
                id="prov-retry"
                type="number"
                min={0}
                value={form.retryCount}
                onChange={(e) => update("retryCount", Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prov-ratelimit">Rate Limit /mnt</Label>
              <Input
                id="prov-ratelimit"
                type="number"
                min={1}
                value={form.rateLimitPerMin}
                onChange={(e) => update("rateLimitPerMin", Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prov-priority">Priority</Label>
              <Input
                id="prov-priority"
                type="number"
                min={1}
                value={form.priority}
                onChange={(e) => update("priority", Number(e.target.value))}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Power className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">Aktifkan Provider</p>
                <p className="text-xs text-muted-foreground">
                  Provider aktif akan diikutsertakan dalam routing AI
                </p>
              </div>
            </div>
            <Switch
              checked={form.isActive}
              onCheckedChange={(v) => update("isActive", v)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function defaultForm(): ProviderFormState {
  return {
    name: "",
    type: "cloud",
    baseUrl: "",
    authType: "bearer",
    apiKey: "",
    orgId: "",
    apiVersion: "",
    timeout: 30,
    retryCount: 2,
    rateLimitPerMin: 60,
    priority: 100,
    isActive: false,
    presetKey: "",
    defaultModelId: "",
    contextWindow: 4096,
    maxOutputTokens: 2048,
    autoCreateModel: true,
  };
}

// ---------------------------------------------------------------------------
// Models tab
// ---------------------------------------------------------------------------

function ModelsTab() {
  const qc = useQueryClient();
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all");
  const [providerFilter, setProviderFilter] = React.useState<string>("all");
  const [editModel, setEditModel] = React.useState<AIModelItem | null>(null);
  const [deleteModel, setDeleteModel] = React.useState<AIModelItem | null>(null);

  const qs = React.useMemo(() => {
    const params = new URLSearchParams();
    if (categoryFilter !== "all") params.set("category", categoryFilter);
    if (providerFilter !== "all") params.set("providerId", providerFilter);
    const s = params.toString();
    return s ? `?${s}` : "";
  }, [categoryFilter, providerFilter]);

  const { data: providers } = useQuery<AIProviderItem[]>({
    queryKey: ["ai-providers"],
    queryFn: () => apiFetch("/api/ai/providers"),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const { data: models, isLoading, isError: modelsError } = useQuery<AIModelItem[]>({
    queryKey: ["ai-models", categoryFilter, providerFilter],
    queryFn: () => apiFetch(`/api/ai/models${qs}`),
    retry: false,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="space-y-4">
      <Card className="p-0 gap-0 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Daftar Model AI</h2>
            <p className="text-xs text-muted-foreground">
              Harga dalam USD per 1 juta token · context window dalam token
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger size="sm" className="w-[160px]">
                <SelectValue placeholder="Semua Kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Kategori</SelectItem>
                {Object.entries(CATEGORY_META).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger size="sm" className="w-[180px]">
                <SelectValue placeholder="Semua Provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Provider</SelectItem>
                {(providers ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : modelsError ? (
          <EmptyState
            icon={AlertTriangle}
            title="Gagal memuat model"
            description="Terjadi kesalahan. Coba refresh halaman."
          />
        ) : !models || models.length === 0 ? (
          <EmptyState
            icon={Brain}
            title="Belum ada model"
            description="Tambahkan model melalui provider atau ubah filter di atas."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead className="text-right">Context</TableHead>
                <TableHead className="text-right">Max Output</TableHead>
                <TableHead className="text-right">Harga /1M (in/out)</TableHead>
                <TableHead>Rekomendasi</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.map((m) => {
                const cm = categoryMeta(m.category);
                const ptm = providerTypeMeta(m.provider.type);
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">
                          {m.displayName}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {m.modelId}
                        </span>
                        {m.description ? (
                          <span className="text-xs text-muted-foreground max-w-[260px] truncate">
                            {m.description}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className={cn(ptm.className)}>
                          {m.provider.name}
                        </Badge>
                        {!m.provider.isActive ? (
                          <span className="text-xs text-amber-400">(nonaktif)</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn(cm.className)}>
                        {cm.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatNumber(m.contextWindow)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatNumber(m.maxOutputTokens)}
                    </TableCell>
                    <TableCell className="text-right">
                      {m.isFree ? (
                        <Badge
                          variant="outline"
                          className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        >
                          FREE
                        </Badge>
                      ) : (
                        <div className="flex flex-col items-end font-mono text-xs">
                          <span className="text-foreground">
                            {formatCurrencyRaw(m.inputPricePer1M, "USD")}
                          </span>
                          <span className="text-muted-foreground">
                            {formatCurrencyRaw(m.outputPricePer1M, "USD")}
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {m.recommendedUse ? (
                        <Badge
                          variant="outline"
                          className="bg-muted text-muted-foreground border-border/60"
                        >
                          {RECOMMEND_USE_LABEL[m.recommendedUse] ?? m.recommendedUse}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 px-2 text-xs"
                          onClick={() => setEditModel(m)}
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 px-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                          onClick={() => setDeleteModel(m)}
                        >
                          <Trash2 className="h-3 w-3" />
                          Hapus
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Edit Model Dialog */}
      <ModelEditDialog
        model={editModel}
        open={Boolean(editModel)}
        onOpenChange={(o) => !o && setEditModel(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["ai-models"] });
          qc.invalidateQueries({ queryKey: ["ai-overview"] });
          setEditModel(null);
        }}
      />

      {/* Delete Model Dialog */}
      <ModelDeleteDialog
        model={deleteModel}
        open={Boolean(deleteModel)}
        onOpenChange={(o) => !o && setDeleteModel(null)}
        onDeleted={() => {
          qc.invalidateQueries({ queryKey: ["ai-models"] });
          qc.invalidateQueries({ queryKey: ["ai-overview"] });
          setDeleteModel(null);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Model Edit Dialog
// ---------------------------------------------------------------------------

interface ModelEditFormState {
  displayName: string;
  description: string;
  category: string;
  contextWindow: number;
  maxOutputTokens: number;
  inputPricePer1M: number;
  outputPricePer1M: number;
  isFree: boolean;
  defaultTemp: number;
  defaultMaxTokens: number;
  rateLimitPerMin: number;
  recommendedUse: string;
  isActive: boolean;
}

function ModelEditDialog({
  model,
  open,
  onOpenChange,
  onSaved,
}: {
  model: AIModelItem | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [form, setForm] = React.useState<ModelEditFormState>({
    displayName: "", description: "", category: "custom",
    contextWindow: 4096, maxOutputTokens: 2048,
    inputPricePer1M: 0, outputPricePer1M: 0, isFree: false,
    defaultTemp: 0.7, defaultMaxTokens: 2048, rateLimitPerMin: 60,
    recommendedUse: "", isActive: true,
  });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open || !model) return;
    setForm({
      displayName: model.displayName || "",
      description: model.description || "",
      category: model.category || "custom",
      contextWindow: model.contextWindow || 4096,
      maxOutputTokens: model.maxOutputTokens || 2048,
      inputPricePer1M: model.inputPricePer1M || 0,
      outputPricePer1M: model.outputPricePer1M || 0,
      isFree: model.isFree || false,
      defaultTemp: (model as any).defaultTemp ?? 0.7,
      defaultMaxTokens: (model as any).defaultMaxTokens ?? 2048,
      rateLimitPerMin: (model as any).rateLimitPerMin ?? 60,
      recommendedUse: (model as any).recommendedUse || "",
      isActive: model.isActive ?? true,
    });
  }, [open, model]);

  function update<K extends keyof ModelEditFormState>(key: K, value: ModelEditFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!model) return;
    if (!form.displayName.trim()) {
      toast.error("Display Name wajib diisi");
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/ai/models/${model.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          displayName: form.displayName.trim(),
          description: form.description.trim() || null,
          category: form.category,
          contextWindow: Number(form.contextWindow),
          maxOutputTokens: Number(form.maxOutputTokens),
          inputPricePer1M: Number(form.inputPricePer1M),
          outputPricePer1M: Number(form.outputPricePer1M),
          isFree: form.isFree,
          defaultTemp: Number(form.defaultTemp),
          defaultMaxTokens: Number(form.defaultMaxTokens),
          rateLimitPerMin: Number(form.rateLimitPerMin),
          recommendedUse: form.recommendedUse.trim() || null,
          isActive: form.isActive,
        }),
      });
      toast.success(`Model "${form.displayName}" diperbarui`);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Gagal menyimpan model");
    } finally {
      setSaving(false);
    }
  }

  if (!model) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Model: {model.modelId}</DialogTitle>
          <DialogDescription>
            Provider: {model.provider.name} · Ubah konfigurasi model. Model ID dan Provider tidak dapat diubah.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="m-displayname">Display Name</Label>
            <Input id="m-displayname" value={form.displayName} onChange={(e) => update("displayName", e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="m-desc">Deskripsi (opsional)</Label>
            <Textarea id="m-desc" value={form.description} onChange={(e) => update("description", e.target.value)} rows={2} />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="m-cat">Kategori</Label>
              <Select value={form.category} onValueChange={(v) => update("category", v)}>
                <SelectTrigger id="m-cat" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_META).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-rec">Rekomendasi Penggunaan</Label>
              <Select value={form.recommendedUse || "none"} onValueChange={(v) => update("recommendedUse", v === "none" ? "" : v)}>
                <SelectTrigger id="m-rec" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Tidak ada —</SelectItem>
                  <SelectItem value="chatbot">Chatbot</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="reasoning">Reasoning</SelectItem>
                  <SelectItem value="coding">Coding</SelectItem>
                  <SelectItem value="fast_reply">Fast Reply</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="m-ctx">Context Window</Label>
              <Input id="m-ctx" type="number" value={form.contextWindow} onChange={(e) => update("contextWindow", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-maxout">Max Output Tokens</Label>
              <Input id="m-maxout" type="number" value={form.maxOutputTokens} onChange={(e) => update("maxOutputTokens", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-temp">Default Temp</Label>
              <Input id="m-temp" type="number" step="0.1" min="0" max="2" value={form.defaultTemp} onChange={(e) => update("defaultTemp", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-rl">Rate Limit /mnt</Label>
              <Input id="m-rl" type="number" value={form.rateLimitPerMin} onChange={(e) => update("rateLimitPerMin", Number(e.target.value))} />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="m-pin">Harga Input /1M (USD)</Label>
              <Input id="m-pin" type="number" step="0.01" min="0" value={form.inputPricePer1M} onChange={(e) => update("inputPricePer1M", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-pout">Harga Output /1M (USD)</Label>
              <Input id="m-pout" type="number" step="0.01" min="0" value={form.outputPricePer1M} onChange={(e) => update("outputPricePer1M", Number(e.target.value))} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Power className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">Model Aktif</p>
                <p className="text-xs text-muted-foreground">Model nonaktif tidak akan digunakan dalam routing AI</p>
              </div>
            </div>
            <Switch checked={form.isActive} onCheckedChange={(v) => update("isActive", v)} />
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
            <input type="checkbox" id="m-free" checked={form.isFree} onChange={(e) => update("isFree", e.target.checked)} className="h-4 w-4 rounded" />
            <Label htmlFor="m-free" className="text-sm cursor-pointer">Model Gratis (input/output price = 0)</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan Perubahan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Model Delete Dialog
// ---------------------------------------------------------------------------

function ModelDeleteDialog({
  model,
  open,
  onOpenChange,
  onDeleted,
}: {
  model: AIModelItem | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleDelete() {
    if (!model) return;
    setDeleting(true);
    setError(null);
    try {
      await apiFetch(`/api/ai/models/${model.id}`, { method: "DELETE" });
      toast.success(`Model "${model.displayName}" dihapus`);
      onDeleted();
    } catch (e: any) {
      const msg = e?.message || "Gagal menghapus model";
      setError(msg);
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  }

  if (!model) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus Model?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>Anda akan menghapus model:</p>
              <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">
                <p className="font-medium text-foreground">{model.displayName}</p>
                <p className="font-mono text-xs text-muted-foreground">{model.modelId}</p>
                <p className="text-xs text-muted-foreground">Provider: {model.provider.name}</p>
              </div>
              <p className="text-xs text-amber-400">
                ⚠️ Jika model ini sedang digunakan sebagai default/chatbot/agent model, penghapusan akan ditolak.
                Ubah konfigurasi AI terlebih dahulu sebelum menghapus.
              </p>
              {error && (
                <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                  {error}
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting}
            className="gap-1.5 bg-rose-600 hover:bg-rose-700 text-white"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Hapus Model
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Configuration tab
// ---------------------------------------------------------------------------

function ConfigTab() {
  const qc = useQueryClient();
  const { data: config, isLoading: cfgLoading, isError: cfgError } = useQuery<AIConfiguration>({
    queryKey: ["ai-config"],
    queryFn: () => apiFetch("/api/ai/config"),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const { data: models } = useQuery<AIModelItem[]>({
    queryKey: ["ai-models-all"],
    queryFn: () => apiFetch("/api/ai/models"),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const [form, setForm] = React.useState<AIConfiguration | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (config) setForm(config);
  }, [config]);

  const mutation = useMutation({
    mutationFn: async (payload: any) =>
      apiFetch("/api/ai/config", {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success("Konfigurasi AI disimpan");
      qc.invalidateQueries({ queryKey: ["ai-config"] });
      qc.invalidateQueries({ queryKey: ["ai-overview"] });
    },
    onError: (e: any) => {
      toast.error(e?.message || "Gagal menyimpan konfigurasi");
    },
  });

  if (cfgError) {
    return (
      <Card className="p-6">
        <EmptyState icon={AlertTriangle} title="Gagal memuat konfigurasi" description="Terjadi kesalahan. Coba refresh halaman atau periksa koneksi." />
      </Card>
    );
  }

  if (cfgLoading || !form) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  function update<K extends keyof AIConfiguration>(key: K, value: AIConfiguration[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function handleSave() {
    if (!form) return;
    setSaving(true);
    mutation.mutate(
      {
        routingMode: form.routingMode,
        chatbotEnabled: form.chatbotEnabled,
        agentEnabled: form.agentEnabled,
        streamingEnabled: form.streamingEnabled,
        emergencyShutdown: form.emergencyShutdown,
        redactPII: form.redactPII,
        redactCredentials: form.redactCredentials,
        dailyBudgetUsd: form.dailyBudgetUsd,
        monthlyBudgetUsd: form.monthlyBudgetUsd,
        maxCostPerRequestUsd: form.maxCostPerRequestUsd,
        maxCostPerUserUsd: form.maxCostPerUserUsd,
        defaultTemperature: form.defaultTemperature,
        defaultMaxTokens: form.defaultMaxTokens,
        defaultModelId: form.defaultModelId,
        chatbotModelId: form.chatbotModelId,
        agentModelId: form.agentModelId,
        reasoningModelId: form.reasoningModelId,
        codingModelId: form.codingModelId,
        fallbackModelId: form.fallbackModelId,
      },
      {
        onSettled: () => setSaving(false),
      }
    );
  }

  function handleReset() {
    if (config) setForm(config);
    toast.info("Perubahan dibatalkan");
  }

  const modelOptions = (models ?? []).filter((m) => m.isActive);

  return (
    <div className="space-y-4">
      {/* Emergency shutdown banner */}
      {form.emergencyShutdown ? (
        <div className="flex items-center gap-3 rounded-lg border border-rose-500/40 bg-rose-500/[0.06] px-4 py-3">
          <ShieldAlert className="h-5 w-5 text-rose-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-rose-400">
              Emergency Shutdown Aktif
            </p>
            <p className="text-xs text-muted-foreground">
              Semua permintaan AI ditolak sampai shutdown dinonaktifkan.
            </p>
          </div>
        </div>
      ) : null}

      <Card className="p-6 gap-4">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-violet-400" />
          <h2 className="text-sm font-semibold text-foreground">
            Routing & Mode Operasi
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cfg-routing">Routing Mode</Label>
            <Select
              value={form.routingMode}
              onValueChange={(v) => update("routingMode", v)}
            >
              <SelectTrigger id="cfg-routing" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROUTING_MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label} — {m.desc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Strategi pemilihan model saat request datang
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cfg-temp">Default Temperature</Label>
              <Input
                id="cfg-temp"
                type="number"
                step="0.1"
                min={0}
                max={2}
                value={form.defaultTemperature}
                onChange={(e) =>
                  update("defaultTemperature", Number(e.target.value))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-maxtok">Default Max Tokens</Label>
              <Input
                id="cfg-maxtok"
                type="number"
                min={1}
                value={form.defaultMaxTokens}
                onChange={(e) =>
                  update("defaultMaxTokens", Number(e.target.value))
                }
              />
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 gap-4">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-semibold text-foreground">
            Selektor Model per Fitur
          </h2>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Digunakan saat routing mode = Manual, atau sebagai preferensi eksplisit.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <ModelSelect
            label="Default Model"
            value={form.defaultModelId}
            models={modelOptions}
            onChange={(v) => update("defaultModelId", v)}
          />
          <ModelSelect
            label="Chatbot"
            value={form.chatbotModelId}
            models={modelOptions}
            onChange={(v) => update("chatbotModelId", v)}
          />
          <ModelSelect
            label="AI Agent"
            value={form.agentModelId}
            models={modelOptions}
            onChange={(v) => update("agentModelId", v)}
          />
          <ModelSelect
            label="Reasoning"
            value={form.reasoningModelId}
            models={modelOptions}
            onChange={(v) => update("reasoningModelId", v)}
          />
          <ModelSelect
            label="Coding"
            value={form.codingModelId}
            models={modelOptions}
            onChange={(v) => update("codingModelId", v)}
          />
          <ModelSelect
            label="Fallback"
            value={form.fallbackModelId}
            models={modelOptions}
            onChange={(v) => update("fallbackModelId", v)}
          />
        </div>
      </Card>

      <Card className="p-6 gap-4">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-amber-400" />
          <h2 className="text-sm font-semibold text-foreground">
            Kontrol Biaya
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="cfg-daily">Anggaran Harian (USD)</Label>
            <Input
              id="cfg-daily"
              type="number"
              step="0.1"
              min={0}
              value={form.dailyBudgetUsd}
              onChange={(e) =>
                update("dailyBudgetUsd", Number(e.target.value))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfg-monthly">Anggaran Bulanan (USD)</Label>
            <Input
              id="cfg-monthly"
              type="number"
              step="1"
              min={0}
              value={form.monthlyBudgetUsd}
              onChange={(e) =>
                update("monthlyBudgetUsd", Number(e.target.value))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfg-reqcost">Maks / Request (USD)</Label>
            <Input
              id="cfg-reqcost"
              type="number"
              step="0.01"
              min={0}
              value={form.maxCostPerRequestUsd}
              onChange={(e) =>
                update("maxCostPerRequestUsd", Number(e.target.value))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfg-usercost">Maks / User (USD)</Label>
            <Input
              id="cfg-usercost"
              type="number"
              step="0.1"
              min={0}
              value={form.maxCostPerUserUsd}
              onChange={(e) =>
                update("maxCostPerUserUsd", Number(e.target.value))
              }
            />
          </div>
        </div>
      </Card>

      <Card className="p-6 gap-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-foreground">
            Fitur & Keamanan
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <ToggleRow
            icon={Bot}
            label="Chatbot Aktif"
            description="Aktifkan chatbot customer portal & landing"
            checked={form.chatbotEnabled}
            onCheckedChange={(v) => update("chatbotEnabled", v)}
          />
          <ToggleRow
            icon={Zap}
            label="AI Agent Aktif"
            description="Aktifkan AI agent admin untuk automasi"
            checked={form.agentEnabled}
            onCheckedChange={(v) => update("agentEnabled", v)}
          />
          <ToggleRow
            icon={Activity}
            label="Streaming"
            description="Stream respons token demi token"
            checked={form.streamingEnabled}
            onCheckedChange={(v) => update("streamingEnabled", v)}
          />
          <ToggleRow
            icon={ShieldAlert}
            label="Emergency Shutdown"
            description="Hentikan semua permintaan AI segera"
            checked={form.emergencyShutdown}
            onCheckedChange={(v) => update("emergencyShutdown", v)}
            danger
          />
          <ToggleRow
            icon={ShieldCheck}
            label="Redact PII"
            description="Redact informasi pribadi sebelum dikirim ke provider"
            checked={form.redactPII}
            onCheckedChange={(v) => update("redactPII", v)}
          />
          <ToggleRow
            icon={ShieldCheck}
            label="Redact Credentials"
            description="Redact password, token, dan secret dari prompt"
            checked={form.redactCredentials}
            onCheckedChange={(v) => update("redactCredentials", v)}
          />
        </div>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={handleReset} disabled={saving}>
          Reset
        </Button>
        <Button onClick={handleSave} disabled={saving || mutation.isPending} className="gap-1.5">
          {saving || mutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Simpan Konfigurasi
        </Button>
      </div>
    </div>
  );
}

function ModelSelect({
  label,
  value,
  models,
  onChange,
}: {
  label: string;
  value: string | null;
  models: AIModelItem[];
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select
        value={value ?? "__none__"}
        onValueChange={(v) => onChange(v === "__none__" ? null : v)}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Pilih model" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— Tidak ditetapkan —</SelectItem>
          {models.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.displayName} · {m.provider.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  description,
  checked,
  onCheckedChange,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  danger?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5",
        danger && checked
          ? "border-rose-500/40 bg-rose-500/[0.06]"
          : "border-border/60 bg-muted/30"
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            danger && checked ? "text-rose-400" : "text-muted-foreground"
          )}
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground truncate">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Telegram Integration View
// ---------------------------------------------------------------------------

interface TelegramConfig {
  id: string;
  botName: string | null;
  botUsername: string | null;
  botTokenPrefix: string | null;
  hasToken: boolean;
  webhookUrl: string | null;
  webhookSecret: string | null;
  isActive: boolean;
  status: string;
  lastConnectedAt: string | null;
  lastError: string | null;
  lastActivity: string | null;
  defaultModelId: string | null;
  defaultKbId: string | null;
  allowedUserIds: string | null;
}

function TelegramIntegrationView() {
  const qc = useQueryClient();
  const [botToken, setBotToken] = React.useState("");
  const [webhookUrl, setWebhookUrl] = React.useState("");
  const [webhookSecret, setWebhookSecret] = React.useState("");
  const [allowedUsers, setAllowedUsers] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);

  const { data: config, isLoading } = useQuery<TelegramConfig>({
    queryKey: ["telegram-config"],
    queryFn: () => apiFetch("/api/telegram/config"),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const { data: models } = useQuery<AIModelItem[]>({
    queryKey: ["ai-models"],
    queryFn: () => apiFetch("/api/ai/models"),
    retry: false,
  });

  React.useEffect(() => {
    if (config) {
      setWebhookUrl(config.webhookUrl || "");
      setWebhookSecret(config.webhookSecret || "");
      // Parse allowedUserIds JSON
      if (config.allowedUserIds) {
        try {
          const ids = JSON.parse(config.allowedUserIds);
          setAllowedUsers(Array.isArray(ids) ? ids.join(", ") : "");
        } catch {
          setAllowedUsers("");
        }
      }
    }
  }, [config]);

  async function handleSave() {
    setSaving(true);
    try {
      const payload: any = {
        webhookUrl: webhookUrl.trim() || null,
        webhookSecret: webhookSecret.trim() || null,
        isActive: true,
      };
      if (botToken.trim()) {
        payload.botToken = botToken.trim();
      }
      // Parse allowed users
      const users = allowedUsers.split(",").map((u) => u.trim()).filter(Boolean);
      payload.allowedUserIds = users;

      await apiFetch("/api/telegram/config", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      toast.success("Konfigurasi Telegram disimpan");
      setBotToken(""); // Clear token field after save
      qc.invalidateQueries({ queryKey: ["telegram-config"] });
    } catch (e: any) {
      toast.error(e?.message || "Gagal menyimpan konfigurasi");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const res = await apiFetch("/api/telegram/test", { method: "POST" });
      toast.success(`Terhubung: @${res.botUsername} (${res.botName})`);
      qc.invalidateQueries({ queryKey: ["telegram-config"] });
    } catch (e: any) {
      toast.error(e?.message || "Gagal terhubung ke Telegram");
    } finally {
      setTesting(false);
    }
  }

  if (isLoading) {
    return (
      <Card className="p-6">
        <Skeleton className="h-12 w-full mb-4" />
        <Skeleton className="h-12 w-full mb-4" />
        <Skeleton className="h-12 w-full" />
      </Card>
    );
  }

  const isConnected = config?.status === "connected";

  return (
    <div className="space-y-4">
      <Card className="p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className={cn(
              "flex h-9 w-9 items-center justify-center rounded-md border",
              isConnected
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                : "bg-muted/40 border-border/60 text-muted-foreground"
            )}>
              <Send className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Telegram Bot Integration</h2>
              <p className="text-xs text-muted-foreground">
                {isConnected
                  ? `Terhubung sebagai @${config?.botUsername || "bot"}`
                  : "Belum terhubung — masukkan Bot Token dan test koneksi"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {config?.status && (
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px]",
                  isConnected
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    : config.status === "error"
                    ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                    : "bg-muted/40 text-muted-foreground border-border/60"
                )}
              >
                {config.status}
              </Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleTest}
              disabled={testing || !config?.hasToken}
              className="gap-1.5"
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
              Test Connection
            </Button>
          </div>
        </div>

        {/* Error display */}
        {config?.lastError && (
          <div className="border-b border-rose-500/20 bg-rose-500/5 px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs text-rose-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{config.lastError}</span>
            </div>
          </div>
        )}

        {/* Form */}
        <div className="space-y-4 p-4">
          {/* Bot Token */}
          <div className="space-y-1.5">
            <Label htmlFor="tg-token" className="flex items-center gap-1.5">
              Bot Token
              {config?.hasToken && (
                <span className="text-xs text-muted-foreground">
                  · saat ini: {config.botTokenPrefix} (kosongkan jika tidak ingin mengganti)
                </span>
              )}
            </Label>
            <Input
              id="tg-token"
              type="password"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="123456789:ABCdefGhIJKlmNoPQRstuVWxYz"
              className="font-mono text-xs"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Dapatkan token dari <span className="font-mono">@BotFather</span> di Telegram. Token disimpan terenkripsi (AES-256-GCM).
            </p>
          </div>

          {/* Bot info (if connected) */}
          {isConnected && config?.botName && (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                <Bot className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{config.botName}</p>
                <p className="text-xs text-muted-foreground">@{config.botUsername}</p>
              </div>
              {config.lastConnectedAt && (
                <p className="text-xs text-muted-foreground">
                  Terhubung: {formatDateTime(config.lastConnectedAt)}
                </p>
              )}
            </div>
          )}

          {/* Webhook URL */}
          <div className="space-y-1.5">
            <Label htmlFor="tg-webhook">Webhook URL (opsional)</Label>
            <Input
              id="tg-webhook"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://mvmp.example.com/api/telegram/webhook"
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              URL publik untuk menerima update dari Telegram. Kosongkan jika menggunakan polling.
            </p>
          </div>

          {/* Webhook Secret */}
          <div className="space-y-1.5">
            <Label htmlFor="tg-secret">Webhook Secret (opsional)</Label>
            <Input
              id="tg-secret"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder="random-secret-string"
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Token rahasia untuk validasi webhook (X-Telegram-Bot-Api-Secret-Token header).
            </p>
          </div>

          {/* Allowed Users */}
          <div className="space-y-1.5">
            <Label htmlFor="tg-users">Allowed User IDs (opsional)</Label>
            <Input
              id="tg-users"
              value={allowedUsers}
              onChange={(e) => setAllowedUsers(e.target.value)}
              placeholder="123456789, 987654321"
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Daftar Telegram User ID yang diizinkan menggunakan bot. Kosongkan untuk mengizinkan semua user.
              Pisahkan dengan koma.
            </p>
          </div>

          {/* Default Model */}
          <div className="space-y-1.5">
            <Label htmlFor="tg-model">Default Model untuk Telegram Chat</Label>
            <Select
              value={config?.defaultModelId || "none"}
              onValueChange={async (v) => {
                try {
                  await apiFetch("/api/telegram/config", {
                    method: "PATCH",
                    body: JSON.stringify({ defaultModelId: v === "none" ? null : v }),
                  });
                  qc.invalidateQueries({ queryKey: ["telegram-config"] });
                  toast.success("Default model diperbarui");
                } catch (e: any) {
                  toast.error(e?.message || "Gagal menyimpan");
                }
              }}
            >
              <SelectTrigger id="tg-model" className="w-full"><SelectValue placeholder="Pilih model" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Tidak ada —</SelectItem>
                {models?.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan Konfigurasi
          </Button>
        </div>
      </Card>
    </div>
  );
}
