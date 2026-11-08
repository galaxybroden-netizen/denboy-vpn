// MVMP — Servers list & create
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { v4 as uuidv4 } from "uuid";

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }
    if (!hasPermission(user.role, "servers.view")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melihat server" } },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status")?.trim();
    const region = searchParams.get("region")?.trim();

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { hostname: { contains: search } },
        { publicIp: { contains: search } },
      ];
    }
    // Default: hide soft-deleted (DECOMMISSIONED) servers unless explicitly requested
    if (status) {
      where.status = status;
    } else {
      where.status = { not: "DECOMMISSIONED" };
    }
    if (region) where.region = region;

    const [total, servers] = await Promise.all([
      db.server.count({ where }),
      db.server.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          agent: { select: { id: true, status: true, lastHeartbeatAt: true, agentVersion: true } },
          group: { select: { id: true, name: true } },
          _count: {
            select: { vpnAccounts: { where: { status: "ACTIVE" } } },
          },
        },
      }),
    ]);

    // Attach latest metric per server
    const serverIds = servers.map((s) => s.id);
    const latestMetrics = await db.serverMetric.findMany({
      where: { serverId: { in: serverIds } },
      orderBy: { recordedAt: "desc" },
    });
    const metricByServer = new Map<string, (typeof latestMetrics)[number]>();
    for (const m of latestMetrics) {
      if (!metricByServer.has(m.serverId)) metricByServer.set(m.serverId, m);
    }
    const data = servers.map((s) => ({
      ...s,
      latestMetric: metricByServer.get(s.id) || null,
    }));

    return NextResponse.json({
      success: true,
      data: serialize({
        items: data,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      }),
    });
  } catch (e: any) {
    console.error("Servers list error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }
    if (!hasPermission(user.role, "servers.manage")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin menambah server" } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      name, hostname, publicIp, region, countryCode, provider,
      cpuCores, ramTotalBytes, diskTotalBytes, sshPort, maxAccounts,
      monthlyCost, osVersion, groupId, privateIp,
    } = body || {};

    if (!name || !hostname || !publicIp || !region || !countryCode) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Field wajib: name, hostname, publicIp, region, countryCode" } },
        { status: 400 }
      );
    }

    const ram = BigInt(
      typeof ramTotalBytes === "string" ? ramTotalBytes : String(ramTotalBytes ?? 0)
    );
    const disk = BigInt(
      typeof diskTotalBytes === "string" ? diskTotalBytes : String(diskTotalBytes ?? 0)
    );

    const server = await db.server.create({
      data: {
        name,
        hostname,
        publicIp,
        privateIp: privateIp || null,
        region,
        countryCode,
        provider: provider || "OVH",
        cpuCores: Number(cpuCores) || 1,
        ramTotalBytes: ram,
        diskTotalBytes: disk,
        sshPort: Number(sshPort) || 22,
        maxAccounts: Number(maxAccounts) || 100,
        monthlyCost: Number(monthlyCost) || 0,
        osVersion: osVersion || "22.04 LTS",
        groupId: groupId || null,
        status: "PENDING",
      },
      include: {
        group: { select: { id: true, name: true } },
      },
    });

    // Provision agent record (offline until first heartbeat)
    await db.serverAgent.create({
      data: {
        serverId: server.id,
        agentId: `agent-${uuidv4()}`,
        status: "OFFLINE",
      },
    });

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role,
      action: "SERVER_CREATE",
      resourceType: "Server",
      resourceId: server.id,
      ipAddress: ip,
      userAgent: ua,
      metadata: { name: server.name, hostname: server.hostname, publicIp: server.publicIp },
    });

    return NextResponse.json({ success: true, data: serialize(server) }, { status: 201 });
  } catch (e: any) {
    console.error("Server create error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
