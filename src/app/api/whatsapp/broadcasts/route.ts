// MVMP — WhatsApp Broadcasts (list + create)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { extractTemplateVariables, renderTemplate, normalizePhone } from "@/lib/whatsapp";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } }, { status: 401 });
  if (!hasPermission(user.role as any, "settings.view" as any)) return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin" } }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status")?.trim();
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));

  const where: any = {};
  if (status) where.status = status;

  const [total, items] = await Promise.all([
    db.whatsappBroadcast.count({ where }),
    db.whatsappBroadcast.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        template: { select: { id: true, key: true, name: true, category: true, body: true } },
        _count: { select: { recipients: true } },
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
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } }, { status: 401 });
  if (!hasPermission(user.role as any, "settings.manage" as any)) return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin" } }, { status: 403 });

  const body = await req.json();
  const { name, templateId, audienceFilterJson, variablesJson, scheduledAt } = body || {};

  if (!name || !templateId) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Field wajib: name, templateId" } }, { status: 400 });
  }

  const template = await db.whatsappTemplate.findUnique({ where: { id: templateId } });
  if (!template) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Template tidak ditemukan" } }, { status: 404 });
  }

  // Build audience from filter
  let audience: any[] = [];
  let filter: any = {};
  try { filter = audienceFilterJson ? JSON.parse(audienceFilterJson) : {}; } catch {}

  const contactWhere: any = {};
  if (filter.source) contactWhere.source = filter.source;
  if (filter.tags && Array.isArray(filter.tags) && filter.tags.length) {
    contactWhere.OR = filter.tags.map((t: string) => ({ tags: { contains: t } }));
  }
  if (filter.customerStatus) {
    // Filter contacts that came from customers with this status
    const customers = await db.customer.findMany({
      where: { status: filter.customerStatus, phone: { not: null } },
      select: { id: true, phone: true },
    });
    const custIds = new Set(customers.map((c) => c.id));
    contactWhere.source = "CUSTOMER";
    contactWhere.sourceId = { in: Array.from(custIds) };
  }

  audience = await db.whatsappContact.findMany({
    where: contactWhere,
    select: { id: true, phoneNumber: true, displayName: true, sourceId: true },
  });

  const status = scheduledAt ? "SCHEDULED" : "DRAFT";
  const broadcast = await db.whatsappBroadcast.create({
    data: {
      name,
      templateId,
      audienceFilterJson: audienceFilterJson || JSON.stringify(filter),
      variablesJson: variablesJson || null,
      audienceCount: audience.length,
      status,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      createdBy: user.id,
    },
    include: { template: true },
  });

  // Create recipients (queued)
  if (audience.length > 0) {
    await db.whatsappBroadcastRecipient.createMany({
      data: audience.map((c) => ({ broadcastId: broadcast.id, contactId: c.id })),
    });
  }

  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const ua = req.headers.get("user-agent") || "unknown";
  await auditLog({
    actorUserId: user.id, actorType: user.role as any, action: "WHATSAPP_BROADCAST_CREATE",
    resourceType: "WhatsappBroadcast", resourceId: broadcast.id,
    ipAddress: ip, userAgent: ua,
    metadata: { name, templateId, templateKey: template.key, audienceCount: audience.length, status },
  });

  return NextResponse.json({ success: true, data: serialize(broadcast) }, { status: 201 });
}
