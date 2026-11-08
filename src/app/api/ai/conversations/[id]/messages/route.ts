// MVMP — AI Conversation messages (admin send)
// GET  — list messages for conversation (createdAt asc, take 200)
// POST — send a message as admin. Body: { content }
//        Creates ChatMessage with sender="admin", senderId=user.id,
//        senderName=user.name, idempotencyKey=crypto.randomUUID().
//        Updates conversation: messageCount+1, humanMessageCount+1,
//        lastMessageAt, lastMessagePreview, lastMessageDirection="OUT".
//        Audit: CHAT_ADMIN_REPLY.
//
// Next.js 16: route params are Promise-wrapped — `{ params }: { params: Promise<{ id: string }> }`

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";

// GET — list messages for a conversation
export async function GET(
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
    if (!hasPermission(user.role as any, "ai.view" as any)) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melihat pesan percakapan AI" } },
        { status: 403 }
      );
    }

    const { id } = await params;

    const conversation = await db.chatConversation.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!conversation) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Percakapan tidak ditemukan" } },
        { status: 404 }
      );
    }

    const messages = await db.chatMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "asc" },
      take: 200,
    });

    return NextResponse.json({ success: true, data: serialize({ items: messages }) });
  } catch (e: any) {
    console.error("AI conversation messages list error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

// POST — admin sends a message
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
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin mengirim pesan sebagai admin" } },
        { status: 403 }
      );
    }

    const { id } = await params;

    const conversation = await db.chatConversation.findUnique({ where: { id } });
    if (!conversation) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Percakapan tidak ditemukan" } },
        { status: 404 }
      );
    }

    const body = (await req.json()) || {};
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Field wajib: content" } },
        { status: 400 }
      );
    }

    const idempotencyKey = crypto.randomUUID();

    const message = await db.chatMessage.create({
      data: {
        conversationId: id,
        sender: "admin",
        senderId: user.id,
        senderName: user.name || user.email || "Admin",
        content,
        idempotencyKey,
        status: "sent",
      },
    });

    // Update conversation stats
    await db.chatConversation.update({
      where: { id },
      data: {
        messageCount: { increment: 1 },
        humanMessageCount: { increment: 1 },
        lastMessageAt: new Date(),
        lastMessagePreview: content.slice(0, 100),
        lastMessageDirection: "OUT",
      },
    });

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role as any,
      action: "CHAT_ADMIN_REPLY",
      resourceType: "ChatMessage",
      resourceId: message.id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        conversationId: id,
        messageId: message.id,
        contentLength: content.length,
        senderId: user.id,
      },
    });

    return NextResponse.json(
      { success: true, data: serialize(message) },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("AI admin reply send error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
