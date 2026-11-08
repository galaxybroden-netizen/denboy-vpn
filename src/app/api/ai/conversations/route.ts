// MVMP — AI Conversations list
// GET — list ChatConversation records with filters:
//   ?status=   (AI_ACTIVE | HUMAN_ASSIGNED | AI_ASSIST | WAITING_FOR_ADMIN | RESOLVED | CLOSED)
//   ?channel=  (landing | customer | reseller | whatsapp | admin)
//   ?search=   (matches visitorName OR visitorEmail, case-insensitive contains)
//   ?page=     (default 1)
//   ?limit=    (default 20, capped at 100)
// Each row includes _count.messages. Ordered by lastMessageAt desc nulls last.
//
// Next.js 16 App Router · SUPER_ADMIN always passes (ROLE_PERMISSIONS includes ai.view).

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

const ALLOWED_CHANNELS = new Set([
  "landing",
  "customer",
  "reseller",
  "whatsapp",
  "admin",
]);

export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status")?.trim() || "";
    const channel = searchParams.get("channel")?.trim() || "";
    const search = searchParams.get("search")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));

    const where: any = {};
    if (status && ALLOWED_STATUSES.has(status)) where.status = status;
    if (channel && ALLOWED_CHANNELS.has(channel)) where.channel = channel;
    if (search) {
      where.OR = [
        { visitorName: { contains: search, mode: "insensitive" } },
        { visitorEmail: { contains: search, mode: "insensitive" } },
      ];
    }

    const [total, items] = await Promise.all([
      db.chatConversation.count({ where }),
      db.chatConversation.findMany({
        where,
        orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { messages: true } },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: serialize({
        items,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      }),
    });
  } catch (e: any) {
    console.error("AI conversations list error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
