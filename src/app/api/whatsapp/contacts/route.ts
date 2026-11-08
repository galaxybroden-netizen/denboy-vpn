// MVMP — WhatsApp Contacts
// GET  — list contacts (paginated, filterable by search/source/tag)
// POST — sync contacts from Customer + User tables via syncWhatsappContacts()
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { syncWhatsappContacts } from "@/lib/whatsapp";

// GET — list contacts
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
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const search = searchParams.get("search")?.trim() || "";
    const source = searchParams.get("source")?.trim();
    const tag = searchParams.get("tag")?.trim();

    const where: any = {};
    if (source && ["CUSTOMER", "USER", "MANUAL"].includes(source)) {
      where.source = source;
    }
    // tags is stored as a JSON array string; substring match on the quoted tag
    if (tag) where.tags = { contains: `"${tag}"` };
    if (search) {
      where.OR = [
        { phoneNumber: { contains: search } },
        { displayName: { contains: search } },
      ];
    }

    const [total, items] = await Promise.all([
      db.whatsappContact.count({ where }),
      db.whatsappContact.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { conversations: true, broadcastRecipients: true } },
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
    console.error("Whatsapp contacts list error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

// POST — dual purpose:
//   1. If body has `phoneNumber` + `displayName` → create manual contact
//   2. If body is empty or has `sync: true` → sync contacts from Customer + User tables
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
      { status: 401 }
    );

  // For manual creation, accept ai.manage OR settings.manage
  // For sync, require settings.manage
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const isManualCreate = body && body.phoneNumber && body.displayName;

  if (isManualCreate) {
    // Manual contact creation — accept ai.manage or settings.manage
    if (!hasPermission(user.role as any, "ai.manage" as any) && !hasPermission(user.role as any, "settings.manage" as any) && user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin menambah kontak" } },
        { status: 403 }
      );
    }

    const phoneNumber = String(body.phoneNumber).trim();
    const displayName = String(body.displayName).trim();
    const email = body.email ? String(body.email).trim() : null;
    const tags = body.tags || null;

    if (!phoneNumber || !displayName) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "phoneNumber dan displayName wajib diisi" } },
        { status: 400 }
      );
    }

    // Check duplicate
    const existing = await db.whatsappContact.findUnique({ where: { phoneNumber } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: "DUPLICATE", message: `Kontak dengan nomor ${phoneNumber} sudah ada` } },
        { status: 409 }
      );
    }

    const contact = await db.whatsappContact.create({
      data: {
        phoneNumber,
        displayName,
        source: "MANUAL",
        tags: tags ? JSON.stringify(tags) : null,
      },
    });

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role as any,
      action: "CONTACT_CREATE_MANUAL",
      resourceType: "WhatsappContact",
      resourceId: contact.id,
      ipAddress: ip,
      userAgent: ua,
      metadata: { phoneNumber, displayName },
    });

    return NextResponse.json({ success: true, data: serialize(contact) }, { status: 201 });
  }

  // Sync mode — require settings.manage
  if (!hasPermission(user.role as any, "settings.manage"))
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin" } },
      { status: 403 }
    );

  try {
    const result = await syncWhatsappContacts();

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role as any,
      action: "WHATSAPP_CONTACTS_SYNC",
      resourceType: "WhatsappContact",
      ipAddress: ip,
      userAgent: ua,
      metadata: { created: result.created, updated: result.updated, total: result.total },
    });

    return NextResponse.json({ success: true, data: serialize(result) });
  } catch (e: any) {
    console.error("Whatsapp contacts sync error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
