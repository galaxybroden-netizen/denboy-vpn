// MVMP — Chat API endpoint (AI provider-ready + conversation persistence)
// Uses src/lib/ai-provider.ts for multi-provider routing + cost tracking.
// Persists messages to ChatConversation + ChatMessage tables.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chatCompletion } from "@/lib/ai-provider";
import { getSessionUser } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";
import { checkRateLimit, getRateLimitKey, RATE_LIMITS, cleanupExpiredBuckets } from "@/lib/rate-limit";

interface ChatRequest {
  message: string;
  context: "landing" | "customer" | "reseller";
  history?: Array<{ role: string; text: string }>;
  conversationId?: string;
}

export async function POST(req: NextRequest) {
  try {
    // Rate limiting — prevent spam/abuse
    cleanupExpiredBuckets();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
    const user = await getSessionUser();
    const rateLimitKey = getRateLimitKey(user?.id, ip, "chat");
    const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMITS.chat);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: `Terlalu banyak pesan. Coba lagi dalam ${rateLimit.retryAfter} detik.` } },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } }
      );
    }

    const body: ChatRequest = await req.json();
    const { message, context = "landing", conversationId } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Message wajib diisi" } }, { status: 400 });
    }

    // user already fetched above for rate limiting

    // Load system prompt from DB
    const promptKey = `chatbot_${context}`;
    const prompt = await db.aIPrompt.findUnique({
      where: { key: promptKey },
      include: { versions: { where: { status: "published" }, orderBy: { version: "desc" }, take: 1 } },
    });
    const globalPrompt = await db.aIPrompt.findUnique({
      where: { key: "global_system" },
      include: { versions: { where: { status: "published" }, orderBy: { version: "desc" }, take: 1 } },
    });
    const systemContent = (globalPrompt?.versions?.[0]?.content || "") + "\n\n" + (prompt?.versions?.[0]?.content || "Anda adalah asisten MVMP.");

    // Check AI configuration
    const config = await db.aIConfiguration.findFirst();
    if (config?.emergencyShutdown) {
      return NextResponse.json({ success: true, data: { response: "Maaf, layanan AI sedang dinonaktifkan sementara. Hubungi WhatsApp 0811-0000-002.", mock: true, emergencyShutdown: true } });
    }
    if (config && !config.chatbotEnabled) {
      return NextResponse.json({ success: true, data: { response: "Chatbot AI sedang dinonaktifkan. Hubungi WhatsApp support 0811-0000-002.", mock: true, chatbotDisabled: true } });
    }

    // === CONVERSATION PERSISTENCE ===
    let conv = null;
    if (conversationId) {
      conv = await db.chatConversation.findUnique({ where: { id: conversationId } });
    }
    if (!conv) {
      // Create new conversation
      conv = await db.chatConversation.create({
        data: {
          channel: context,
          userId: user?.id || null,
          visitorName: user?.name || null,
          visitorEmail: user?.email || null,
          status: "AI_ACTIVE",
        },
      });
    }

    // Check conversation status — if HUMAN_ASSIGNED, AI should not auto-reply
    if (conv.status === "HUMAN_ASSIGNED" || conv.status === "AI_ASSIST" || conv.status === "WAITING_FOR_ADMIN") {
      // Still save user message, but don't generate AI response
      await db.chatMessage.create({
        data: {
          conversationId: conv.id,
          sender: "user",
          senderId: user?.id || null,
          senderName: user?.name || "Visitor",
          content: message,
          idempotencyKey: uuidv4(),
        },
      });
      await db.chatConversation.update({
        where: { id: conv.id },
        data: { messageCount: { increment: 1 }, lastMessageAt: new Date(), lastMessagePreview: message.slice(0, 100) },
      });
      return NextResponse.json({
        success: true,
        data: {
          response: "Pesan Anda diteruskan ke admin kami. Mohon tunggu, admin akan segera membalas.",
          conversationId: conv.id,
          status: conv.status,
          mock: true,
          humanTakeover: true,
        },
      });
    }

    // Save user message
    await db.chatMessage.create({
      data: {
        conversationId: conv.id,
        sender: "user",
        senderId: user?.id || null,
        senderName: user?.name || "Visitor",
        content: message,
        idempotencyKey: uuidv4(),
      },
    });

    // Build messages for AI
    const messages = [
      { role: "system" as const, content: systemContent },
      ...(body.history || []).map((h) => ({ role: h.role as any, content: h.text })),
      { role: "user" as const, content: message },
    ];

    // RAG: search knowledge base for relevant context
    const kbDocs = await db.aIKnowledgeDocument.findMany({
      where: { isActive: true },
      select: { title: true, content: true, category: true },
    });
    const relevantDocs = kbDocs.filter((d) => {
      const docLower = d.content.toLowerCase();
      const queryWords = message.toLowerCase().split(" ").filter((w) => w.length > 3);
      return queryWords.some((w) => docLower.includes(w));
    });
    if (relevantDocs.length > 0) {
      const kbContext = relevantDocs.slice(0, 3).map((d) => `[${d.title}]: ${d.content.slice(0, 300)}`).join("\n\n");
      messages.push({ role: "system", content: `Informasi relevan dari Knowledge Base:\n\n${kbContext}\n\nGunakan informasi ini untuk menjawab pertanyaan pelanggan.` });
    }

    // Call AI provider
    const feature = `chatbot_${context}` as "chatbot_landing" | "chatbot_customer" | "chatbot_reseller";
    const result = await chatCompletion({
      messages,
      feature,
      userId: user?.id,
      conversationId: conv.id,
    });

    // CRITICAL: Re-check conversation status BEFORE saving AI reply.
    // If admin took over while AI was generating, discard the AI response.
    const convNow = await db.chatConversation.findUnique({ where: { id: conv.id }, select: { status: true, assignedAdminId: true } });
    if (convNow && (convNow.status === "HUMAN_ASSIGNED" || convNow.status === "AI_ASSIST" || convNow.status === "WAITING_FOR_ADMIN")) {
      // Admin took over during AI processing — discard AI reply, log audit
      await db.chatAuditLog.create({
        data: {
          conversationId: conv.id,
          action: "ai_reply_discarded",
          fromStatus: "AI_ACTIVE",
          toStatus: convNow.status,
          actorType: "system",
          metadataJson: JSON.stringify({ reason: "admin_took_over_during_generation", model: result.model }),
        },
      });
      return NextResponse.json({
        success: true,
        data: {
          response: "Pesan Anda diteruskan ke admin kami. Mohon tunggu, admin akan segera membalas.",
          conversationId: conv.id,
          status: convNow.status,
          mock: true,
          humanTakeover: true,
        },
      });
    }

    // Save bot message — conversation is still AI_ACTIVE, safe to send
    await db.chatMessage.create({
      data: {
        conversationId: conv.id,
        sender: "bot",
        content: result.content,
        metadataJson: JSON.stringify({
          model: result.model,
          provider: result.provider,
          status: result.status,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          cost: result.costUsd,
          latencyMs: result.latencyMs,
        }),
        idempotencyKey: uuidv4(),
      },
    });

    // Update conversation stats
    await db.chatConversation.update({
      where: { id: conv.id },
      data: {
        messageCount: { increment: 2 },
        aiMessageCount: { increment: 1 },
        lastMessageAt: new Date(),
        lastMessagePreview: result.content.slice(0, 100),
        lastMessageDirection: "OUT",
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        response: result.content,
        conversationId: conv.id,
        context,
        model: result.model,
        provider: result.provider,
        status: result.status,
        isMock: result.status === "MOCK_FALLBACK",
        tokens: { input: result.inputTokens, output: result.outputTokens },
        cost: result.costUsd,
        latencyMs: result.latencyMs,
        timestamp: new Date().toISOString(),
        kbSources: relevantDocs.map((d) => d.title),
      },
    });
  } catch (e: any) {
    console.error("Chat API error:", e?.message);
    return NextResponse.json({ success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } }, { status: 500 });
  }
}
