// MVMP — Reseller Portal: topup request (pending admin verification)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";

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
    const { amount, method, proofNote } = body || {};

    if (!amount || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Amount harus berupa angka positif" },
        },
        { status: 400 }
      );
    }
    if (method !== "BANK_TRANSFER" && method !== "QRIS") {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Method harus BANK_TRANSFER atau QRIS" },
        },
        { status: 400 }
      );
    }

    // Record as ledger entry (entryType=CREDIT_PENDING). Balance NOT credited.
    const ledgerEntry = await db.resellerLedger.create({
      data: {
        resellerId: reseller.id,
        entryType: "CREDIT_PENDING",
        amount,
        balanceAfter: reseller.balance, // unchanged
        reference: `TOPUP-${Date.now()}`,
        description: `Topup saldo via ${method}${proofNote ? ` - ${proofNote}` : ""} - menunggu verifikasi admin`,
      },
    });

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: "RESELLER_TOPUP_REQUEST",
      resourceType: "ResellerLedger",
      resourceId: ledgerEntry.id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        resellerId: reseller.id,
        resellerCode: reseller.resellerCode,
        amount,
        method,
        proofNote: proofNote || null,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: serialize({
          ledgerEntry,
          message: "Topup dicatat, menunggu verifikasi admin",
        }),
      },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("Reseller topup error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
