// MVMP — Reseller Portal: my-customers (list + create)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import bcrypt from "bcryptjs";

// GET — list reseller's customers with pagination + search
export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const search = searchParams.get("search")?.trim() || "";
    const statusParam = searchParams.get("status")?.trim().toUpperCase() || "ALL";

    const where: any = { resellerId: reseller.id };
    if (statusParam && statusParam !== "ALL") where.status = statusParam;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { customerCode: { contains: search } },
      ];
    }

    const [total, items] = await Promise.all([
      db.customer.count({ where }),
      db.customer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, email: true, phone: true, lastLoginAt: true, status: true } },
          _count: { select: { vpnAccounts: true, transactions: true } },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: serialize({
        items,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      }),
    });
  } catch (e: any) {
    console.error("Reseller my-customers GET error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

// POST — create a new customer under this reseller
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
    const { name, email, phone, password } = body || {};

    if (!name || !email || !password) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Field wajib: name, email, password" },
        },
        { status: 400 }
      );
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    // 1. Validate email not already used
    const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: "EMAIL_TAKEN", message: "Email sudah terdaftar" } },
        { status: 400 }
      );
    }

    // 4. Check reseller accountLimit not exceeded
    const customersCount = await db.customer.count({ where: { resellerId: reseller.id } });
    if (customersCount >= reseller.accountLimit) {
      return NextResponse.json(
        { success: false, error: { code: "LIMIT_EXCEEDED", message: "Limit akun reseller penuh" } },
        { status: 400 }
      );
    }

    // 2. Create User with role=CUSTOMER
    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await db.user.create({
      data: {
        email: normalizedEmail,
        username: normalizedEmail.split("@")[0] + "_" + Math.random().toString(36).slice(2, 8),
        name,
        passwordHash,
        role: "CUSTOMER",
        status: "ACTIVE",
        phone: phone || null,
        emailVerifiedAt: new Date(),
      },
    });

    // Generate customerCode (count-based)
    const custCount = await db.customer.count();
    const customerCode = `CUST-${String(custCount + 1).padStart(4, "0")}`;

    // 3. Create Customer with resellerId = current reseller.id
    const newCustomer = await db.customer.create({
      data: {
        userId: newUser.id,
        resellerId: reseller.id,
        customerCode,
        name,
        email: normalizedEmail,
        phone: phone || null,
        status: "ACTIVE",
      },
      include: {
        user: { select: { id: true, email: true, phone: true, lastLoginAt: true, status: true } },
        _count: { select: { vpnAccounts: true, transactions: true } },
      },
    });

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: "RESELLER_CREATE_CUSTOMER",
      resourceType: "Customer",
      resourceId: newCustomer.id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        resellerId: reseller.id,
        resellerCode: reseller.resellerCode,
        customerEmail: normalizedEmail,
        customerCode,
      },
    });

    return NextResponse.json(
      { success: true, data: serialize(newCustomer) },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("Reseller my-customers POST error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
