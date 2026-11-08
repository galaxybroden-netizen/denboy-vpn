// MVMP — Email log list (admin) — mock SMTP outbox history
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }
    if (!hasPermission(user.role, "audit.view" as any)) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin" } },
        { status: 403 }
      );
    }

    const [logs, total, byTemplate] = await Promise.all([
      db.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      db.emailLog.count(),
      db.emailLog.groupBy({ by: ["template"], _count: { _all: true } }),
    ]);

    const stats: Record<string, number> = {};
    for (const g of byTemplate) {
      stats[g.template] = g._count._all;
    }

    return NextResponse.json({
      success: true,
      data: serialize({ logs, total, stats }),
    });
  } catch (e: any) {
    console.error("Email logs list error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
