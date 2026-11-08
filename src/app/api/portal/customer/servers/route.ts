// MVMP — Customer Portal: list of ONLINE servers (for "Beli Paket" dropdown)
// Returns a minimal, customer-safe list: only ONLINE servers, no admin fields
// (no SSH port, no monthlyCost, no agent details, no internal IPs).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";

export async function GET(req: NextRequest) {
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

    const servers = await db.server.findMany({
      where: { status: "ONLINE" },
      orderBy: [{ region: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        hostname: true,
        publicIp: true,
        region: true,
        countryCode: true,
        provider: true,
        osName: true,
        status: true,
        // Count how many protocols are RUNNING on this server (so customer knows
        // which servers can fully provision an ALL ACCESS package)
        protocols: {
          where: { status: { in: ["RUNNING", "INSTALLED"] } },
          select: { protocolId: true, status: true },
        },
      },
    });

    // Simplify the protocols array to a count + list of installed protocol IDs
    const items = servers.map((s) => ({
      id: s.id,
      name: s.name,
      hostname: s.hostname,
      publicIp: s.publicIp,
      region: s.region,
      countryCode: s.countryCode,
      provider: s.provider,
      osName: s.osName,
      status: s.status,
      installedProtocolCount: s.protocols.length,
      installedProtocolIds: s.protocols.map((sp) => sp.protocolId),
    }));

    return NextResponse.json({
      success: true,
      data: serialize({ items, total: items.length }),
    });
  } catch (e: any) {
    console.error("Customer servers list error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
