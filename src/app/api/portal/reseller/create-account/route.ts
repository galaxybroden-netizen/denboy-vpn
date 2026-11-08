// MVMP — Reseller Portal: create VPN account for a customer (using reseller balance)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { broadcast, REALTIME_EVENTS } from "@/lib/realtime";
import { sendWelcomeAccountEmail } from "@/lib/mailer";
import { buildCredentialFields } from "@/lib/credentials";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }
    if (user.role !== "RESELLER") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Akses hanya untuk reseller" } },
        { status: 403 }
      );
    }

    const reseller = await db.reseller.findUnique({ where: { userId: user.id } });
    if (!reseller) {
      return NextResponse.json(
        { success: false, error: { code: "PROFILE_NOT_FOUND", message: "Profil reseller tidak ditemukan" } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { customerId, packageId, protocolId, preferredRegion } = body || {};

    if (!customerId || !packageId || !protocolId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Field wajib: customerId, packageId, protocolId" },
        },
        { status: 400 }
      );
    }

    // 1. Validate customer belongs to this reseller
    const customer = await db.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer || customer.resellerId !== reseller.id) {
      return NextResponse.json(
        { success: false, error: { code: "CUSTOMER_NOT_FOUND", message: "Customer tidak ditemukan di bawah reseller ini" } },
        { status: 404 }
      );
    }

    // 2. Validate package is ACTIVE & protocolId in package.protocols
    const pkg = await db.package.findUnique({
      where: { id: packageId },
      include: { protocols: true },
    });
    if (!pkg || pkg.status !== "ACTIVE") {
      return NextResponse.json(
        { success: false, error: { code: "PACKAGE_NOT_AVAILABLE", message: "Paket tidak tersedia" } },
        { status: 400 }
      );
    }
    if (!pkg.protocols.some((pp) => pp.protocolId === protocolId)) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "PROTOCOL_NOT_ALLOWED", message: "Protokol tidak tersedia untuk paket ini" },
        },
        { status: 400 }
      );
    }

    // 3. Check reseller.balance >= package.price
    if (reseller.balance < pkg.price) {
      return NextResponse.json(
        { success: false, error: { code: "INSUFFICIENT_BALANCE", message: "Saldo reseller tidak cukup" } },
        { status: 400 }
      );
    }

    // Find a suitable server — prefer one in preferredRegion that has the protocol, else any with the protocol
    const where: any = { protocols: { some: { protocolId } }, status: "ONLINE" };
    if (preferredRegion) {
      // Try preferred region first
      const preferred = await db.server.findFirst({
        where: { ...where, region: { contains: preferredRegion } },
        orderBy: { lastSeenAt: "desc" },
      });
      if (preferred) where.region = { contains: preferredRegion };
    }
    const server = await db.server.findFirst({
      where,
      orderBy: { lastSeenAt: "desc" },
    });
    if (!server) {
      return NextResponse.json(
        { success: false, error: { code: "NO_SERVER", message: "Tidak ada server tersedia untuk protokol tersebut" } },
        { status: 400 }
      );
    }

    const now = new Date();
    const newBalance = reseller.balance - pkg.price;

    // Run as a transaction so balance + ledger + records stay consistent
    const result = await db.$transaction(async (tx) => {
      // 4. Deduct reseller balance
      await tx.reseller.update({
        where: { id: reseller.id },
        data: { balance: newBalance },
      });

      // 4b. Ledger entry
      const ledgerEntry = await tx.resellerLedger.create({
        data: {
          resellerId: reseller.id,
          entryType: "DEBIT",
          amount: pkg.price,
          balanceAfter: newBalance,
          reference: `BUY-${customer.customerCode}`,
          description: "Pembelian paket untuk customer",
        },
      });

      // 5. Create Transaction (status=PAID, type=PURCHASE, paidAt=now)
      const txCount = await tx.transaction.count();
      const invoiceCounter = 1000 + txCount + 1;
      const invoiceNumber = `INV-${invoiceCounter}`;
      const idempotencyKey = `res-${reseller.id}-${customerId}-${packageId}-${Date.now()}`;

      const transaction = await tx.transaction.create({
        data: {
          customerId: customer.id,
          resellerId: reseller.id,
          invoiceNumber,
          type: "PURCHASE",
          amount: pkg.price,
          currency: pkg.currency,
          status: "PAID",
          idempotencyKey,
          paidAt: now,
        },
      });

      // Update ledger with transactionId linkage
      await tx.resellerLedger.update({
        where: { id: ledgerEntry.id },
        data: { transactionId: transaction.id },
      });

      // 6. Create Payment (status=PAID, provider=RESELLER_BALANCE)
      await tx.payment.create({
        data: {
          transactionId: transaction.id,
          provider: "RESELLER_BALANCE",
          paymentMethod: "RESELLER_BALANCE",
          amount: pkg.price,
          currency: pkg.currency,
          status: "PAID",
          paidAt: now,
        },
      });

      // 7. Create Subscription (startsAt=now, expiresAt=now+package.durationDays)
      const expiresAt = new Date(now.getTime() + pkg.durationDays * 24 * 3600 * 1000);
      const subscription = await tx.subscription.create({
        data: {
          customerId: customer.id,
          packageId: pkg.id,
          status: "ACTIVE",
          startsAt: now,
          expiresAt,
          quotaBytes: pkg.quotaBytes,
        },
      });

      // 8. Create VpnAccount (status=PENDING)
      const acctCount = await tx.vpnAccount.count();
      const username = `mvmp-${String(acctCount + 1).padStart(5, "0")}`;
      const vpnAccount = await tx.vpnAccount.create({
        data: {
          customerId: customer.id,
          subscriptionId: subscription.id,
          serverId: server.id,
          protocolId,
          username,
          externalId: uuidv4(),
          status: "PENDING",
          quotaBytes: pkg.quotaBytes,
          uploadBytes: 0n,
          downloadBytes: 0n,
          expiresAt,
          maxDevices: pkg.maxDevices,
        },
      });

      // 9. Create VpnCredential — AES-256-GCM at rest, masked display value
      const credential = buildCredentialFields(uuidv4());
      await tx.vpnCredential.create({
        data: {
          vpnAccountId: vpnAccount.id,
          credentialType: "uuid",
          ...credential,
          shownOnceAt: now,
        },
      });

      return { transaction, subscription, vpnAccount };
    });

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: "RESELLER_CREATE_VPN_ACCOUNT",
      resourceType: "VpnAccount",
      resourceId: result.vpnAccount.id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        resellerId: reseller.id,
        resellerCode: reseller.resellerCode,
        customerId: customer.id,
        customerCode: customer.customerCode,
        packageId: pkg.id,
        packageName: pkg.name,
        protocolId,
        amount: pkg.price,
        newBalance,
        invoiceNumber: result.transaction.invoiceNumber,
        serverId: server.id,
        serverName: server.name,
        username: result.vpnAccount.username,
      },
    });

    // Batch 3: realtime push + mock welcome email
    await broadcast(REALTIME_EVENTS.ACCOUNT_UPDATE, {
      action: "CREATED",
      accountId: result.vpnAccount.id,
      username: result.vpnAccount.username,
      server: server.name,
      protocol: pkg.name,
      byReseller: reseller.resellerCode,
    });
    await sendWelcomeAccountEmail({
      to: customer.email,
      customerName: customer.name,
      username: result.vpnAccount.username,
      protocolName: pkg.name,
      serverName: server.name,
      expiresAt: result.subscription.expiresAt,
      relatedAccountId: result.vpnAccount.id,
    });

    return NextResponse.json(
      {
        success: true,
        data: serialize({
          transaction: result.transaction,
          subscription: result.subscription,
          vpnAccount: result.vpnAccount,
        }),
      },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("Reseller create-account error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
