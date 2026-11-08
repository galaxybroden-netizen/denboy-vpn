// MVMP — In-app notification helper (Batch 3)
// Creates Notification rows for admin users and pushes them in realtime.

import { db } from "./db";
import { broadcast, REALTIME_EVENTS } from "./realtime";

export async function notifyAdmins(params: {
  type: string;
  title: string;
  body?: string;
  data?: Record<string, any>;
}): Promise<number> {
  try {
    const admins = await db.user.findMany({
      where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, status: "ACTIVE" },
      select: { id: true },
    });
    if (admins.length === 0) return 0;

    let first: { id: string; type: string; title: string; body: string | null; createdAt: Date } | null = null;
    for (const admin of admins) {
      const n = await db.notification.create({
        data: {
          userId: admin.id,
          type: params.type,
          title: params.title,
          body: params.body || null,
          data: params.data ? JSON.stringify(params.data) : null,
        },
      });
      if (!first) first = n;
    }

    if (first) {
      await broadcast(REALTIME_EVENTS.NOTIFICATION_NEW, {
        id: first.id,
        type: first.type,
        title: first.title,
        body: first.body,
        createdAt: first.createdAt,
      });
    }
    return admins.length;
  } catch (e: any) {
    console.error("notifyAdmins failed:", e?.message);
    return 0;
  }
}
