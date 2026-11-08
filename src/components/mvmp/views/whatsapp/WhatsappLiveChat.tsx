"use client";

// MVMP — WhatsApp Live Chat (WhatsApp Web clone)
// Left sidebar: conversation list (searchable, filter by status)
// Right panel: chat thread with bubbles, message input, quick replies
// Top bar: contact info, assignee, conversation status

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  MoreVertical,
  Paperclip,
  PhoneCall,
  Search,
  Send,
  Smile,
  Zap,
  Circle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState, apiFetch } from "../../lib";
import { cn } from "@/lib/utils";

interface Contact {
  id: string;
  phoneNumber: string;
  displayName: string;
  source: string;
  tags: string | null;
  lastSeenAt: string | null;
}

interface Conversation {
  id: string;
  contactId: string;
  status: string;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageDirection: string | null;
  assigneeId: string | null;
  contact: Contact;
  _count?: { messages: number };
}

interface Message {
  id: string;
  conversationId: string;
  direction: string;
  type: string;
  body: string;
  status: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
}

interface QuickReply {
  id: string;
  keyword: string;
  response: string;
  autoTrigger: boolean;
}

const STATUS_FILTERS = [
  { value: "all", label: "Semua" },
  { value: "OPEN", label: "Open" },
  { value: "PENDING", label: "Pending" },
  { value: "RESOLVED", label: "Resolved" },
];

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Kemarin";
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit" });
}

function initials(name: string): string {
  return name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("");
}

