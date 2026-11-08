// MVMP — Admin: Create VPN account (manual provisioning)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { broadcast, REALTIME_EVENTS } from "@/lib/realtime";
import { sendWelcomeAccountEmail } from "@/lib/mailer";
import { buildCredentialFields } from "@/lib/credentials";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
      { status: 401 }
    );
  }
  if (!hasPermission(user.role, "vpn_accounts.manage" as any)) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin" } },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { customerId, packageId, protocolId, serverId, durationDays = 30, notes } = body;

    if (!customerId || !packageId || !protocolId || !serverId) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "customerId, packageId, protocolId, serverId wajib diisi" } },
        { status: 400 }
      );
    }

    const pkg = await db.package.findUnique({ where: { id: packageId } });
    const server = await db.server.findUnique({ where: { id: serverId } });
    const proto = await db.protocol.findUnique({ where: { id: protocolId } });
    const customer = await db.customer.findUnique({ where: { id: customerId } });

    if (!pkg || !server || !proto || !customer) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Package/server/protocol/customer tidak ditemukan" } },
        { status: 404 }
      );
    }

    if (server.status !== "ONLINE") {
      return NextResponse.json(
        { success: false, error: { code: "SERVER_OFFLINE", message: "Server tidak online" } },
        { status: 400 }
      );
    }

    // Generate username (sequential)
    const existingCount = await db.vpnAccount.count();
    const username = `mvmp-${String(existingCount + 1).padStart(5, "0")}`;

    const startsAt = new Date();
    const expiresAt = new Date(Date.now() + durationDays * 24 * 3600 * 1000);

    // Create subscription
    const subscription = await db.subscription.create({
      data: {
        customerId,
        packageId,
        status: "ACTIVE",
        startsAt,
        expiresAt,
        quotaBytes: pkg.quotaBytes,
      },
    });

    // Create VPN account
    const account = await db.vpnAccount.create({
      data: {
        customerId,
        subscriptionId: subscription.id,
        serverId,
        protocolId,
        username,
        externalId: uuidv4(),
        status: "PENDING",
        quotaBytes: pkg.quotaBytes,
        maxDevices: pkg.maxDevices,
        expiresAt,
        notes: notes || null,
      },
    });

    // Create credential — AES-256-GCM at rest, masked display value
    const credentialSecret = uuidv4();
    const credential = buildCredentialFields(credentialSecret);
    await db.vpnCredential.create({
      data: {
        vpnAccountId: account.id,
        credentialType: "uuid",
        ...credential,
        shownOnceAt: new Date(),
      },
    });

    // Create provisioning job
    const job = await db.job.create({
      data: {
        serverId,
        jobType: "account.create",
        payload: JSON.stringify({ accountId: account.id, username, protocol: proto.key }),
        payloadHash: uuidv4().slice(0, 32),
        idempotencyKey: `idem-acct-${uuidv4().slice(0, 12)}`,
        status: "QUEUED",
        priority: 7,
      },
    });

    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: "VPN_ACCOUNT_CREATED",
      resourceType: "VpnAccount",
      resourceId: account.id,
      ipAddress: req.headers.get("x-forwarded-for") || undefined,
      userAgent: req.headers.get("user-agent") || undefined,
      metadata: { username, customerId, packageId, protocolId: proto.key, serverId },
    });

    // Realtime push + mock welcome email (Batch 3)
    await broadcast(REALTIME_EVENTS.ACCOUNT_UPDATE, {
      action: "CREATED",
      accountId: account.id,
      username,
      server: server.name,
      protocol: proto.name,
    });
    await sendWelcomeAccountEmail({
      to: customer.email,
      customerName: customer.name,
      username,
      protocolName: proto.name,
      serverName: server.name,
      expiresAt,
      relatedAccountId: account.id,
    });

    return NextResponse.json({
      success: true,
      data: serialize({
        account,
        subscription,
        jobId: job.id,
        // Returned once to the creating admin; not persisted in plaintext.
        credential: { publicValue: credentialSecret, shownOnce: true },
      }),
    });
  } catch (e: any) {
    console.error("Create VPN account error:", e);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
