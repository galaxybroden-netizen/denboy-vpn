// MVMP — Resellers list
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import bcrypt from "bcryptjs";

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }
    if (!hasPermission(user.role, "resellers.view")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melihat reseller" } },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status")?.trim();

    const where: any = {};
    // Default: hide soft-deleted resellers unless explicitly requested via status filter
    if (status) {
      where.status = status;
    } else {
      where.status = { not: "DELETED" };
    }
    if (search) {
      where.OR = [
        { resellerCode: { contains: search } },
        { user: { name: { contains: search } } },
        { user: { email: { contains: search } } },
      ];
    }

    const [total, items] = await Promise.all([
      db.reseller.count({ where }),
      db.reseller.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, email: true, phone: true, name: true, status: true, lastLoginAt: true } },
          _count: {
            select: {
              customers: true,
              transactions: { where: { status: "PAID" } },
            },
          },
        },
      }),
    ]);

    const data = items.map((r) => ({
      ...r,
      remainingSlots: Math.max(0, r.accountLimit - r._count.customers),
    }));

    return NextResponse.json({
      success: true,
      data: serialize({
        items: data,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      }),
    });
  } catch (e: any) {
    console.error("Resellers list error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

// POST — admin creates a new reseller (with portal login account)
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }
    if (!hasPermission(user.role, "resellers.manage")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin mengelola reseller" } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name, email, phone, password, commissionRate, accountLimit, parentResellerId } = body || {};

    if (!name || !email || !password) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Field wajib: name, email, password" } },
        { status: 400 }
      );
    }
    if (String(password).length < 8) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Password minimal 8 karakter" } },
        { status: 400 }
      );
    }

    const rate = Number(commissionRate ?? 10);
    const limit = Number(accountLimit ?? 50);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Komisi harus 0-100 (%)" } },
        { status: 400 }
      );
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: "EMAIL_TAKEN", message: "Email sudah terdaftar" } },
        { status: 400 }
      );
    }

    let validParentId: string | null = null;
    if (parentResellerId) {
      const parent = await db.reseller.findUnique({ where: { id: parentResellerId } });
      if (!parent) {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: "Reseller induk tidak ditemukan" } },
          { status: 400 }
        );
      }
      validParentId = parent.id;
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const newUser = await db.user.create({
      data: {
        email: normalizedEmail,
        username: normalizedEmail.split("@")[0] + "_" + Math.random().toString(36).slice(2, 8),
        name,
        passwordHash,
        role: "RESELLER",
        status: "ACTIVE",
        phone: phone || null,
        emailVerifiedAt: new Date(),
      },
    });

    const resCount = await db.reseller.count();
    let resellerCode = `RES-${String(resCount + 1).padStart(4, "0")}`;
    if (await db.reseller.findUnique({ where: { resellerCode } })) {
      resellerCode = `RES-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    }

    const newReseller = await db.reseller.create({
      data: {
        userId: newUser.id,
        resellerCode,
        parentResellerId: validParentId,
        status: "ACTIVE",
        commissionRate: rate,
        accountLimit: limit,
        balance: 0,
      },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, lastLoginAt: true } },
        _count: { select: { customers: true, transactions: true } },
      },
    });

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: "CREATE_RESELLER",
      resourceType: "Reseller",
      resourceId: newReseller.id,
      ipAddress: ip,
      userAgent: ua,
      metadata: { resellerCode, resellerEmail: normalizedEmail, commissionRate: rate, accountLimit: limit },
    });

    return NextResponse.json(
      { success: true, data: serialize(newReseller) },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("Reseller create error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
