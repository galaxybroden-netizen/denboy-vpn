// MVMP — Provisioner library: auto-provision N VPN accounts when a package is assigned
//
// When a customer buys "ALL ACCESS" (or any multi-protocol package), this library
// creates one Subscription + N VpnAccounts (one per protocol in the package) on the
// chosen server, plus N VpnCredentials and N provisioning Jobs.
//
// Used by:
//   - /api/payments/[id]/approve  → auto-provision when payment is approved
//   - /api/customers POST          → admin assigns package at customer creation
//   - /api/vpn-accounts/provision  → explicit re-provisioning endpoint (future)

import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { serialize } from "@/lib/utils-mvmp";
import { auditLog } from "@/lib/auth";
import { broadcast, REALTIME_EVENTS } from "@/lib/realtime";
import { sendWelcomeAccountEmail } from "@/lib/mailer";
import { buildCredentialFields } from "@/lib/credentials";

export interface ProvisionResult {
  subscriptionId: string;
  packageName: string;
  serverName: string;
  durationDays: number;
  expiresAt: Date;
  created: Array<{
    accountId: string;
    username: string;
    protocolKey: string;
    protocolName: string;
    jobId: string;
  }>;
  skipped: Array<{
    protocolKey: string;
    protocolName: string;
    reason: string;
  }>;
  totalCreated: number;
  totalSkipped: number;
}

export interface ProvisionOptions {
  /** Skip sending the welcome email (e.g., for bulk provisioning). Default: false. */
  skipEmail?: boolean;
  /** Override duration (days). Default: from package.durationDays. */
  durationDaysOverride?: number;
  /** Actor info for audit log */
  actorUserId?: string;
  actorType?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Provision a package for a customer — creates one Subscription + N VpnAccounts
 * (one per protocol in the package) on the chosen server, with credentials + jobs.
 *
 * Behavior:
 * - If the server doesn't have a protocol installed & RUNNING, that protocol is SKIPPED
 *   (counted in `skipped`), but the rest still get provisioned.
 * - Username is sequential: mvmp-XXXXX (5-digit padded, based on total account count).
 * - Credential type is currently UUID-based for all protocols (matches existing flow).
 *   Future enhancement: protocol-specific credential generation (cert for OpenVPN, etc.).
 */
export async function provisionPackageForCustomer(
  customerId: string,
  packageId: string,
  serverId: string,
  options: ProvisionOptions = {}
): Promise<ProvisionResult> {
  // 1. Validate inputs
  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    throw new Error("Customer tidak ditemukan");
  }

  const pkg = await db.package.findUnique({
    where: { id: packageId },
    include: {
      protocols: { include: { protocol: true } },
    },
  });
  if (!pkg) {
    throw new Error("Paket tidak ditemukan");
  }
  if (pkg.status !== "ACTIVE") {
    throw new Error(`Paket tidak aktif (status: ${pkg.status})`);
  }
  if (!pkg.protocols.length) {
    throw new Error("Paket tidak memiliki protokol terdaftar");
  }

  const server = await db.server.findUnique({
    where: { id: serverId },
    include: {
      protocols: { include: { protocol: true } },
    },
  });
  if (!server) {
    throw new Error("Server tidak ditemukan");
  }
  if (server.status !== "ONLINE") {
    throw new Error(`Server tidak online (status: ${server.status})`);
  }

  // Map of protocolId -> serverProtocol status (only RUNNING counts as available)
  const serverProtoMap = new Map<string, { status: string; installed: boolean }>();
  for (const sp of server.protocols) {
    serverProtoMap.set(sp.protocolId, {
      status: sp.status,
      installed: sp.status === "RUNNING" || sp.status === "INSTALLED",
    });
  }

  // 2. Compute duration & expiry
  const durationDays = options.durationDaysOverride ?? pkg.durationDays;
  const startsAt = new Date();
  const expiresAt = new Date(Date.now() + durationDays * 24 * 3600 * 1000);

  // 3. Create one Subscription (covers all accounts from this package)
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

  // 4. Get starting account counter (for sequential username generation)
  const existingAccountCount = await db.vpnAccount.count();
  let counter = existingAccountCount;

