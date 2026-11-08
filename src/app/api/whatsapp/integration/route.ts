// MVMP — WhatsApp Integration config (GET / PATCH) + connect/disconnect
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } }, { status: 401 });
  if (!hasPermission(user.role as any, "settings.view" as any)) return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin" } }, { status: 403 });

  let integration = await db.whatsappIntegration.findFirst();
  if (!integration) integration = await db.whatsappIntegration.create({ data: {} });
  return NextResponse.json({ success: true, data: serialize(integration) });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } }, { status: 401 });
  if (!hasPermission(user.role as any, "settings.manage" as any)) return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin" } }, { status: 403 });

  const body = await req.json();
  const { provider, credentialsJson, autoReplyRulesJson, defaultTemplateId } = body || {};

  let integration = await db.whatsappIntegration.findFirst();
  if (!integration) integration = await db.whatsappIntegration.create({ data: {} });

  const data: any = {};
  if (provider && ["meta_cloud", "baileys", "api"].includes(provider)) data.provider = provider;
  if (credentialsJson !== undefined) data.credentialsJson = credentialsJson;
  if (autoReplyRulesJson !== undefined) data.autoReplyRulesJson = autoReplyRulesJson;
  if (defaultTemplateId !== undefined) data.defaultTemplateId = defaultTemplateId || null;

  integration = await db.whatsappIntegration.update({ where: { id: integration.id }, data });

  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const ua = req.headers.get("user-agent") || "unknown";
  await auditLog({
    actorUserId: user.id, actorType: user.role as any, action: "WHATSAPP_CONFIG_UPDATE",
    resourceType: "WhatsappIntegration", resourceId: integration.id,
    ipAddress: ip, userAgent: ua,
    metadata: { provider, fieldsUpdated: Object.keys(data) },
  });

  return NextResponse.json({ success: true, data: serialize(integration) });
}
