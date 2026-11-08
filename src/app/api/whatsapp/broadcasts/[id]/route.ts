// MVMP — WhatsApp Broadcast detail + send action + delete
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { renderTemplate, sendWhatsappMessage } from "@/lib/whatsapp";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } }, { status: 401 });
  if (!hasPermission(user.role as any, "settings.view" as any)) return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin" } }, { status: 403 });

  const { id } = await params;
  const broadcast = await db.whatsappBroadcast.findUnique({
    where: { id },
    include: {
      template: true,
      recipients: {
        take: 100,
        orderBy: { status: "asc" },
        include: { contact: { select: { phoneNumber: true, displayName: true } } },
      },
      _count: { select: { recipients: true } },
    },
  });

  if (!broadcast) return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Broadcast tidak ditemukan" } }, { status: 404 });

  // Stats by status
  const statusCounts = await db.whatsappBroadcastRecipient.groupBy({
    by: ["status"],
    where: { broadcastId: id },
    _count: true,
  });
  const stats: Record<string, number> = {};
  for (const s of statusCounts) stats[s.status] = s._count;

  return NextResponse.json({
    success: true,
    data: serialize({ ...broadcast, stats }),
  });
}

// POST /api/whatsapp/broadcasts/[id]?action=send — start sending
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } }, { status: 401 });
  if (!hasPermission(user.role as any, "settings.manage" as any)) return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin" } }, { status: 403 });

  const { id } = await params;
  const broadcast = await db.whatsappBroadcast.findUnique({
    where: { id },
    include: { template: true },
  });
  if (!broadcast) return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Broadcast tidak ditemukan" } }, { status: 404 });

  if (broadcast.status === "SENDING" || broadcast.status === "COMPLETED") {
    return NextResponse.json({ success: false, error: { code: "INVALID_STATUS", message: `Broadcast sudah ${broadcast.status}` } }, { status: 409 });
  }

  const integration = await db.whatsappIntegration.findFirst();
  if (!integration || integration.status !== "connected") {
    return NextResponse.json({ success: false, error: { code: "NOT_CONNECTED", message: "WhatsApp belum terhubung" } }, { status: 400 });
  }

  // Mark as SENDING
  await db.whatsappBroadcast.update({
    where: { id },
    data: { status: "SENDING", startedAt: new Date() },
  });

  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const ua = req.headers.get("user-agent") || "unknown";
  await auditLog({
    actorUserId: user.id, actorType: user.role as any, action: "WHATSAPP_BROADCAST_SEND",
    resourceType: "WhatsappBroadcast", resourceId: id,
    ipAddress: ip, userAgent: ua, metadata: { name: broadcast.name, audienceCount: broadcast.audienceCount },
  });

  // Fetch recipients with contact info
  const recipients = await db.whatsappBroadcastRecipient.findMany({
    where: { broadcastId: id, status: "QUEUED" },
    include: { contact: { select: { phoneNumber: true, displayName: true, sourceId: true } } },
    take: 200,
  });

  // Optional extra variables from broadcast
  let extraVars: Record<string, any> = {};
  try { extraVars = JSON.parse(broadcast.variablesJson || "{}"); } catch {}

  // Send each (async, with small delays to avoid rate-limit in real providers)
  let sent = 0, failed = 0;
  for (const r of recipients) {
    try {
      // Build per-recipient vars
      const vars: Record<string, any> = { customer_name: r.contact.displayName, ...extraVars };

      // If contact sourced from Customer, fetch customer-specific vars
      if (r.contact.sourceId && r.contact.phoneNumber) {
        // Find customer by phone — best effort, don't fail if not found
        const customer = await db.customer.findFirst({
          where: { phone: { contains: r.contact.phoneNumber.slice(-8) } },
          select: { id: true, name: true, customerCode: true, email: true, user: { select: { email: true } } },
        });
        if (customer) {
          vars.customer_name = customer.name;
          vars.customer_code = customer.customerCode;
          vars.customer_email = customer.email;
        }
      }

      const rendered = renderTemplate(broadcast.template.body, vars);
      const result = await sendWhatsappMessage(r.contact.phoneNumber, rendered, {
        templateId: broadcast.templateId,
      });

      if (result.success) {
        await db.whatsappBroadcastRecipient.update({
          where: { id: r.id },
          data: { status: "SENT", sentAt: new Date() },
        });
        sent++;
      } else {
        await db.whatsappBroadcastRecipient.update({
          where: { id: r.id },
          data: { status: "FAILED", errorMessage: result.error || "Unknown error" },
        });
        failed++;
      }
    } catch (e: any) {
      await db.whatsappBroadcastRecipient.update({
        where: { id: r.id },
        data: { status: "FAILED", errorMessage: e?.message || "Exception" },
      });
      failed++;
    }
  }

  // Mark completed + stats
  const finalStats = await db.whatsappBroadcastRecipient.groupBy({
    by: ["status"],
    where: { broadcastId: id },
    _count: true,
  });
  const statsObj: Record<string, number> = {};
  for (const s of finalStats) statsObj[s.status] = s._count;

  const updated = await db.whatsappBroadcast.update({
    where: { id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      statsJson: JSON.stringify(statsObj),
    },
  });

  return NextResponse.json({
    success: true,
    data: serialize({ ...updated, sent, failed, stats: statsObj }),
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } }, { status: 401 });
  if (!hasPermission(user.role as any, "settings.manage" as any)) return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin" } }, { status: 403 });

  const { id } = await params;
  const existing = await db.whatsappBroadcast.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Broadcast tidak ditemukan" } }, { status: 404 });

  if (existing.status === "SENDING") {
    return NextResponse.json({ success: false, error: { code: "INVALID_STATUS", message: "Broadcast sedang dikirim, tidak bisa dihapus" } }, { status: 409 });
  }

  await db.whatsappBroadcast.delete({ where: { id } });

  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const ua = req.headers.get("user-agent") || "unknown";
  await auditLog({
    actorUserId: user.id, actorType: user.role as any, action: "WHATSAPP_BROADCAST_DELETE",
    resourceType: "WhatsappBroadcast", resourceId: id,
    ipAddress: ip, userAgent: ua, metadata: { name: existing.name },
  });

  return NextResponse.json({ success: true, data: { id, deleted: true } });
}
