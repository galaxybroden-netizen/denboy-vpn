// MVMP — Customer Portal: buy package (creates pending transaction + payment + invoice)
// When payment is later approved, /api/payments/[id]/approve auto-provisions N VPN
// accounts (one per protocol in the package) on the chosen server via the provisioner.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { notifyAdmins } from "@/lib/notify";
import { broadcast, REALTIME_EVENTS } from "@/lib/realtime";

const QRIS_PLACEHOLDER =
  "00020101021226670016ID.CO.QRIS.WWW01189360091400123456780215MVMP-STORE0303UMI51440014ID.CO.QRIS.WWW0216ID123456789012303UMI51440015ID.CO.QRIS.WWW0303UMI5204599953033605802ID5910MVMP STORE6007Jakarta61051234062160512MVMP-INV-XXXX0724";

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }
    if (user.role !== "CUSTOMER") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Akses hanya untuk customer" } },
        { status: 403 }
      );
    }

    const customer = await db.customer.findUnique({ where: { userId: user.id } });
    if (!customer) {
      return NextResponse.json(
        { success: false, error: { code: "PROFILE_NOT_FOUND", message: "Profil customer tidak ditemukan" } },
        { status: 403 }
      );
    }

    const body = await req.json();
    // protocolId is now OPTIONAL — when omitted, ALL protocols in the package will be
    // auto-provisioned (one account per protocol) when the payment is approved.
    const { packageId, paymentMethod, serverId, protocolId } = body || {};

    if (!packageId || !paymentMethod || !serverId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Field wajib: packageId, serverId, paymentMethod" },
        },
        { status: 400 }
      );
    }

    if (paymentMethod !== "QRIS" && paymentMethod !== "BANK_TRANSFER") {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "paymentMethod harus QRIS atau BANK_TRANSFER" },
        },
        { status: 400 }
      );
    }

    // Validate package exists & ACTIVE
    const pkg = await db.package.findUnique({
      where: { id: packageId },
      include: { protocols: { include: { protocol: true } } },
    });

    if (!pkg || pkg.status !== "ACTIVE") {
      return NextResponse.json(
        { success: false, error: { code: "PACKAGE_NOT_AVAILABLE", message: "Paket tidak tersedia" } },
        { status: 400 }
      );
    }

    if (!pkg.protocols.length) {
      return NextResponse.json(
        { success: false, error: { code: "PACKAGE_EMPTY", message: "Paket tidak memiliki protokol terdaftar" } },
        { status: 400 }
      );
    }

    // Validate server exists & ONLINE
    const server = await db.server.findUnique({ where: { id: serverId } });
    if (!server) {
      return NextResponse.json(
        { success: false, error: { code: "SERVER_NOT_FOUND", message: "Server tidak ditemukan" } },
        { status: 404 }
      );
    }
    if (server.status !== "ONLINE") {
      return NextResponse.json(
        { success: false, error: { code: "SERVER_OFFLINE", message: "Server tidak online" } },
        { status: 400 }
      );
    }

    // If protocolId is provided (advanced mode), validate it belongs to the package
    if (protocolId) {
      const protocolInPackage = pkg.protocols.some((pp) => pp.protocolId === protocolId);
      if (!protocolInPackage) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "PROTOCOL_NOT_ALLOWED", message: "Protokol tidak tersedia untuk paket ini" },
          },
          { status: 400 }
        );
      }
    }

    // For premium packages (any protocol marked isPremium), require prior paid transaction
    const hasPremiumProto = pkg.protocols.some((pp) => pp.protocol.isPremium);
    const hasPaidTx = await db.transaction.count({
      where: { customerId: customer.id, status: "PAID" },
    });
    if (hasPremiumProto && hasPaidTx === 0) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_ELIGIBLE", message: "Paket premium hanya untuk customer dengan riwayat pembayaran" },
        },
        { status: 400 }
      );
    }

    const now = new Date();
    // Generate invoice number (counter based on count of existing transactions)
    const txCount = await db.transaction.count();
    const invoiceCounter = 1000 + txCount + 1;
    const invoiceNumber = `INV-${invoiceCounter}`;
    const idempotencyKey = `buy-${customer.id}-${packageId}-${Date.now()}`;

    // Create Transaction — store packageId & serverId so approve endpoint can auto-provision
    const transaction = await db.transaction.create({
      data: {
        customerId: customer.id,
        packageId,
        serverId,
        invoiceNumber,
        type: "PURCHASE",
        amount: pkg.price,
        currency: pkg.currency,
        status: "PENDING",
        idempotencyKey,
      },
    });

    // Create Payment
    let paymentData: any = {
      transactionId: transaction.id,
      paymentMethod,
      amount: pkg.price,
      currency: pkg.currency,
      status: "PENDING",
    };
    if (paymentMethod === "QRIS") {
      paymentData.provider = "QRIS";
      paymentData.qrisData = QRIS_PLACEHOLDER.replace("INV-XXXX", invoiceNumber);
      paymentData.expiresAt = new Date(now.getTime() + 24 * 3600 * 1000);
    } else {
      // BANK_TRANSFER
      paymentData.provider = "MANUAL";
      const random4 = Math.floor(1000 + Math.random() * 9000);
      paymentData.vaNumber = `8800${invoiceCounter}${random4}`;
      paymentData.expiresAt = new Date(now.getTime() + 24 * 3600 * 1000);
    }
    const payment = await db.payment.create({ data: paymentData });

    // Create Invoice
    const invoice = await db.invoice.create({
      data: {
        transactionId: transaction.id,
        invoiceNumber,
        issuedAt: now,
        dueAt: new Date(now.getTime() + 24 * 3600 * 1000),
      },
    });

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: "CUSTOMER_PURCHASE",
      resourceType: "Transaction",
      resourceId: transaction.id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        customerId: customer.id,
        packageId: pkg.id,
        packageName: pkg.name,
        serverId,
        serverName: server.name,
        protocolId: protocolId || null,
        protocolMode: protocolId ? "single" : "all-in-package",
        paymentMethod,
        amount: pkg.price,
        invoiceNumber,
      },
    });

    // Batch 3: realtime push — admins get an instant toast + payments list refresh
    await broadcast(REALTIME_EVENTS.PAYMENT_UPDATE, {
      action: "NEW_PENDING",
      transactionId: transaction.id,
      invoiceNumber,
      amount: pkg.price,
      currency: pkg.currency,
      customer: customer.name,
    });
    await notifyAdmins({
      type: "WARNING",
      title: "Pembelian baru menunggu verifikasi",
      body: `${customer.name} membeli ${pkg.name} (${invoiceNumber}) — menunggu pembayaran.`,
      data: { transactionId: transaction.id, invoiceNumber },
    });

    return NextResponse.json(
      {
        success: true,
        data: serialize({
          transaction: { ...transaction, invoiceNumber },
          payment,
          invoice,
          package: { id: pkg.id, name: pkg.name, durationDays: pkg.durationDays },
          server: { id: server.id, name: server.name },
        }),
      },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("Customer buy error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
