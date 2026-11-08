// MVMP — RBAC permissions list (grouped + flat)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { getAllPermissionsGrouped, hasPermissionDb } from "@/lib/rbac";

// GET — list all permissions grouped by category + flat list
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }

    // SUPER_ADMIN always has access; others need settings.view
    const canView =
      user.role === "SUPER_ADMIN"
        ? true
        : hasPermission(user.role as any, "settings.view" as any);
    if (!canView) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melihat permission" } },
        { status: 403 }
      );
    }

    const groups = await getAllPermissionsGrouped();

    // Flatten for search convenience
    const flat: Array<{
      id: string;
      key: string;
      name: string;
      description: string | null;
      category: string;
      action: string;
      isSensitive: boolean;
    }> = [];
    for (const [category, perms] of Object.entries(groups)) {
      for (const p of perms) {
        flat.push({
          id: p.id,
          key: p.key,
          name: p.name,
          description: p.description,
          category,
          action: p.action,
          isSensitive: p.isSensitive,
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: serialize({ groups, flat }),
    });
  } catch (e: any) {
    console.error("RBAC permissions list error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
