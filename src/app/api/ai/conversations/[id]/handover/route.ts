// MVMP — AI Conversation handover (takeover / return_to_ai)
// POST — body: { action: "takeover" | "return_to_ai" }
//   takeover       → status="HUMAN_ASSIGNED", assignedAdminId=user.id
//                    ChatAssignment { action:"assigned", adminId, assignedBy }
//                    ChatAuditLog  { action:"takeover", fromStatus=old, toStatus="HUMAN_ASSIGNED" }
//   return_to_ai   → status="AI_ACTIVE", assignedAdminId=null
//                    ChatAssignment { action:"unassigned", adminId=user.id, assignedBy=user.id }
//                    ChatAuditLog  { action:"return_to_ai", fromStatus=old, toStatus="AI_ACTIVE" }
// Returns the updated conversation.
//
// Next.js 16: route params are Promise-wrapped — `{ params }: { params: Promise<{ id: string }> }`

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";

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
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melakukan handover percakapan" } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = (await req.json()) || {};
    const action = String(body.action || "").trim();

    if (action !== "takeover" && action !== "return_to_ai") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Field wajib: action (nilai yang valid: 'takeover' | 'return_to_ai')",
          },
        },
        { status: 400 }
      );
    }

    const existing = await db.chatConversation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Percakapan tidak ditemukan" } },
        { status: 404 }
      );
    }

    const fromStatus = existing.status;
    const toStatus = action === "takeover" ? "HUMAN_ASSIGNED" : "AI_ACTIVE";
    const assignedAdminId = action === "takeover" ? user.id : null;

    // Update conversation + create ChatAssignment + create ChatAuditLog atomically
    const [updated] = await db.$transaction([
      db.chatConversation.update({
        where: { id },
        data: {
          status: toStatus,
          assignedAdminId,
        },
        include: {
          _count: { select: { messages: true } },
        },
      }),
      db.chatAssignment.create({
        data: {
          conversationId: id,
          adminId: user.id,
          action: action === "takeover" ? "assigned" : "unassigned",
          assignedBy: user.id,
          reason: action === "takeover" ? "Manual takeover by admin" : "Returned to AI",
        },
      }),
      db.chatAuditLog.create({
        data: {
          conversationId: id,
          action: action === "takeover" ? "takeover" : "return_to_ai",
          fromStatus,
          toStatus,
          actorId: user.id,
          actorType: "admin",
          metadataJson: JSON.stringify({
            adminId: user.id,
            adminName: user.name || user.email,
            previousAssignedAdminId: existing.assignedAdminId,
          }),
        },
      }),
    ]);

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role as any,
      action: action === "takeover" ? "CHAT_TAKEOVER" : "CHAT_RETURN_TO_AI",
      resourceType: "ChatConversation",
      resourceId: id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        conversationId: id,
        fromStatus,
        toStatus,
        assignedAdminId,
      },
    });

    return NextResponse.json({ success: true, data: serialize(updated) });
  } catch (e: any) {
    console.error("AI conversation handover error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
