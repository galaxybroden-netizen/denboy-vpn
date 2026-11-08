// MVMP — VPN account detail (GET, PATCH)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { resolveTenantScope, canAccessVpnAccount } from "@/lib/tenant-scope";
import { revealCredential } from "@/lib/credentials";

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
    if (!hasPermission(user.role, "vpn_accounts.view")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melihat VPN account" } },
        { status: 403 }
      );
    }

    const { id } = await params;

    const account = await db.vpnAccount.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            customerCode: true,
            phone: true,
            resellerId: true,
          },
        },
        server: { select: { id: true, name: true, publicIp: true, region: true, countryCode: true } },
        protocol: { select: { id: true, displayName: true, engine: true, key: true } },
        subscription: { include: { package: true } },
        credentials: {
          select: {
            id: true,
            credentialType: true,
            publicValue: true,
            secretEncrypted: true,
            keyVersion: true,
            shownOnceAt: true,
            rotatedAt: true,
            createdAt: true,
          },
        },
        usage: {
          orderBy: { recordedAt: "desc" },
          take: 10,
        },
      },
    });

    if (!account) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "VPN account tidak ditemukan" } },
        { status: 404 }
      );
    }

    // Tenant boundary — customers and resellers must not read other owners' accounts.
    const scope = await resolveTenantScope(user);
    if (!canAccessVpnAccount(scope, account)) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "VPN account tidak ditemukan" } },
        { status: 404 }
      );
    }

    // Reveal the decrypted credential only to a caller that passed the tenant check;
    // the ciphertext itself is never returned.
    const data = {
      ...account,
      credentials: account.credentials.map(({ secretEncrypted, ...cred }) => ({
        ...cred,
        publicValue: revealCredential({ secretEncrypted, publicValue: cred.publicValue }),
      })),
    };

    return NextResponse.json({ success: true, data: serialize(data) });
  } catch (e: any) {
    console.error("VPN account detail error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

export async function PATCH(
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
    if (!hasPermission(user.role, "vpn_accounts.manage")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin mengubah VPN account" } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();
    const action = body?.action as string;
    const extendDays = Number(body?.extendDays ?? 30);

    const validActions = ["suspend", "activate", "revoke", "renew"];
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: `Action harus salah satu dari: ${validActions.join(", ")}` } },
        { status: 400 }
      );
    }

    const existing = await db.vpnAccount.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "VPN account tidak ditemukan" } },
        { status: 404 }
      );
    }

    const now = new Date();
    const data: any = { updatedAt: now };

    if (action === "suspend") {
      data.status = "SUSPENDED";
    } else if (action === "activate") {
      data.status = "ACTIVE";
      data.provisionedAt = existing.provisionedAt || now;
    } else if (action === "revoke") {
      data.status = "REVOKED";
      data.revokedAt = now;
    } else if (action === "renew") {
      data.status = "ACTIVE";
      const base = existing.expiresAt && existing.expiresAt > now ? existing.expiresAt : now;
      const newExpiry = new Date(base.getTime() + extendDays * 24 * 3600 * 1000);
      data.expiresAt = newExpiry;
    }

    const updated = await db.vpnAccount.update({
      where: { id },
      data,
      include: {
        customer: { select: { id: true, name: true, email: true } },
        server: { select: { id: true, name: true, publicIp: true } },
        protocol: { select: { id: true, displayName: true, key: true } },
      },
    });

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: `VPN_ACCOUNT_${action.toUpperCase()}`,
      resourceType: "VpnAccount",
      resourceId: id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        username: existing.username,
        newStatus: data.status,
        extendDays: action === "renew" ? extendDays : undefined,
      },
    });

    return NextResponse.json({ success: true, data: serialize(updated) });
  } catch (e: any) {
    console.error("VPN account update error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

// DELETE — hard-delete VPN account (cascade removes credentials & usage)
export async function DELETE(
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
    if (!hasPermission(user.role, "vpn_accounts.manage")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin menghapus VPN account" } },
        { status: 403 }
      );
    }

    const { id } = await params;

    const existing = await db.vpnAccount.findUnique({
      where: { id },
      include: {
        _count: { select: { credentials: true, usage: true } },
      },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "VPN account tidak ditemukan" } },
        { status: 404 }
      );
    }

    // Hard delete — schema has onDelete: Cascade on VpnCredential & VpnUsage,
    // so Prisma/SQLite will automatically remove child rows.
    await db.vpnAccount.delete({ where: { id } });

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: "VPN_ACCOUNT_DELETE",
      resourceType: "VpnAccount",
      resourceId: id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        username: existing.username,
        customerId: existing.customerId,
        serverId: existing.serverId,
        protocolId: existing.protocolId,
        previousStatus: existing.status,
        cascadedCredentials: existing._count.credentials,
        cascadedUsage: existing._count.usage,
        hardDelete: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: { id, deleted: true, username: existing.username },
    });
  } catch (e: any) {
    console.error("VPN account delete error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
