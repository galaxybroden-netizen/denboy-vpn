// MVMP — Server map data (geographic distribution of VPN servers)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";

// Hardcoded lat/lng mapping by region & country code.
// Lookup tries region (case-insensitive, contains keyword) then countryCode.
const REGION_COORDS: { lat: number; lng: number; keys: string[] }[] = [
  { lat: 1.3521, lng: 103.8198, keys: ["singapore", "sg"] },
  { lat: -6.2088, lng: 106.8456, keys: ["jakarta", "indonesia", "id"] },
  { lat: 34.0522, lng: -118.2437, keys: ["los angeles", "us west", "us-west"] },
  { lat: 40.7128, lng: -74.006, keys: ["new york", "us east", "us-east"] },
  { lat: 52.3676, lng: 4.9041, keys: ["amsterdam", "netherlands", "nl"] },
  { lat: 50.1109, lng: 8.6821, keys: ["frankfurt", "germany", "de"] },
  { lat: 35.6762, lng: 139.6503, keys: ["tokyo", "japan", "jp"] },
  { lat: 22.3193, lng: 114.1694, keys: ["hong kong", "hk"] },
  { lat: 19.076, lng: 72.8777, keys: ["mumbai", "india", "in"] },
];

function coordsFor(region: string, countryCode: string): { lat: number; lng: number } {
  const regionLower = (region || "").toLowerCase();
  const codeLower = (countryCode || "").toLowerCase();
  for (const c of REGION_COORDS) {
    for (const k of c.keys) {
      if (regionLower.includes(k) || codeLower === k) return { lat: c.lat, lng: c.lng };
    }
  }
  return { lat: 0, lng: 0 };
}

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" },
        },
        { status: 401 }
      );
    }

    const servers = await db.server.findMany({
      include: {
        agent: {
          select: {
            id: true,
            status: true,
            lastHeartbeatAt: true,
            agentVersion: true,
          },
        },
        protocols: { select: { id: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Latest metric per server (for activeAccounts / bandwidth)
    const serverIds = servers.map((s) => s.id);
    const latestMetrics = await db.serverMetric.findMany({
      where: { serverId: { in: serverIds } },
      orderBy: { recordedAt: "desc" },
    });
    const metricByServer = new Map<string, (typeof latestMetrics)[number]>();
    for (const m of latestMetrics) {
      if (!metricByServer.has(m.serverId)) metricByServer.set(m.serverId, m);
    }

    const items = servers.map((s) => {
      const { lat, lng } = coordsFor(s.region, s.countryCode);
      const metric = metricByServer.get(s.id);
      const protocolsRunning = s.protocols.filter(
        (p) => p.status === "RUNNING"
      ).length;
      return {
        id: s.id,
        name: s.name,
        hostname: s.hostname,
        publicIp: s.publicIp,
        region: s.region,
        countryCode: s.countryCode,
        status: s.status,
        provider: s.provider,
        cpuCores: s.cpuCores,
        ramTotalBytes: s.ramTotalBytes,
        maxAccounts: s.maxAccounts,
        lastSeenAt: s.lastSeenAt,
        agentStatus: s.agent?.status ?? "OFFLINE",
        agentVersion: s.agent?.agentVersion ?? null,
        lastHeartbeatAt: s.agent?.lastHeartbeatAt ?? null,
        protocolsRunning,
        activeAccounts: metric?.activeAccounts ?? 0,
        lat,
        lng,
      };
    });

    return NextResponse.json({
      success: true,
      data: serialize({ items }),
    });
  } catch (e: any) {
    console.error("Server map error:", e?.message);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL", message: "Terjadi kesalahan server" },
      },
      { status: 500 }
    );
  }
}
