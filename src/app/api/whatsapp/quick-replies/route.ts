// MVMP — WhatsApp Quick Replies
// GET  — list quick replies (ordered by keyword asc)
// POST — create a quick reply (keyword must be unique)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";

// GET — list all quick replies
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
    const items = await db.whatsappQuickReply.findMany({
      orderBy: { keyword: "asc" },
    });

    return NextResponse.json({ success: true, data: serialize({ items }) });
  } catch (e: any) {
    console.error("Whatsapp quick replies list error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

// POST — create a quick reply
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
    const { keyword, response, autoTrigger } = body || {};

    if (!keyword || !response) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Field wajib: keyword, response" } },
        { status: 400 }
      );
    }

    // keyword must be unique
    const existing = await db.whatsappQuickReply.findUnique({ where: { keyword } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: "QUICKREPLY_EXISTS", message: "Quick reply dengan keyword tersebut sudah ada" } },
        { status: 400 }
      );
    }

    const quickReply = await db.whatsappQuickReply.create({
      data: {
        keyword,
        response,
        autoTrigger: autoTrigger === true,
        createdBy: user.id,
      },
    });

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role as any,
      action: "WHATSAPP_QUICKREPLY_CREATE",
      resourceType: "WhatsappQuickReply",
      resourceId: quickReply.id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        keyword,
        autoTrigger: quickReply.autoTrigger,
      },
    });

    return NextResponse.json(
      { success: true, data: serialize(quickReply) },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("Whatsapp quick reply create error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
