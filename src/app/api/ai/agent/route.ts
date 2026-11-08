// MVMP — AI Agent chat endpoint (admin assistant with tool use)
// POST — body: { message, conversationId? }
//   1. Load AIAgent config (system prompt, allowed tools, permission level, isActive)
//   2. If agent not active → return error "AI Agent belum diaktifkan"
//   3. Load agent tools from DB (AIAgentTool where isActive=true)
//   4. Build messages: system prompt + tool descriptions + user message
//   5. For read-only tools, execute them directly (query DB for server status,
//      VPN search, etc.) and include results in context.
//   6. Call chatCompletion() with feature="agent"
//   7. Track usage (chatCompletion already writes AIUsage)
//   8. Return response + which tools were used
//
// Tool execution is handled by `executeTool(toolKey, params)` which queries the
// DB based on the tool key. Read-only tools run directly; destructive tools are
// reported as "requires approval" and NOT executed by this endpoint.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";
import { chatCompletion } from "@/lib/ai-provider";

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

interface ToolResult {
  toolKey: string;
  toolName: string;
  status: "success" | "no_data" | "requires_approval" | "error";
  data: any;
  error?: string;
}

/**
 * Execute a single tool by key. Read-only tools query the DB directly and
 * return structured data. Destructive tools return `requires_approval` — they
 * must go through the AIExecution approval workflow, not this endpoint.
 *
 * `params` is an optional bag (e.g. `{ search: "user@example.com" }`) extracted
 * from the user message by the dispatcher.
 */
