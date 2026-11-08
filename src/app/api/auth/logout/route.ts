// MVMP — Auth logout endpoint
import { NextResponse } from "next/server";
import { destroySession, clearSessionCookie, getSessionUser, auditLog } from "@/lib/auth";

export async function POST() {
  const user = await getSessionUser();
  if (user) {
    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: "USER_LOGOUT",
      resourceType: "User",
      resourceId: user.id,
    });
  }
  await destroySession();
  const res = NextResponse.json({ success: true, data: null });
  res.cookies.set(clearSessionCookie());
  return res;
}
