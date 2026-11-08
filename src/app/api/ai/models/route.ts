// MVMP — AI Center models
// GET: list all AIModel records with provider info (name, type, isActive).
//      Supports `?category=` and `?providerId=` filters.
//      Pricing info (inputPricePer1M, outputPricePer1M, isFree) is included.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }
    if (!hasPermission(user.role, "ai.view")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melihat AI model" } },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category")?.trim();
    const providerId = searchParams.get("providerId")?.trim();
    const activeOnly = searchParams.get("active") === "1" || searchParams.get("active") === "true";

    const where: any = {};
    if (category) where.category = category;
    if (providerId) where.providerId = providerId;
    if (activeOnly) where.isActive = true;

    const models = await db.aIModel.findMany({
      where,
      include: {
        provider: {
          select: {
            id: true,
            name: true,
            type: true,
            isActive: true,
          },
        },
      },
      orderBy: [{ displayName: "asc" }],
    });

    return NextResponse.json({ success: true, data: serialize(models) });
  } catch (e: any) {
    console.error("AI models list error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
