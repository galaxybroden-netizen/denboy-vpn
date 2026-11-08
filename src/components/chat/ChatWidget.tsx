"use client";

// MVMP — Chat Widget (reusable, AI-ready)
// Floating button + expandable chat panel. Can be placed on any page.
// Currently uses mock responses — swap /api/chat with real AI chatbot later.

import * as React from "react";
import { Bot, MessageCircle, Send, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "bot";
  text: string;
  timestamp: number;
}

interface ChatWidgetProps {
  context?: "landing" | "customer" | "reseller";
  userName?: string;
}

const CONTEXT_CONFIG = {
  landing: {
    title: "MVMP Assistant",
    subtitle: "Tanya jawab seputar VPN & paket",
    quickReplies: ["Berapa harga paket?", "Server mana saja?", "Cara daftar?", "Metode pembayaran?"],
    greeting: "Halo! Saya asisten MVMP. Ada yang bisa saya bantu? Tanya tentang paket, server, atau cara daftar.",
  },
  customer: {
    title: "Support Pelanggan",
    subtitle: "Bantuan akun VPN & transaksi",
    quickReplies: ["Akun VPN tidak bisa connect", "Cara download config?", "Cara perpanjang paket?", "Status pembayaran?"],
    greeting: "Halo! Saya virtual assistant MVMP. Ada masalah dengan akun VPN atau transaksi? Ketik pertanyaan Anda.",
  },
  reseller: {
    title: "Reseller Support",
    subtitle: "Bantuan reseller & komisi",
    quickReplies: ["Cara buat akun pelanggan?", "Cek saldo & komisi", "Cara topup saldo", "Berapa komisi reseller?"],
    greeting: "Halo Reseller! Saya virtual assistant MVMP. Tanya seputar pembuatan akun, saldo, atau komisi.",
  },
};

const STORAGE_KEY = "MVMP_chat_history";

export function ChatWidget({ context = "landing", userName }: ChatWidgetProps) {
  const config = CONTEXT_CONFIG[context];
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [isTyping, setIsTyping] = React.useState(false);
  const [hasNewMessage, setHasNewMessage] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const initializedRef = React.useRef(false);

  React.useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY}_${context}`);
      if (stored) {
        const parsed = JSON.parse(stored) as ChatMessage[];
        if (parsed.length > 0 && parsed[parsed.length - 1].timestamp > Date.now() - 3600_000) {
          setMessages(parsed);
          return;
        }
      }
    } catch {}
    setMessages([{ id: crypto.randomUUID(), role: "bot", text: userName ? config.greeting.replace("Halo!", `Halo ${userName}!`) : config.greeting, timestamp: Date.now() }]);
  }, [context, userName, config.greeting]);

  React.useEffect(() => {
    if (messages.length > 0) { try { localStorage.setItem(`${STORAGE_KEY}_${context}`, JSON.stringify(messages)); } catch {} }
  }, [messages, context]);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isTyping]);

  React.useEffect(() => {
    if (!open && messages.length > 1 && messages[messages.length - 1].role === "bot") setHasNewMessage(true);
    if (open) setHasNewMessage(false);
  }, [open, messages]);

  async function sendMessage(text: string) {
    if (!text.trim()) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", text: text.trim(), timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text.trim(), context }) });
      const data = await res.json();
      const botText = data.success ? data.data.response : "Maaf, terjadi kesalahan. Coba lagi ya.";
      setTimeout(() => { setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "bot", text: botText, timestamp: Date.now() }]); setIsTyping(false); }, 600 + Math.random() * 800);
    } catch {
      setTimeout(() => { setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "bot", text: "Maaf, saya tidak bisa terhubung ke server. Coba lagi dalam beberapa saat.", timestamp: Date.now() }]); setIsTyping(false); }, 1000);
    }
  }

  return (
    <>
      {/* Floating button — only show when chat is CLOSED.
          When open, the panel's own header close button handles closing. */}
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} aria-label="Buka chat" className="fixed bottom-5 right-5 z-50 size-14 rounded-full shadow-lg shadow-emerald-500/20 flex items-center justify-center transition-all hover:scale-105 bg-emerald-500 hover:bg-emerald-600">
          <MessageCircle className="h-6 w-6 text-white" />
          {hasNewMessage ? <span className="absolute -top-1 -right-1 size-4 rounded-full bg-rose-500 border-2 border-[#0a0e1a]" /> : null}
        </button>
      ) : null}
      {open ? (
        <div className="fixed bottom-24 right-5 z-50 w-[calc(100vw-2.5rem)] sm:w-96 max-h-[70vh] flex flex-col rounded-2xl bg-[#111827] border border-white/10 shadow-2xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border-b border-white/10">
            <div className="relative">
              <div className="size-9 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center"><Bot className="h-4 w-4 text-emerald-400" /></div>
              <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-emerald-400 border-2 border-[#111827]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white flex items-center gap-1.5">{config.title}<Sparkles className="h-3 w-3 text-amber-400" /></p>
              <p className="text-[10px] text-white/40">{config.subtitle}</p>
            </div>
            <button onClick={() => setOpen(false)} className="size-7 rounded-lg text-white/40 hover:bg-white/10 hover:text-white flex items-center justify-center"><X className="h-4 w-4" /></button>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[200px] max-h-[400px]">
            {messages.map((msg) => (
              <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words", msg.role === "user" ? "bg-emerald-500 text-white rounded-br-sm" : "bg-white/5 text-white/80 border border-white/10 rounded-bl-sm")}>
                  {msg.text}
                  <span className="block text-[9px] mt-1 opacity-50">{new Date(msg.timestamp).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>
            ))}
            {isTyping ? (
              <div className="flex justify-start">
                <div className="bg-white/5 border border-white/10 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="size-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="size-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            ) : null}
          </div>
          {messages.length <= 2 && !isTyping ? (
            <div className="px-4 pb-2 flex flex-wrap gap-1.5">
              {config.quickReplies.map((qr) => (
                <button key={qr} onClick={() => sendMessage(qr)} className="px-2.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-white/60 hover:text-white transition-colors">{qr}</button>
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-2 px-3 py-3 border-t border-white/10 bg-white/[0.02]">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }} placeholder="Ketik pesan..." className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-emerald-500/50" />
            <button onClick={() => sendMessage(input)} disabled={!input.trim() || isTyping} className="size-9 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 flex items-center justify-center transition-colors shrink-0"><Send className="h-4 w-4 text-white" /></button>
          </div>
          <div className="px-4 py-1.5 bg-white/[0.01] border-t border-white/5"><p className="text-[9px] text-white/20 text-center">Powered by MVMP AI · Untuk bantuan manusia hubungi WhatsApp</p></div>
        </div>
      ) : null}
    </>
  );
}