async function executeTool(
  toolKey: string,
  toolName: string,
  isDestructive: boolean,
  params: Record<string, any> = {}
): Promise<ToolResult> {
  if (isDestructive) {
    return {
      toolKey,
      toolName,
      status: "requires_approval",
      data: null,
      error: "Tool memerlukan persetujuan — eksekusi tidak dijalankan langsung oleh AI Agent.",
    };
  }

  try {
    switch (toolKey) {
      // --- Server tools ---
      case "server.status": {
        const servers = await db.server.findMany({
          where: { status: { not: "DECOMMISSIONED" } },
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            agent: {
              select: {
                id: true,
                status: true,
                lastHeartbeatAt: true,
                agentVersion: true,
              },
            },
            _count: { select: { vpnAccounts: true } },
          },
        });

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
          id: s.id,
          name: s.name,
          hostname: s.hostname,
          publicIp: s.publicIp,
          region: s.region,
          countryCode: s.countryCode,
          status: s.status,
          maintenanceMode: s.maintenanceMode,
          lastSeenAt: s.lastSeenAt,
          agent: s.agent,
          vpnAccountCount: s._count.vpnAccounts,
          latestMetric: metricByServer.get(s.id) || null,
        }));

        return {
          toolKey,
          toolName,
          status: data.length ? "success" : "no_data",
          data: { count: data.length, servers: data },
        };
      }

      case "server.metrics": {
        const servers = await db.server.findMany({
          where: { status: { not: "DECOMMISSIONED" } },
          orderBy: { name: "asc" },
          take: 50,
          include: {
            agent: {
              select: { status: true, lastHeartbeatAt: true },
            },
            metrics: {
              orderBy: { recordedAt: "desc" },
              take: 5, // last 5 metric samples per server
            },
          },
        });

        const data = servers.map((s) => ({
          id: s.id,
          name: s.name,
          publicIp: s.publicIp,
          region: s.region,
          status: s.status,
          agentStatus: s.agent?.status ?? null,
          latestMetric: s.metrics[0] ?? null,
          recentMetrics: s.metrics,
        }));

        return {
          toolKey,
          toolName,
          status: data.length ? "success" : "no_data",
          data: { count: data.length, servers: data },
        };
      }

      // --- VPN tools ---
      case "vpn.search": {
        const search = String(params.search || "").trim();
        const where: any = {};
        if (search) {
          where.OR = [
            { username: { contains: search, mode: "insensitive" } },
            { externalId: { contains: search, mode: "insensitive" } },
            { notes: { contains: search, mode: "insensitive" } },
            { customer: { name: { contains: search, mode: "insensitive" } } },
            { customer: { email: { contains: search, mode: "insensitive" } } },
          ];
        }
        const accounts = await db.vpnAccount.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            customer: { select: { id: true, name: true, email: true, customerCode: true } },
            server: { select: { id: true, name: true, region: true, countryCode: true } },
            protocol: { select: { id: true, key: true, displayName: true } },
          },
        });
        const data = accounts.map((a) => ({
          id: a.id,
          username: a.username,
          status: a.status,
          expiresAt: a.expiresAt,
          uploadBytes: a.uploadBytes,
          downloadBytes: a.downloadBytes,
          maxDevices: a.maxDevices,
          customer: a.customer,
          server: a.server,
          protocol: a.protocol,
        }));

        return {
          toolKey,
          toolName,
          status: data.length ? "success" : "no_data",
          data: { count: data.length, search: search || null, accounts: data },
        };
      }

      case "vpn.account.status": {
        const id = String(params.id || params.vpnAccountId || "").trim();
        const username = String(params.username || "").trim();
        if (!id && !username) {
          return {
            toolKey,
            toolName,
            status: "error",
            data: null,
            error: "Parameter wajib: id atau username",
          };
        }
        const where: any = id ? { id } : { username };
        const account = await db.vpnAccount.findUnique({
          where,
          include: {
            customer: { select: { id: true, name: true, email: true, customerCode: true } },
            server: { select: { id: true, name: true, region: true, countryCode: true, status: true } },
            protocol: { select: { id: true, key: true, displayName: true } },
          },
        });
        if (!account) {
          return { toolKey, toolName, status: "no_data", data: null };
        }
        return { toolKey, toolName, status: "success", data: account };
      }

      // --- Transaction analyze ---
      case "transaction.analyze": {
        const total = await db.transaction.count();
        const byStatus = await db.transaction.groupBy({
          by: ["status"],
          _count: { _all: true },
          _sum: { amount: true },
        });
        const sumAgg = await db.transaction.aggregate({
          _sum: { amount: true },
          _avg: { amount: true },
        });
        return {
          toolKey,
          toolName,
          status: total ? "success" : "no_data",
          data: {
            totalTransactions: total,
            sumAmountAll: sumAgg._sum.amount ?? 0,
            avgAmount: sumAgg._avg.amount ?? 0,
            byStatus: byStatus.map((g) => ({
              status: g.status,
              count: g._count._all,
              sumAmount: g._sum.amount ?? 0,
            })),
          },
        };
      }

      // --- Subscription analyze ---
      case "subscription.analyze": {
        const total = await db.subscription.count();
        const byStatus = await db.subscription.groupBy({
          by: ["status"],
          _count: { _all: true },
        });
        const activeCount = byStatus.find((g) => g.status === "ACTIVE")?._count._all ?? 0;
        const expiredCount = byStatus.find((g) => g.status === "EXPIRED")?._count._all ?? 0;
        return {
          toolKey,
          toolName,
          status: total ? "success" : "no_data",
          data: {
            totalSubscriptions: total,
            activeCount,
            expiredCount,
            byStatus: byStatus.map((g) => ({ status: g.status, count: g._count._all })),
          },
        };
      }

      // --- Reseller analyze ---
      case "reseller.analyze": {
        const total = await db.reseller.count();
        const byStatus = await db.reseller.groupBy({
          by: ["status"],
          _count: { _all: true },
        });
        const balanceAgg = await db.reseller.aggregate({
          _sum: { balance: true },
          _avg: { balance: true, commissionRate: true },
        });
        return {
          toolKey,
          toolName,
          status: total ? "success" : "no_data",
          data: {
            totalResellers: total,
            totalBalance: balanceAgg._sum.balance ?? 0,
            avgBalance: balanceAgg._avg.balance ?? 0,
            avgCommissionRate: balanceAgg._avg.commissionRate ?? 0,
            byStatus: byStatus.map((g) => ({ status: g.status, count: g._count._all })),
          },
        };
      }

      // --- System health ---
      case "system.health": {
        const [
          serverCount,
          activeServerCount,
          vpnAccountCount,
          activeVpnCount,
          transactionCount,
          customerCount,
          resellerCount,
          subscriptionCount,
        ] = await Promise.all([
          db.server.count({ where: { status: { not: "DECOMMISSIONED" } } }),
          db.server.count({ where: { status: "ONLINE" } }),
          db.vpnAccount.count(),
          db.vpnAccount.count({ where: { status: "ACTIVE" } }),
          db.transaction.count(),
          db.customer.count(),
          db.reseller.count(),
          db.subscription.count({ where: { status: "ACTIVE" } }),
        ]);

        return {
          toolKey,
          toolName,
          status: "success",
          data: {
            servers: { total: serverCount, online: activeServerCount },
            vpnAccounts: { total: vpnAccountCount, active: activeVpnCount },
            transactions: { total: transactionCount },
            customers: { total: customerCount },
            resellers: { total: resellerCount },
            subscriptions: { active: subscriptionCount },
            checkedAt: new Date().toISOString(),
          },
        };
      }

      default:
        return {
          toolKey,
          toolName,
          status: "error",
          data: null,
          error: `Tool "${toolKey}" tidak dikenali`,
        };
    }
  } catch (e: any) {
    return {
      toolKey,
      toolName,
      status: "error",
      data: null,
      error: e?.message || "Unknown error executing tool",
    };
  }
}