  const created: ProvisionResult["created"] = [];
  const skipped: ProvisionResult["skipped"] = [];

  // 5. Loop through protocols in the package — create one VPN account per protocol
  for (const pp of pkg.protocols) {
    const proto = pp.protocol;
    const serverProto = serverProtoMap.get(proto.id);

    if (!serverProto || !serverProto.installed) {
      skipped.push({
        protocolKey: proto.key,
        protocolName: proto.displayName,
        reason: !serverProto
          ? "Protokol tidak terinstal di server ini"
          : `Status: ${serverProto.status} (bukan RUNNING/INSTALLED)`,
      });
      continue;
    }

    counter += 1;
    const username = `mvmp-${String(counter).padStart(5, "0")}`;

    // Create VPN account (PENDING until agent provisions)
    const account = await db.vpnAccount.create({
      data: {
        customerId,
        subscriptionId: subscription.id,
        serverId,
        protocolId: proto.id,
        username,
        externalId: uuidv4(),
        status: "PENDING",
        quotaBytes: pkg.quotaBytes,
        maxDevices: pkg.maxDevices,
        expiresAt,
      },
    });

    // Create credential — UUID-based (matches existing single-account flow)
    // Future enhancement: protocol-specific credential types
    const credUuid = uuidv4();
    const credential = buildCredentialFields(credUuid);
    await db.vpnCredential.create({
      data: {
        vpnAccountId: account.id,
        credentialType: "uuid",
        ...credential,
        shownOnceAt: new Date(),
      },
    });

    // Create provisioning job for the agent
    const job = await db.job.create({
      data: {
        serverId,
        jobType: "account.create",
        payload: JSON.stringify({
          accountId: account.id,
          username,
          protocol: proto.key,
          engine: proto.engine,
        }),
        payloadHash: uuidv4().slice(0, 32),
        idempotencyKey: `idem-acct-${uuidv4().slice(0, 12)}`,
        status: "QUEUED",
        priority: 7,
      },
    });

    created.push({
      accountId: account.id,
      username,
      protocolKey: proto.key,
      protocolName: proto.displayName,
      jobId: job.id,
    });
  }

  // 6. Audit log
  if (options.actorUserId) {
    await auditLog({
      actorUserId: options.actorUserId,
      actorType: options.actorType || "USER",
      action: "PACKAGE_PROVISIONED",
      resourceType: "Subscription",
      resourceId: subscription.id,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      metadata: {
        customerId,
        customerName: customer.name,
        packageId,
        packageName: pkg.name,
        serverId,
        serverName: server.name,
        durationDays,
        totalCreated: created.length,
        totalSkipped: skipped.length,
        createdUsernames: created.map((c) => c.username),
        skippedProtocols: skipped.map((s) => s.protocolKey),
      },
    });
  }

  // 7. Realtime broadcast + welcome email (per created account)
  for (const c of created) {
    await broadcast(REALTIME_EVENTS.ACCOUNT_UPDATE, {
      action: "CREATED",
      accountId: c.accountId,
      username: c.username,
      server: server.name,
      protocol: c.protocolName,
    });
  }

  if (!options.skipEmail && created.length > 0) {
    // Send a single welcome email summarizing all created accounts
    try {
      await sendWelcomeAccountEmail({
        to: customer.email,
        customerName: customer.name,
        username: created[0].username, // primary account
        protocolName:
          created.length === 1
            ? created[0].protocolName
            : `${created.length} protokol (${pkg.name})`,
        serverName: server.name,
        expiresAt,
        relatedAccountId: created[0].accountId,
      });
    } catch (e) {
      // Email failure should not fail provisioning
      console.error("Welcome email error (non-fatal):", e);
    }
  }

  return {
    subscriptionId: subscription.id,
    packageName: pkg.name,
    serverName: server.name,
    durationDays,
    expiresAt,
    created,
    skipped,
    totalCreated: created.length,
    totalSkipped: skipped.length,
  };
}

/**
 * Serialize a ProvisionResult for safe JSON response (BigInt-safe).
 */
export function serializeProvisionResult(r: ProvisionResult) {
  return serialize({
    ...r,
    expiresAt: r.expiresAt.toISOString(),
  });
}
