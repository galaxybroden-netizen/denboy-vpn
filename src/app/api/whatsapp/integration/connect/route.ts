// MVMP — WhatsApp: connect (start pairing/QR), disconnect
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";

// POST — start pairing flow
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } }, { status: 401 });
  if (!hasPermission(user.role as any, "settings.manage" as any)) return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin" } }, { status: 403 });

  let integration = await db.whatsappIntegration.findFirst();
  if (!integration) integration = await db.whatsappIntegration.create({ data: {} });

  const provider = integration.provider;

  if (provider === "baileys") {
    const sessionId = `mvmp-wa-${Date.now().toString(36)}`;
    const qrCodeData = `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240' viewBox='0 0 240 240'>
        <rect width='240' height='240' fill='#fff'/>
        <g fill='#000'>
          <rect x='20' y='20' width='60' height='60'/><rect x='40' y='40' width='20' height='20' fill='#fff'/>
          <rect x='160' y='20' width='60' height='60'/><rect x='180' y='40' width='20' height='20' fill='#fff'/>
          <rect x='20' y='160' width='60' height='60'/><rect x='40' y='180' width='20' height='20' fill='#fff'/>
          <rect x='100' y='20' width='20' height='20'/><rect x='100' y='60' width='40' height='20'/>
          <rect x='100' y='100' width='20' height='40'/><rect x='140' y='100' width='20' height='20'/>
          <rect x='180' y='100' width='20' height='40'/><rect x='100' y='160' width='40' height='20'/>
          <rect x='160' y='160' width='20' height='40'/><rect x='200' y='160' width='20' height='20'/>
          <rect x='100' y='200' width='20' height='20'/><rect x='140' y='200' width='40' height='20'/>
        </g>
      </svg>`
    )}`;
    // Set status to "connecting" + display QR. Do NOT auto-pair here.
    // The integration stays in "connecting" state until the owner actually scans the QR
    // with their phone. In production, Baileys fires a WebSocket "connection.update"
    // event when the QR is scanned — that event calls the /confirm-pair endpoint.
    // In sandbox: user clicks "Saya sudah scan QR" button in UI → calls confirm-pair.
    integration = await db.whatsappIntegration.update({
      where: { id: integration.id },
      data: {
        status: "connecting",
        qrCodeData,
        credentialsJson: JSON.stringify({ sessionId }),
        lastError: null,
        // Clear any previous phone number / display name from earlier sessions
        phoneNumber: null,
        displayName: null,
        lastConnectedAt: null,
      },
    });
  } else if (provider === "meta_cloud") {
    let creds: any = {};
    try { creds = JSON.parse(integration.credentialsJson || "{}"); } catch {}
    if (!creds.wabaId || !creds.phoneNumberId || !creds.accessToken) {
      return NextResponse.json({ success: false, error: { code: "MISSING_CREDS", message: "Lengkapi WABA ID, Phone Number ID, dan Access Token di form integrasi" } }, { status: 400 });
    }
    integration = await db.whatsappIntegration.update({
      where: { id: integration.id },
      data: { status: "connected", phoneNumber: creds.phoneNumberId, displayName: `WABA ${creds.wabaId}`, qrCodeData: null, lastConnectedAt: new Date(), lastError: null },
    });
  } else if (provider === "api") {
    let creds: any = {};
    try { creds = JSON.parse(integration.credentialsJson || "{}"); } catch {}
    if (!creds.apiUrl || !creds.apiKey) {
      return NextResponse.json({ success: false, error: { code: "MISSING_CREDS", message: "Lengkapi API URL dan API Key di form integrasi" } }, { status: 400 });
    }
    integration = await db.whatsappIntegration.update({
      where: { id: integration.id },
      data: { status: "connected", phoneNumber: creds.senderNumber || "62811000002", displayName: "API Provider", qrCodeData: null, lastConnectedAt: new Date(), lastError: null },
    });
  }

  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const ua = req.headers.get("user-agent") || "unknown";
  await auditLog({ actorUserId: user.id, actorType: user.role as any, action: "WHATSAPP_CONNECT", resourceType: "WhatsappIntegration", resourceId: integration.id, ipAddress: ip, userAgent: ua, metadata: { provider } });

  return NextResponse.json({ success: true, data: serialize(integration) });
}

// DELETE — disconnect
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } }, { status: 401 });
  if (!hasPermission(user.role as any, "settings.manage" as any)) return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin" } }, { status: 403 });

  let integration = await db.whatsappIntegration.findFirst();
  if (!integration) integration = await db.whatsappIntegration.create({ data: {} });

  integration = await db.whatsappIntegration.update({
    where: { id: integration.id },
    data: { status: "disconnected", qrCodeData: null, lastConnectedAt: null, lastError: null },
  });

  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const ua = req.headers.get("user-agent") || "unknown";
  await auditLog({ actorUserId: user.id, actorType: user.role as any, action: "WHATSAPP_DISCONNECT", resourceType: "WhatsappIntegration", resourceId: integration.id, ipAddress: ip, userAgent: ua });

  return NextResponse.json({ success: true, data: serialize(integration) });
}
