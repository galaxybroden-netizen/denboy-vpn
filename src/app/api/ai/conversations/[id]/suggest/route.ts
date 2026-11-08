// MVMP — AI Suggested replies for admin (reply_assist feature)
// POST — body: optional { count } (default 3)
//   1. Fetch last 10 messages from conversation (createdAt desc → reverse for chronology)
//   2. Build context for AI: conversation metadata + recent messages
//   3. Call chatCompletion() with feature="reply_assist"
//   4. Parse response into 3 styles: short, professional, detailed
//      (split by newlines, "##" sections, or numbered markers)
//   5. Create ChatSuggestedReply records (replyIndex 0/1/2, status="pending")
//   6. Return the 3 suggestions
//
// Next.js 16: route params are Promise-wrapped — `{ params }: { params: Promise<{ id: string }> }`

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { chatCompletion } from "@/lib/ai-provider";

const STYLES = ["short", "professional", "detailed"] as const;

/**
 * Parse the AI response into up to 3 distinct reply styles.
 * Strategy (in order of preference):
 *   1. Split by section markers like "## short", "## professional", "## detailed"
 *   2. Split by numbered list "1)", "2)", "3)"
 *   3. Fall back to splitting by double-newline blocks
 * If fewer than 3 chunks are produced, the last one is reused / padded.
 */
function parseReplies(raw: string): string[] {
  const cleaned = (raw || "").trim();
  if (!cleaned) return ["", "", ""];

  // Strategy 1: section headers (## short / ### Short / [short])
  const sectionRegex = /(?:^|\n)\s*(?:#{1,6}\s*|\[\s*|\*\*)(short|professional|detailed|singkat|profesional|detail)[^\n]*\n?/i;
  if (sectionRegex.test(cleaned)) {
    // Split on the headers, capture text between them
    const parts = cleaned
      .split(/(?:^|\n)\s*(?:#{1,6}\s*|\[\s*|\*\*)(?:short|professional|detailed|singkat|profesional|detail)[^\n]*\n?/i)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length >= 1) {
      while (parts.length < 3) parts.push(parts[parts.length - 1] || "");
      return parts.slice(0, 3);
    }
  }

  // Strategy 2: numbered list "1)", "1.", "1-"
  const numbered = cleaned
    .split(/\n\s*(?:\d+[\)\.\-:]\s*)/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (numbered.length >= 3) {
    return numbered.slice(0, 3);
  }
  if (numbered.length === 2) {
    return [numbered[0], numbered[1], numbered[1]];
  }

  // Strategy 3: split by double newlines
  const blocks = cleaned
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (blocks.length >= 3) {
    return blocks.slice(0, 3);
  }
  if (blocks.length === 2) {
    return [blocks[0], blocks[1], blocks[1]];
  }
  if (blocks.length === 1) {
    // Single block — slice into thirds as a last resort
    const text = blocks[0];
    const third = Math.ceil(text.length / 3);
    return [
      text.slice(0, third).trim() || text,
      text.slice(third, third * 2).trim() || text,
      text.slice(third * 2).trim() || text,
    ];
  }

  // Last-resort fallback: replicate the cleaned text 3x
  return [cleaned, cleaned, cleaned];
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }
    if (!hasPermission(user.role as any, "ai.manage" as any)) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin meminta saran balasan AI" } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) || {};
    const count = Math.max(1, Math.min(3, Number(body.count) || 3));

    const conversation = await db.chatConversation.findUnique({ where: { id } });
    if (!conversation) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Percakapan tidak ditemukan" } },
        { status: 404 }
      );
    }

    // Fetch last 10 messages — newest first, then reverse for chronology
    const recent = await db.chatMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    const chronological = [...recent].reverse();

    // Build conversation context for the AI
    const transcript = chronological
      .map((m) => {
        const who =
          m.sender === "admin"
            ? "Admin"
            : m.sender === "bot"
              ? "AI"
              : m.sender === "system"
                ? "System"
                : (m.senderName || "Visitor");
        return `${who}: ${m.content}`;
      })
      .join("\n");

    const visitorLabel =
      conversation.visitorName ||
      conversation.visitorEmail ||
      conversation.userId ||
      "Anonymous visitor";

    const systemPrompt = [
      "Anda adalah asisten yang membantu admin MVMP menyusun balasan kepada pengunjung/pelanggan.",
      "Tugas: hasilkan TIGA variasi balasan admin dalam bahasa Indonesia yang sopan, akurat, dan ringkas.",
      "Format WAJIB — gunakan tiga bagian dengan header persis seperti ini:",
      "",
      "## short",
      "<balasan singkat, 1-2 kalimat>",
      "",
      "## professional",
      "<balasan profesional, 2-3 kalimat, nada formal>",
      "",
      "## detailed",
      "<balasan rinci, langkah-langkah atau penjelasan lengkap>",
      "",
      "Aturan:",
      "- Jangan menulis pembuka seperti 'Tentu', 'Baik' — langsung isi balasan.",
      "- Jangan ulang pertanyaan pengunjung.",
      "- Gunakan info dari konteks percakapan.",
      "- Jika tidak yakin, arahkan ke WhatsApp 0811-0000-002.",
    ].join("\n");

    const userPrompt = [
      `Konteks percakapan (channel=${conversation.channel}, visitor=${visitorLabel}):`,
      transcript || "(belum ada pesan — buat sapaan pembuka)",
      "",
      "Tolong susun 3 variasi balasan admin untuk pesan terakhir.",
    ].join("\n");

    // Call AI provider with reply_assist feature
    const result = await chatCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      feature: "reply_assist",
      userId: user.id,
      conversationId: id,
      temperature: 0.6,
      maxTokens: 800,
    });

    // Parse into 3 styles
    const [short, professional, detailed] = parseReplies(result.content);

    const stylesContent = [short, professional, detailed].slice(0, count);
    while (stylesContent.length < count) stylesContent.push(stylesContent[stylesContent.length - 1] || "");

    // Persist ChatSuggestedReply records
    const created = await db.$transaction(
      stylesContent.map((content, idx) =>
        db.chatSuggestedReply.create({
          data: {
            conversationId: id,
            replyIndex: idx,
            content,
            style: STYLES[idx] || "short",
            status: "pending",
            modelId: null, // model id tracked in AIUsage via chatCompletion
          },
        })
      )
    );

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role as any,
      action: "CHAT_SUGGEST_REPLY",
      resourceType: "ChatSuggestedReply",
      resourceId: id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        conversationId: id,
        count: created.length,
        aiStatus: result.status,
        model: result.model,
        provider: result.provider,
        costUsd: result.costUsd,
        latencyMs: result.latencyMs,
      },
    });

    return NextResponse.json({
      success: true,
      data: serialize({
        items: created,
        ai: {
          status: result.status,
          model: result.model,
          provider: result.provider,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costUsd: result.costUsd,
          latencyMs: result.latencyMs,
          isMock: result.status === "MOCK_FALLBACK",
        },
      }),
    });
  } catch (e: any) {
    console.error("AI suggest reply error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