function avatarColor(phone: string): string {
  const colors = ["bg-emerald-500", "bg-cyan-500", "bg-amber-500", "bg-rose-500", "bg-blue-500", "bg-orange-500"];
  const hash = phone.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

export function WhatsappLiveChat() {
  const qc = useQueryClient();
  const [selectedConvId, setSelectedConvId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [messageInput, setMessageInput] = React.useState("");
  const [showQuickReplies, setShowQuickReplies] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);

  // Build query params
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (statusFilter !== "all") params.set("status", statusFilter);

  const { data: convData, isLoading: loadingConvs } = useQuery<{ items: Conversation[] }>({
    queryKey: ["wa-conversations", search, statusFilter],
    queryFn: () => apiFetch(`/api/whatsapp/conversations?${params.toString()}`),
    refetchInterval: 15000,
  });

  const conversations = convData?.items ?? [];

  // Fetch messages for selected conversation
  const { data: msgData, isLoading: loadingMsgs } = useQuery<{ items: Message[] }>({
    queryKey: ["wa-messages", selectedConvId],
    queryFn: () => apiFetch(`/api/whatsapp/conversations/${selectedConvId}/messages`),
    enabled: !!selectedConvId,
    refetchInterval: 5000,
  });

  const messages = msgData?.items ?? [];

  // Quick replies
  const { data: qrData } = useQuery<{ items: QuickReply[] }>({
    queryKey: ["wa-quick-replies"],
    queryFn: () => apiFetch("/api/whatsapp/quick-replies"),
  });
  const quickReplies = qrData?.items ?? [];

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: (body: string) =>
      apiFetch(`/api/whatsapp/conversations/${selectedConvId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body, type: "TEXT" }),
      }),
    onSuccess: () => {
      setMessageInput("");
      qc.invalidateQueries({ queryKey: ["wa-messages", selectedConvId] });
      qc.invalidateQueries({ queryKey: ["wa-conversations"] });
    },
    onError: (e: any) => toast.error(e?.message || "Gagal mengirim pesan"),
  });

  // Auto-scroll to bottom on new messages
  React.useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, selectedConvId]);

  const selectedConv = conversations.find((c) => c.id === selectedConvId);

  function handleSend() {
    const body = messageInput.trim();
    if (!body || !selectedConvId) return;
    sendMutation.mutate(body);
  }

  function handleQuickReply(qr: QuickReply) {
    setMessageInput(qr.response);
    setShowQuickReplies(false);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -mt-6 -mx-6 border-t border-border">
      {/* Two-pane layout: left = conversation list, right = chat */}
      <div className="flex flex-1 min-h-0">
        {/* Left pane — conversation list */}
        <aside className={cn(
          "w-full md:w-80 lg:w-96 border-r border-border bg-sidebar flex flex-col",
          selectedConvId && "hidden md:flex"
        )}>
          {/* Search + filter */}
          <div className="p-3 space-y-2 border-b border-border bg-sidebar-accent/30">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama / nomor..."
                className="pl-9 h-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Conversation list */}
          <ScrollArea className="flex-1">
            {loadingConvs ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-md" />
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <EmptyState
                icon={Send}
                title="Belum ada percakapan"
                description="Pesan masuk dari pelanggan akan muncul di sini."
              />
            ) : (
              <div className="divide-y divide-border">
                {conversations.map((c) => {
                  const isSelected = c.id === selectedConvId;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedConvId(c.id)}
                      className={cn(
                        "w-full text-left p-3 flex gap-3 transition-colors hover:bg-sidebar-accent/40",
                        isSelected && "bg-sidebar-accent/60"
                      )}
                    >
                      <Avatar className="size-12 rounded-full">
                        <AvatarFallback className={cn("text-white text-sm font-medium", avatarColor(c.contact.phoneNumber))}>
                          {initials(c.contact.displayName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-foreground truncate">
                            {c.contact.displayName}
                          </p>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {formatTime(c.lastMessageAt)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-muted-foreground truncate">
                            {c.lastMessageDirection === "OUT" && <span className="text-muted-foreground/70">↗ </span>}
                            {c.lastMessagePreview || "(Belum ada pesan)"}
                          </p>
                          {c.unreadCount > 0 ? (
                            <span className="bg-emerald-500 text-white text-[10px] font-semibold rounded-full px-1.5 py-0.5 min-w-[18px] text-center shrink-0">
                              {c.unreadCount}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </aside>

        {/* Right pane — chat thread */}
        <main className={cn(
          "flex-1 flex flex-col bg-background",
          !selectedConvId && "hidden md:flex"
        )}>
          {!selectedConv ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon={Send}
                title="Pilih percakapan"
                description="Pilih percakapan di sebelah kiri untuk mulai chat dengan pelanggan."
              />
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="px-4 py-2.5 border-b border-border flex items-center gap-3 bg-sidebar-accent/20">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden size-8"
                  onClick={() => setSelectedConvId(null)}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Avatar className="size-10">
                  <AvatarFallback className={cn("text-white text-xs font-medium", avatarColor(selectedConv.contact.phoneNumber))}>
                    {initials(selectedConv.contact.displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {selectedConv.contact.displayName}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {selectedConv.contact.phoneNumber}
                  </p>
                </div>
                <Badge variant="outline" className={cn(
                  "text-[10px]",
                  selectedConv.status === "OPEN" && "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
                  selectedConv.status === "PENDING" && "bg-amber-500/10 text-amber-400 border-amber-500/30",
                  selectedConv.status === "RESOLVED" && "bg-muted text-muted-foreground",
                )}>
                  {selectedConv.status}
                </Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>Tandai sebagai Resolved</DropdownMenuItem>
                    <DropdownMenuItem>Tugaskan ke operator</DropdownMenuItem>
                    <DropdownMenuItem className="text-rose-500">Tandai Spam</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 px-4 py-4">
                {loadingMsgs ? (
                  <div className="space-y-3 max-w-md">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className={cn("h-12 w-48 rounded-lg", i % 2 === 0 ? "" : "ml-auto")} />
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-xs text-muted-foreground mt-12">
                    Belum ada pesan. Mulai percakapan dengan mengirim pesan di bawah.
                  </div>
                ) : (
                  <div className="space-y-2 max-w-3xl mx-auto">
                    {messages.map((m) => {
                      const isOut = m.direction === "OUT";
                      return (
                        <div
                          key={m.id}
                          className={cn("flex", isOut ? "justify-end" : "justify-start")}
                        >
                          <div className={cn(
                            "max-w-[70%] rounded-lg px-3 py-2 text-sm shadow-sm",
                            isOut
                              ? "bg-emerald-500 text-white rounded-tr-none"
                              : "bg-muted text-foreground rounded-tl-none"
                          )}>
                            <p className="whitespace-pre-wrap break-words">{m.body}</p>
                            <div className={cn(
                              "flex items-center gap-1 mt-1 text-[10px]",
                              isOut ? "text-white/70" : "text-muted-foreground"
                            )}>
                              <span>{formatTime(m.createdAt)}</span>
                              {isOut ? (
                                m.status === "READ" ? <CheckCheck className="h-3 w-3" /> :
                                m.status === "DELIVERED" ? <CheckCheck className="h-3 w-3 opacity-70" /> :
                                m.status === "SENT" ? <Check className="h-3 w-3 opacity-70" /> :
                                m.status === "FAILED" ? <Clock className="h-3 w-3 text-rose-400" /> :
                                <Clock className="h-3 w-3 opacity-50" />
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              {/* Quick replies popover */}
              {showQuickReplies && quickReplies.length > 0 ? (
                <div className="px-4 pb-2">
                  <div className="rounded-lg border border-border bg-popover p-2 shadow-md max-w-2xl">
                    <p className="text-[10px] text-muted-foreground px-2 py-1">Quick Replies</p>
                    <div className="grid gap-1 sm:grid-cols-2">
                      {quickReplies.map((qr) => (
                        <button
                          key={qr.id}
                          onClick={() => handleQuickReply(qr)}
                          className="text-left rounded-md px-2 py-1.5 hover:bg-muted transition-colors"
                        >
                          <p className="text-xs font-mono text-emerald-400">{qr.keyword}</p>
                          <p className="text-xs text-muted-foreground truncate">{qr.response}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Message input */}
              <div className="px-4 py-3 border-t border-border flex items-end gap-2 bg-sidebar-accent/20">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0"
                  onClick={() => toast.info("Upload media — segera hadir")}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0"
                  onClick={() => toast.info("Emoji picker — segera hadir")}
                >
                  <Smile className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "size-9 shrink-0",
                    showQuickReplies && "bg-emerald-500/10 text-emerald-400"
                  )}
                  onClick={() => setShowQuickReplies((v) => !v)}
                  title="Quick replies"
                >
                  <Zap className="h-4 w-4" />
                </Button>
                <Input
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Ketik pesan..."
                  className="flex-1 resize-none"
                />
                <Button
                  onClick={handleSend}
                  disabled={!messageInput.trim() || sendMutation.isPending}
                  size="icon"
                  className="size-9 shrink-0 bg-emerald-500 hover:bg-emerald-600"
                >
                  {sendMutation.isPending ? <Clock className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
