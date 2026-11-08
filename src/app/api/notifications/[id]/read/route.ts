// MVMP — Mark notification as read
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }

    const { id } = await params;

    const notif = await db.notification.findUnique({ where: { id } });
    if (!notif) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Notifikasi tidak ditemukan" } },
        { status: 404 }
      );
    }
    if (notif.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Notifikasi ini bukan milik Anda" } },
        { status: 403 }
      );
    }

    const updated = await db.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });

    return NextResponse.json({ success: true, data: serialize(updated) });
  } catch (e: any) {
    console.error("Notification mark-read error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
