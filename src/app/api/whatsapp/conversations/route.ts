// MVMP — WhatsApp Conversations
// GET  — list conversations (ordered lastMessageAt desc, nulls last) with filters
// POST — create a new conversation for a contact
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";

// GET — list conversations
export async function GET(req: NextRequest) {
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
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status")?.trim();
    const assigneeId = searchParams.get("assigneeId")?.trim();
    const search = searchParams.get("search")?.trim() || "";

    const where: any = {};
    if (status && ["OPEN", "PENDING", "RESOLVED", "SPAM"].includes(status)) {
      where.status = status;
    }
    if (assigneeId) where.assigneeId = assigneeId;
    if (search) {
      where.contact = {
        OR: [
          { displayName: { contains: search } },
          { phoneNumber: { contains: search } },
        ],
      };
    }

    const items = await db.whatsappConversation.findMany({
      where,
      orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }],
      include: {
        contact: true,
        _count: { select: { messages: true } },
      },
    });

    return NextResponse.json({ success: true, data: serialize({ items }) });
  } catch (e: any) {
    console.error("Whatsapp conversations list error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

// POST — create a new conversation
export async function POST(req: NextRequest) {
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
    const body = await req.json();
    const { contactId, assigneeId, status } = body || {};

    if (!contactId) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Field wajib: contactId" } },
        { status: 400 }
      );
    }

    const contact = await db.whatsappContact.findUnique({ where: { id: contactId } });
    if (!contact) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Contact tidak ditemukan" } },
        { status: 400 }
      );
    }

    if (assigneeId) {
      const assignee = await db.user.findUnique({ where: { id: assigneeId } });
      if (!assignee) {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: "Assignee tidak ditemukan" } },
          { status: 400 }
        );
      }
    }

    if (status && !["OPEN", "PENDING", "RESOLVED", "SPAM"].includes(status)) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Status tidak valid" } },
        { status: 400 }
      );
    }

    const conversation = await db.whatsappConversation.create({
      data: {
        contactId,
        assigneeId: assigneeId || null,
        status: status || "OPEN",
      },
      include: { contact: true },
    });

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role as any,
      action: "WHATSAPP_CONVERSATION_CREATE",
      resourceType: "WhatsappConversation",
      resourceId: conversation.id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        contactId,
        assigneeId: assigneeId || null,
        status: conversation.status,
      },
    });

    return NextResponse.json(
      { success: true, data: serialize(conversation) },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("Whatsapp conversation create error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
