// MVMP — WhatsApp Conversation Messages
// GET  — list messages (createdAt asc, max 200), then mark unreadCount = 0
// POST — send a message via sendWhatsappMessage using the conversation's contact phone
//
// Next.js 16: route params are Promise-wrapped — `{ params }: { params: Promise<{ id: string }> }`
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { sendWhatsappMessage, normalizePhone } from "@/lib/whatsapp";

// GET — list messages for a conversation
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
      { status: 401 }
    );
  if (!hasPermission(user.role as any, "settings.view"))
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin" } },
      { status: 403 }
    );

  try {
    const { id } = await params;

    const conversation = await db.whatsappConversation.findUnique({
      where: { id },
    });
    if (!conversation) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Conversation tidak ditemukan" } },
        { status: 404 }
      );
    }

    const messages = await db.whatsappMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "asc" },
      take: 200,
    });

    // Mark conversation as read (customer/staff viewed the chat)
    if (conversation.unreadCount > 0) {
      await db.whatsappConversation.update({
        where: { id },
        data: { unreadCount: 0 },
      });
    }

    return NextResponse.json({ success: true, data: serialize({ items: messages }) });
  } catch (e: any) {
    console.error("Whatsapp messages list error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

// POST — send a message in a conversation
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
      { status: 401 }
    );
  if (!hasPermission(user.role as any, "settings.manage"))
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin" } },
      { status: 403 }
    );

  try {
    const { id } = await params;

    const conversation = await db.whatsappConversation.findUnique({
      where: { id },
      include: { contact: true },
    });
    if (!conversation) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Conversation tidak ditemukan" } },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { body: messageBody, type, templateId, mediaUrl } = body || {};

    if (!messageBody || !String(messageBody).trim()) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Field wajib: body" } },
        { status: 400 }
      );
    }

    const phone = normalizePhone(conversation.contact.phoneNumber);
    if (!phone) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Nomor telepon contact tidak valid" } },
        { status: 400 }
      );
    }

    const result = await sendWhatsappMessage(phone, String(messageBody), {
      conversationId: id,
      type,
      templateId,
      mediaUrl,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: "SEND_FAILED", message: result.error || "Gagal mengirim pesan" } },
        { status: 400 }
      );
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role as any,
      action: "WHATSAPP_MESSAGE_SEND",
      resourceType: "WhatsappMessage",
      resourceId: result.messageId || null,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        conversationId: id,
        contactId: conversation.contactId,
        type: type || (templateId ? "TEMPLATE" : "TEXT"),
        templateId: templateId || null,
        mediaUrl: mediaUrl || null,
      },
    });

    // Fetch the created message so we can return it to the caller
    const message = result.messageId
      ? await db.whatsappMessage.findUnique({ where: { id: result.messageId } })
      : null;

    return NextResponse.json(
      { success: true, data: serialize(message) },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("Whatsapp message send error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
