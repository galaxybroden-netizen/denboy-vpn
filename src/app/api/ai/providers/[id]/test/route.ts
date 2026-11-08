// MVMP — Test AI provider connection (real API call)
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, hasPermission } from "@/lib/auth";
import { testProviderConnection } from "@/lib/ai-provider";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } }, { status: 401 });
  if (!hasPermission(user.role as any, "ai.manage" as any) && user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin" } }, { status: 403 });
  }

  const { id } = await params;
  const result = await testProviderConnection(id);
  return NextResponse.json({ success: result.success, data: result });
}
