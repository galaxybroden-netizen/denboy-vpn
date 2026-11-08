// MVMP — WhatsApp Integration: confirm QR scan (Baileys pairing completion)
// Called by the UI when the owner confirms they've scanned the QR with their phone.
// In production: this endpoint would be called by Baileys' WebSocket "connection.update"
// event handler when status === "open" (i.e., real scan happened). Here we accept the
// confirmation and mark the integration as connected.
//
// Body (optional): { phoneNumber, displayName } — if omitted, mock values are used
// (sandbox only; in production these come from the Baileys connection event).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } }, { status: 401 });
  if (!hasPermission(user.role as any, "settings.manage" as any)) return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin" } }, { status: 403 });

  let integration = await db.whatsappIntegration.findFirst();
  if (!integration) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Integrasi belum dikonfigurasi" } }, { status: 404 });
  }

  if (integration.provider !== "baileys") {
    return NextResponse.json({ success: false, error: { code: "INVALID_PROVIDER", message: "Confirm-pair hanya untuk provider Baileys" } }, { status: 400 });
  }

  if (integration.status !== "connecting") {
    return NextResponse.json({ success: false, error: { code: "INVALID_STATUS", message: `Tidak ada pairing in-progress (status: ${integration.status})` } }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  // In production: phoneNumber & displayName come from Baileys connection event
  // (the WA account that scanned the QR). In sandbox: use provided values or mock.
  const phoneNumber = body?.phoneNumber || "62811000002";
  const displayName = body?.displayName || "MVMP Store (Owner WA)";

  integration = await db.whatsappIntegration.update({
    where: { id: integration.id },
    data: {
      status: "connected",
      phoneNumber,
      displayName,
      qrCodeData: null, // QR no longer needed after pairing
      lastConnectedAt: new Date(),
      lastError: null,
    },
  });

  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const ua = req.headers.get("user-agent") || "unknown";
  await auditLog({
    actorUserId: user.id,
    actorType: user.role as any,
    action: "WHATSAPP_PAIR_CONFIRMED",
    resourceType: "WhatsappIntegration",
    resourceId: integration.id,
    ipAddress: ip,
    userAgent: ua,
    metadata: { phoneNumber, displayName, provider: "baileys" },
  });

  return NextResponse.json({ success: true, data: serialize(integration) });
}
