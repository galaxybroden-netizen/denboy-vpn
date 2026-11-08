// MVMP — AI Conversation detail & update
// GET   — conversation with messages (createdAt asc, take 200), assignments, _count
// PATCH — update { status, assignedAdminId, internalNotes, tagsJson }
//         When status changes → create ChatAuditLog (action="mode_change",
//         fromStatus, toStatus, actorId=user.id, actorType="admin")
//         Audit log action: CHAT_MODE_CHANGE
//
// Next.js 16: route params are Promise-wrapped — `{ params }: { params: Promise<{ id: string }> }`

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";

const ALLOWED_STATUSES = new Set([
  "AI_ACTIVE",
  "HUMAN_ASSIGNED",
  "AI_ASSIST",
  "WAITING_FOR_ADMIN",
  "RESOLVED",
  "CLOSED",
]);

// GET — conversation detail
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
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melihat percakapan AI" } },
        { status: 403 }
      );
    }

    const { id } = await params;

    const conversation = await db.chatConversation.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          take: 200,
        },
        assignments: {
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            messages: true,
            assignments: true,
            suggestedReplies: true,
            auditLogs: true,
          },
        },
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Percakapan tidak ditemukan" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: serialize(conversation) });
  } catch (e: any) {
    console.error("AI conversation detail error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

// PATCH — update conversation fields
export async function PATCH(
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
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin mengubah percakapan AI" } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = (await req.json()) || {};
    const { status, assignedAdminId, internalNotes, tagsJson } = body;

    const existing = await db.chatConversation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Percakapan tidak ditemukan" } },
        { status: 404 }
      );
    }

    // Validate status if provided
    if (status !== undefined && status !== null && !ALLOWED_STATUSES.has(String(status))) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: `status tidak valid. Pilihan: ${[...ALLOWED_STATUSES].join(", ")}`,
          },
        },
        { status: 400 }
      );
    }

    // Validate assignedAdminId if provided (non-null)
    if (assignedAdminId !== undefined && assignedAdminId !== null) {
      const admin = await db.user.findUnique({ where: { id: String(assignedAdminId) } });
      if (!admin) {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: "assignedAdminId tidak ditemukan" } },
          { status: 400 }
        );
      }
    }

    // Build update payload from whitelisted fields
    const data: any = {};
    const changed: string[] = [];

    if (status !== undefined) {
      const next = status === null ? null : String(status);
      if (next !== existing.status) {
        data.status = next;
        changed.push("status");
      }
    }
    if (assignedAdminId !== undefined) {
      const next = assignedAdminId === null || assignedAdminId === "" ? null : String(assignedAdminId);
      if (next !== existing.assignedAdminId) {
        data.assignedAdminId = next;
        changed.push("assignedAdminId");
      }
    }
    if (internalNotes !== undefined) {
      const next = internalNotes === null || internalNotes === "" ? null : String(internalNotes);
      if (next !== existing.internalNotes) {
        data.internalNotes = next;
        changed.push("internalNotes");
      }
    }
    if (tagsJson !== undefined) {
      // Accept array or string — store as JSON string
      const next =
        tagsJson === null
          ? null
          : typeof tagsJson === "string"
            ? tagsJson
            : JSON.stringify(tagsJson);
      if (next !== existing.tagsJson) {
        data.tagsJson = next;
        changed.push("tagsJson");
      }
    }

    if (changed.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Tidak ada perubahan untuk diterapkan" } },
        { status: 400 }
      );
    }

    const updated = await db.chatConversation.update({
      where: { id },
      data,
      include: {
        _count: { select: { messages: true } },
      },
    });

    // If status changed → create ChatAuditLog entry with action="mode_change"
    if (data.status !== undefined && data.status !== existing.status) {
      await db.chatAuditLog.create({
        data: {
          conversationId: id,
          action: "mode_change",
          fromStatus: existing.status,
          toStatus: data.status,
          actorId: user.id,
          actorType: "admin",
          metadataJson: JSON.stringify({
            changedFields: changed,
            userId: user.id,
            userName: user.name,
          }),
        },
      });
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role as any,
      action: "CHAT_MODE_CHANGE",
      resourceType: "ChatConversation",
      resourceId: id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        changedFields: changed,
        fromStatus: existing.status,
        toStatus: data.status ?? existing.status,
        fromAssignedAdminId: existing.assignedAdminId,
        toAssignedAdminId: data.assignedAdminId ?? existing.assignedAdminId,
      },
    });

    return NextResponse.json({ success: true, data: serialize(updated) });
  } catch (e: any) {
    console.error("AI conversation update error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