/**
 * Decide which read-only tools are relevant to the user's message.
 * Falls back to ["system.health"] when no specific intent is detected so the
 * agent always has some baseline context to reason about.
 */
function pickRelevantTools(message: string): string[] {
  const msg = (message || "").toLowerCase();
  const picked = new Set<string>();

  if (/\b(server|infra|node|vps|hardware)\b/.test(msg)) picked.add("server.status");
  if (/\b(metric|perform|cpu|ram|disk|load|bandwidth|traffic)\b/.test(msg)) picked.add("server.metrics");
  if (/\b(vpn|akun vpn|akun tunnel)\b/.test(msg) && /\b(cari|search|cari akun|list akun|daftar akun|siapa)\b/.test(msg)) {
    picked.add("vpn.search");
  } else if (/\b(vpn|akun vpn)\b/.test(msg)) {
    // For other VPN questions, default to search with empty params (lists recent)
    picked.add("vpn.search");
  }
  if (/\b(transaksi|transaction|payment|pembayaran|invoice|penjualan)\b/.test(msg)) picked.add("transaction.analyze");
  if (/\b(subscription|langganan|paket aktif|subs)\b/.test(msg)) picked.add("subscription.analyze");
  if (/\b(reseller|agen|distributor)\b/.test(msg)) picked.add("reseller.analyze");
  if (/\b(health|sistem|status sistem|overall|kesehatan|overview|ringkasan)\b/.test(msg)) picked.add("system.health");

  // Always include system.health as baseline context
  picked.add("system.health");

  return [...picked];
}

/**
 * Try to extract a search term from the message for vpn.search.
 * Heuristic: take the word(s) after "cari"/"search"/"untuk" up to the next stop word.
 */
