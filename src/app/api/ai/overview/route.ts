// MVMP — AI Center overview
// Aggregated stats for the AI Management dashboard:
//  - Active providers (count + list)
//  - Total models + by category
//  - Today's usage (requests, tokens, cost USD, failed)
//  - This month's usage (requests, tokens, cost USD)
//  - AIConfiguration (routing, budgets, switches)
//  - Conversation stats (AI_ACTIVE / HUMAN_ASSIGNED / RESOLVED)
//  - Most used model (by request count from AIUsage)
//  - Error rate today (failed / total)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission } from "@/lib/auth";
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
    if (!hasPermission(user.role, "ai.view")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melihat AI Center" } },
        { status: 403 }
      );
    }

    // Time boundaries — start-of-today & start-of-month (local server time)
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);

    // AIConfiguration singleton — create with defaults if missing
    let config = await db.aIConfiguration.findFirst();
    if (!config) {
      config = await db.aIConfiguration.create({ data: {} });
    }

    // Active providers — list with the fields the dashboard needs
    const activeProviders = await db.aIProvider.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        type: true,
        isActive: true,
        lastConnectedAt: true,
        lastError: true,
        priority: true,
        baseUrl: true,
      },
      orderBy: [{ priority: "asc" }, { name: "asc" }],
    });

    // Models — total count + by category
    const allModels = await db.aIModel.findMany({
      select: { id: true, category: true, isFree: true },
    });
    const modelsByCategory: Record<string, number> = {};
    let freeModelsCount = 0;
    for (const m of allModels) {
      const c = m.category || "custom";
      modelsByCategory[c] = (modelsByCategory[c] || 0) + 1;
      if (m.isFree) freeModelsCount += 1;
    }

    // Today's usage aggregates
    const todayAgg = await db.aIUsage.aggregate({
      where: { createdAt: { gte: startOfToday } },
      _count: { _all: true },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        costUsd: true,
      },
    });
    const todayFailed = await db.aIUsage.count({
      where: {
        createdAt: { gte: startOfToday },
        status: { in: ["error", "timeout"] },
      },
    });
    const todayTotalRequests = todayAgg._count._all ?? 0;
    const todayInputTokens = todayAgg._sum.inputTokens ?? 0;
    const todayOutputTokens = todayAgg._sum.outputTokens ?? 0;
    const todayTotalTokens = todayInputTokens + todayOutputTokens;
    const todayCostUsd = todayAgg._sum.costUsd ?? 0;

    // This month's usage aggregates
    const monthAgg = await db.aIUsage.aggregate({
      where: { createdAt: { gte: startOfMonth } },
      _count: { _all: true },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        costUsd: true,
      },
    });
    const monthTotalRequests = monthAgg._count._all ?? 0;
    const monthTotalTokens = (monthAgg._sum.inputTokens ?? 0) + (monthAgg._sum.outputTokens ?? 0);
    const monthCostUsd = monthAgg._sum.costUsd ?? 0;

    // Conversation stats (ChatConversation — channel-agnostic)
    const [totalConversations, aiActiveCount, humanAssignedCount, resolvedCount] = await Promise.all([
      db.chatConversation.count(),
      db.chatConversation.count({ where: { status: "AI_ACTIVE" } }),
      db.chatConversation.count({ where: { status: "HUMAN_ASSIGNED" } }),
      db.chatConversation.count({ where: { status: "RESOLVED" } }),
    ]);

    // Most used model — by request count from AIUsage (all-time, top modelId)
    const usageByModel = await db.aIUsage.groupBy({
      by: ["modelId"],
      _count: { _all: true },
    });
    const sortedByCount = usageByModel
      .filter((m) => m.modelId !== null)
      .sort((a, b) => (b._count._all ?? 0) - (a._count._all ?? 0));
    let mostUsedModel: {
      modelId: string | null;
      displayName: string | null;
      category: string | null;
      providerName: string | null;
      requestCount: number;
    } | null = null;
    if (sortedByCount.length > 0) {
      const top = sortedByCount[0];
      const model = top.modelId
        ? await db.aIModel.findUnique({
            where: { id: top.modelId },
            select: {
              id: true,
              modelId: true,
              displayName: true,
              category: true,
              provider: { select: { id: true, name: true } },
            },
          })
        : null;
      mostUsedModel = {
        modelId: model?.modelId ?? top.modelId,
        displayName: model?.displayName ?? null,
        category: model?.category ?? null,
        providerName: model?.provider?.name ?? null,
        requestCount: top._count._all ?? 0,
      };
    }

    // Error rate today (failed / total today)
    const errorRate = todayTotalRequests > 0 ? todayFailed / todayTotalRequests : 0;

    const data = {
      providers: {
        activeCount: activeProviders.length,
        items: activeProviders,
      },
      models: {
        total: allModels.length,
        freeCount: freeModelsCount,
        byCategory: modelsByCategory,
      },
      todayUsage: {
        totalRequests: todayTotalRequests,
        totalTokens: todayTotalTokens,
        inputTokens: todayInputTokens,
        outputTokens: todayOutputTokens,
        totalCostUsd: todayCostUsd,
        failedRequests: todayFailed,
      },
      monthUsage: {
        totalRequests: monthTotalRequests,
        totalTokens: monthTotalTokens,
        inputTokens: monthAgg._sum.inputTokens ?? 0,
        outputTokens: monthAgg._sum.outputTokens ?? 0,
        totalCostUsd: monthCostUsd,
      },
      config: {
        routingMode: config.routingMode,
        chatbotEnabled: config.chatbotEnabled,
        agentEnabled: config.agentEnabled,
        dailyBudgetUsd: config.dailyBudgetUsd,
        monthlyBudgetUsd: config.monthlyBudgetUsd,
        maxCostPerRequestUsd: config.maxCostPerRequestUsd,
        maxCostPerUserUsd: config.maxCostPerUserUsd,
        tokenQuotaDaily: config.tokenQuotaDaily,
        requestQuotaDaily: config.requestQuotaDaily,
        defaultTemperature: config.defaultTemperature,
        defaultMaxTokens: config.defaultMaxTokens,
        streamingEnabled: config.streamingEnabled,
        emergencyShutdown: config.emergencyShutdown,
        redactPII: config.redactPII,
        redactCredentials: config.redactCredentials,
        defaultModelId: config.defaultModelId,
        chatbotModelId: config.chatbotModelId,
        agentModelId: config.agentModelId,
        reasoningModelId: config.reasoningModelId,
        codingModelId: config.codingModelId,
        fallbackModelId: config.fallbackModelId,
      },
      conversations: {
        total: totalConversations,
        AI_ACTIVE: aiActiveCount,
        HUMAN_ASSIGNED: humanAssignedCount,
        RESOLVED: resolvedCount,
      },
      mostUsedModel,
      errorRate,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json({ success: true, data: serialize(data) });
  } catch (e: any) {
    console.error("AI overview error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
