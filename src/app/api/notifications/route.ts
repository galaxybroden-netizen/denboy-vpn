// MVMP — Notifications list (for current user)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
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

    const [unreadCount, items] = await Promise.all([
      db.notification.count({ where: { userId: user.id, readAt: null } }),
      db.notification.findMany({
        where: { userId: user.id },
        orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
        take: 50,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: serialize({
        items,
        unreadCount,
      }),
    });
  } catch (e: any) {
    console.error("Notifications list error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
