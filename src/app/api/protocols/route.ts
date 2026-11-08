// MVMP — Protocols list
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
    if (!hasPermission(user.role, "protocols.view")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melihat protokol" } },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const isEnabled = searchParams.get("isEnabled");

    const where: any = {};
    if (isEnabled === "true") where.isEnabled = true;
    if (isEnabled === "false") where.isEnabled = false;

    const protocols = await db.protocol.findMany({
      where,
      orderBy: { displayName: "asc" },
      include: {
        _count: {
          select: { serverProtocols: { where: { status: "RUNNING" } } },
        },
      },
    });

    return NextResponse.json({ success: true, data: serialize({ items: protocols }) });
  } catch (e: any) {
    console.error("Protocols list error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
