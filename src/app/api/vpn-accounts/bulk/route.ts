// MVMP — VPN account bulk operations (POST /api/vpn-accounts/bulk)
// Body: { ids: string[], action: "suspend"|"activate"|"revoke"|"renew" }
// Performs the same per-account transitions as PATCH /api/vpn-accounts/[id]
// but inside a single db.$transaction. One audit-log entry is created for the
// whole bulk operation.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";

const VALID_ACTIONS = ["suspend", "activate", "revoke", "renew"] as const;
type BulkAction = (typeof VALID_ACTIONS)[number];

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" },
        },
        { status: 401 }
      );
    }
    if (!hasPermission(user.role, "vpn_accounts.manage")) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Anda tidak memiliki izin mengelola VPN account secara massal",
          },
        },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => null);
    const idsRaw = Array.isArray(body?.ids) ? body.ids : null;
    const action = body?.action as string;

    if (!idsRaw || idsRaw.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "ids harus berupa array tidak kosong",
          },
        },
        { status: 400 }
      );
    }
    if (!VALID_ACTIONS.includes(action as BulkAction)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: `action harus salah satu dari: ${VALID_ACTIONS.join(", ")}`,
          },
        },
        { status: 400 }
      );
    }

    const ids: string[] = Array.from(
      new Set(idsRaw.filter((x: any) => typeof x === "string" && x.length > 0))
    );
    if (ids.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "ids tidak valid setelah difilter",
          },
        },
        { status: 400 }
      );
    }

    const extendDays = Number(body?.extendDays ?? 30);
    const now = new Date();

    // Run all updates atomically inside a transaction.
    const updatedAccounts = await db.$transaction(async (tx) => {
      const existing = await tx.vpnAccount.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          status: true,
          expiresAt: true,
          username: true,
          provisionedAt: true,
        },
      });

      if (existing.length === 0) {
        return [];
      }

      const results: any[] = [];
      for (const acc of existing) {
        const data: any = { updatedAt: now };

        if (action === "suspend") {
          data.status = "SUSPENDED";
        } else if (action === "activate") {
          data.status = "ACTIVE";
          if (acc.provisionedAt === null) data.provisionedAt = now;
        } else if (action === "revoke") {
          data.status = "REVOKED";
          data.revokedAt = now;
        } else if (action === "renew") {
          data.status = "ACTIVE";
          const base =
            acc.expiresAt && new Date(acc.expiresAt) > now
              ? new Date(acc.expiresAt)
              : now;
          data.expiresAt = new Date(
            base.getTime() + extendDays * 24 * 3600 * 1000
          );
        }

        const updated = await tx.vpnAccount.update({
          where: { id: acc.id },
          data,
          select: {
            id: true,
            username: true,
            status: true,
            expiresAt: true,
          },
        });
        results.push(updated);
      }

      return results;
    });

    const ip =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const ua = req.headers.get("user-agent") || "unknown";

    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: `VPN_ACCOUNT_BULK_${action.toUpperCase()}`,
      resourceType: "VpnAccount",
      resourceId: ids[0],
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        count: updatedAccounts.length,
        ids,
        extendDays: action === "renew" ? extendDays : undefined,
        usernames: updatedAccounts.map((a) => a.username),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        updated: updatedAccounts.length,
        action,
        accounts: serialize(updatedAccounts),
      },
    });
  } catch (e: any) {
    console.error("VPN bulk action error:", e?.message);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL", message: "Terjadi kesalahan server" },
      },
      { status: 500 }
    );
  }
}
