// MVMP — WhatsApp Templates
// GET  — list templates (filter by category/status)
// POST — create a template (auto-extract variables, single-default-per-category)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { extractTemplateVariables } from "@/lib/whatsapp";

const TEMPLATE_CATEGORIES = [
  "PAYMENT_SUCCESS",
  "PAYMENT_REMINDER",
  "MAINTENANCE",
  "PURCHASE_CONFIRMATION",
  "EXPIRY_WARNING",
  "OTP",
  "WELCOME",
  "CUSTOM",
] as const;

// GET — list all templates
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
    const category = searchParams.get("category")?.trim();
    const status = searchParams.get("status")?.trim();

    const where: any = {};
    if (category) where.category = category;
    if (status) where.status = status;

    const items = await db.whatsappTemplate.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: serialize({ items }) });
  } catch (e: any) {
    console.error("Whatsapp templates list error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

// POST — create a template
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
    const { key, name, category, body: templateBody, language, status, isDefault } = body || {};

    if (!key || !name || !category || !templateBody) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Field wajib: key, name, category, body" } },
        { status: 400 }
      );
    }

    if (!TEMPLATE_CATEGORIES.includes(category as any)) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Category tidak valid" } },
        { status: 400 }
      );
    }

    // key must be unique
    const existing = await db.whatsappTemplate.findUnique({ where: { key } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: "TEMPLATE_KEY_TAKEN", message: "Template key sudah digunakan" } },
        { status: 400 }
      );
    }

    // Auto-extract variables from the body
    const variables = extractTemplateVariables(String(templateBody));
    const variablesJson = JSON.stringify(variables);

    // If this template is being marked as default, unset default on other templates
    // in the same category (only one default per category).
    if (isDefault === true) {
      await db.whatsappTemplate.updateMany({
        where: { category, isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await db.whatsappTemplate.create({
      data: {
        key,
        name,
        category,
        body: String(templateBody),
        language: language || "id",
        status: status || "APPROVED",
        isDefault: isDefault === true,
        variablesJson,
      },
    });

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role as any,
      action: "WHATSAPP_TEMPLATE_CREATE",
      resourceType: "WhatsappTemplate",
      resourceId: template.id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        key,
        name,
        category,
        language: template.language,
        status: template.status,
        isDefault: template.isDefault,
        variables,
      },
    });

    return NextResponse.json(
      { success: true, data: serialize(template) },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("Whatsapp template create error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