function extractSearchTerm(message: string): string {
  const m = message.match(/(?:cari|search|cari akun|untuk|akun)\s+([^\,\.\n]+)/i);
  return m ? m[1].trim() : "";
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }
    if (!hasPermission(user.role as any, "ai.manage" as any)) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin menggunakan AI Agent" } },
        { status: 403 }
      );
    }

    const body = (await req.json()) || {};
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const conversationId =
      typeof body.conversationId === "string" && body.conversationId.trim()
        ? body.conversationId.trim()
        : null;
    // Phase 15: agent mode + context KB
    const agentMode = typeof body.mode === "string" ? body.mode : "chat";
    const contextKbIds: string[] = Array.isArray(body.contextKbIds) ? body.contextKbIds : [];

    if (!message) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Field wajib: message" } },
        { status: 400 }
      );
    }

    // 1. Load AIAgent config (singleton row — first() pattern)
    const agentConfig = await db.aIAgent.findFirst();
    if (!agentConfig || !agentConfig.isActive) {
      return NextResponse.json(
        { success: false, error: { code: "AGENT_DISABLED", message: "AI Agent belum diaktifkan" } },
        { status: 403 }
      );
    }

    // 2. Load active tools
    const tools = await db.aIAgentTool.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });

    // Parse allowedTools JSON from agent config
    let allowedToolKeys: string[] = [];
    try {
      const parsed = JSON.parse(agentConfig.allowedTools || "[]");
      if (Array.isArray(parsed)) allowedToolKeys = parsed.map((k: any) => String(k));
    } catch {
      allowedToolKeys = [];
    }

    // Filter tools: if allowedTools is empty, allow all active tools
    const effectiveTools =
      allowedToolKeys.length === 0
        ? tools
        : tools.filter((t) => allowedToolKeys.includes(t.key));

    // 3. Decide which read-only tools to execute for this message
    const relevantKeys = pickRelevantTools(message);
    const searchTerm = extractSearchTerm(message);

    const toolsToExecute = effectiveTools.filter(
      (t) =>
        relevantKeys.includes(t.key) &&
        !t.isDestructive &&
        t.requiredPermission === "read_only"
    );

    // 4. Execute read-only tools and collect results
    const toolResults: ToolResult[] = [];
    for (const tool of toolsToExecute) {
      const params: Record<string, any> = {};
      if (tool.key === "vpn.search") params.search = searchTerm;
      if (tool.key === "vpn.account.status") {
        // If user mentioned a username-like token, pass it
        const usernameMatch = message.match(/\b([a-zA-Z0-9_\-]{3,})\b/);
        if (usernameMatch) params.username = usernameMatch[1];
      }
      const result = await executeTool(tool.key, tool.name, tool.isDestructive, params);
      toolResults.push(result);
    }

    // 5. Build messages: system prompt + tool descriptions + tool results + user message
    const toolDescriptions = effectiveTools
      .map(
        (t) =>
          `- ${t.key}: ${t.description || t.name} (kategori: ${t.category}, ${
            t.isDestructive ? "DESTRUKTIF — perlu persetujuan" : "read-only"
          })`
      )
      .join("\n");

    const toolResultsText =
      toolResults.length === 0
        ? "(Tidak ada tool yang dieksekusi untuk pertanyaan ini)"
        : toolResults
            .map((r) => {
              const payload =
                r.status === "success" || r.status === "no_data"
                  ? JSON.stringify(r.data)
                  : r.error;
              return `### TOOL: ${r.toolKey} (${r.toolName}) — ${r.status}\n${payload || "(no data)"}`;
            })
            .join("\n\n");

    const systemPrompt = [
      agentConfig.systemPrompt ||
        "Anda adalah AI Agent admin MVMP yang membantu staff memantau dan menganalisis sistem.",
      "",
      "Anda memiliki akses ke tool-tool berikut:",
      toolDescriptions,
      "",
      `Tingkat izin agent: ${agentConfig.permissionLevel}.`,
      "Tool read-only sudah dieksekusi dan hasilnya disertakan di bawah. Gunakan data tersebut",
      "untuk menjawab pertanyaan admin secara akurat. Jika tool destruktif diperlukan, jelaskan",
      "bahwa tool tersebut memerlukan persetujuan melalui workflow AIExecution.",
      "",
      "Aturan jawaban:",
      "- Bahasa Indonesia, sopan, ringkas.",
      "- Sitasi data tool secara spesifik (angka, status, nama server/akun).",
      "- Jika data tidak cukup, katakan dengan jelas dan sarankan tool/manual check.",
      "- Format dengan markdown ringkas (bullet / tabel kecil) bila membantu.",
    ].join("\n");

    const toolContextMessage = {
      role: "system" as const,
      content: `Hasil eksekusi tool read-only untuk konteks pertanyaan ini:\n\n${toolResultsText}`,
    };

    // Phase 15: inject mode instruction + KB context into system prompt
    let modeInstruction = "";
    if (agentMode === "plan") {
      modeInstruction += "\n\n## MODE: PLAN\nBuat rencana langkah demi langkah sebelum melakukan tindakan. Tampilkan rencana dan minta persetujuan sebelum eksekusi.";
    } else if (agentMode === "build") {
      modeInstruction += "\n\n## MODE: BUILD\nJalankan tugas berdasarkan rencana. Tampilkan proses setiap tahapan. Minta persetujuan sebelum tindakan berisiko.";
    } else {
      modeInstruction += "\n\n## MODE: CHAT\nJawab pertanyaan dan berdiskusi tanpa menjalankan perubahan sistem.";
    }

    let kbContext = "";
    if (contextKbIds.length > 0) {
      const kbDocs = await db.aIKnowledgeDocument.findMany({
        where: { id: { in: contextKbIds }, isActive: true },
        select: { title: true, content: true },
      });
      if (kbDocs.length > 0) {
        kbContext = "\n\n## KONTEKS DARI KNOWLEDGE BASE:\n" + kbDocs.map(d => `[${d.title}]: ${d.content.slice(0, 500)}`).join("\n\n");
      }
    }

    const messages = [
      { role: "system" as const, content: systemPrompt + modeInstruction + kbContext },
      toolContextMessage,
      { role: "user" as const, content: message },
    ];

    // 6. Call chatCompletion with feature="agent" (also writes AIUsage internally)
    const result = await chatCompletion({
      messages,
      feature: "agent",
      userId: user.id,
      conversationId: conversationId || undefined,
      temperature: 0.4,
      maxTokens: 1500,
    });

    // 7. Audit log + track
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role as any,
      action: "AI_AGENT_QUERY",
      resourceType: "AIAgent",
      resourceId: agentConfig.id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        messageLength: message.length,
        conversationId,
        toolsUsed: toolResults.map((r) => r.toolKey),
        aiStatus: result.status,
        model: result.model,
        provider: result.provider,
        costUsd: result.costUsd,
        latencyMs: result.latencyMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    });

    // 8. Return response + tools used
    return NextResponse.json({
      success: true,
      data: serialize({
        response: result.content,
        conversationId,
        toolsUsed: toolResults.map((r) => ({
          toolKey: r.toolKey,
          toolName: r.toolName,
          status: r.status,
          data: r.data,
          error: r.error || undefined,
        })),
        ai: {
          status: result.status,
          model: result.model,
          provider: result.provider,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costUsd: result.costUsd,
          latencyMs: result.latencyMs,
          isMock: result.status === "MOCK_FALLBACK",
          errorMessage: result.errorMessage || null,
        },
        agent: {
          permissionLevel: agentConfig.permissionLevel,
          availableToolCount: effectiveTools.length,
        },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (e: any) {
    console.error("AI agent query error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
