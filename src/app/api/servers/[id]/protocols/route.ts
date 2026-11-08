// MVMP — Server protocols list
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";

export async function GET(
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
    if (!hasPermission(user.role, "protocols.view")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melihat protokol" } },
        { status: 403 }
      );
    }

    const { id } = await params;

    const server = await db.server.findUnique({ where: { id }, select: { id: true } });
    if (!server) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Server tidak ditemukan" } },
        { status: 404 }
      );
    }

    const serverProtocols = await db.serverProtocol.findMany({
      where: { serverId: id },
      include: {
        protocol: {
          select: {
            id: true,
            key: true,
            displayName: true,
            engine: true,
            description: true,
            isEnabled: true,
            isPremium: true,
          },
        },
      },
      orderBy: { protocol: { displayName: "asc" } },
    });

    return NextResponse.json({ success: true, data: serialize({ items: serverProtocols }) });
  } catch (e: any) {
    console.error("Server protocols list error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
