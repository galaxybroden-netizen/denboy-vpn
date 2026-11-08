// MVMP — AI Providers: dynamic model fetch
// POST /api/ai/providers/fetch-models
//
// Body: { baseUrl, authType, apiKey?, apiVersion?, orgId?, providerType? }
//
// Calls the provider's models endpoint and returns a normalized list of
// { id, displayName?, ownedBy?, contextWindow? } for the UI to show as a
// dynamic dropdown in the Configure Provider dialog.
//
// Supported provider shapes (auto-detected from baseUrl + authType):
//   - OpenAI-compatible (OpenAI, Groq, DeepSeek, Mistral, OpenRouter, vLLM, LM Studio):
//       GET {baseUrl}/models   →  { data: [{ id, owned_by }] }
//   - Anthropic:
//       GET {baseUrl}/models   →  { data: [{ id, display_name }] }
//   - Google Gemini:
//       GET {baseUrl}/models?key={apiKey}  →  { models: [{ name, displayName, inputTokenLimit }] }
//   - Ollama:
//       GET {baseUrl}/api/tags  →  { models: [{ name, details: { parameter_size }] } }
//
// SSRF protection: baseUrl is validated by src/lib/ssrf.ts before fetch.
// Time limit: 15 seconds per provider call.

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, hasPermission } from "@/lib/auth";
import { validateProviderUrl, validateDnsResolution } from "@/lib/ssrf";

interface FetchModelsBody {
  baseUrl?: string;
  authType?: string;
  apiKey?: string;
  apiVersion?: string;
  orgId?: string;
  providerType?: string; // hint: "openai" | "anthropic" | "gemini" | "ollama" | "openai-compatible"
}

interface NormalizedModel {
  id: string;
  displayName?: string;
  ownedBy?: string;
  contextWindow?: number;
}

const FETCH_TIMEOUT_MS = 15_000;

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }
    if (!hasPermission(user.role, "ai.manage")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin" } },
        { status: 403 }
      );
    }

    const body: FetchModelsBody = await req.json().catch(() => ({}));
    const baseUrl = (body.baseUrl || "").trim().replace(/\/$/, "");
    const authType = body.authType || "bearer";
    const apiKey = (body.apiKey || "").trim();
    const apiVersion = (body.apiVersion || "").trim();
    const orgId = (body.orgId || "").trim();
    const providerHint = (body.providerType || "").toLowerCase();

    if (!baseUrl) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "baseUrl wajib diisi" } },
        { status: 400 }
      );
    }

    // ---- SSRF protection ----
    const urlCheck = validateProviderUrl(baseUrl);
    if (!urlCheck.allowed) {
      return NextResponse.json(
        { success: false, error: { code: "SSRF_BLOCKED", message: urlCheck.reason || "URL diblokir" } },
        { status: 400 }
      );
    }
    const dnsCheck = await validateDnsResolution(new URL(baseUrl).hostname);
    if (!dnsCheck.allowed) {
      return NextResponse.json(
        { success: false, error: { code: "SSRF_BLOCKED", message: dnsCheck.reason || "DNS resolves ke internal IP" } },
        { status: 400 }
      );
    }

    // ---- Build fetch URL + headers based on provider shape ----
    const isOllama = baseUrl.includes(":11434") || providerHint === "ollama";
    const isGemini = baseUrl.includes("generativelanguage.googleapis.com") || providerHint === "gemini";
    const isAnthropic = baseUrl.includes("anthropic.com") || providerHint === "anthropic";

    let fetchUrl = "";
    const headers: Record<string, string> = {
      "User-Agent": "MVMP/1.0 (model-fetch)",
      "Accept": "application/json",
    };

    if (isOllama) {
      // Ollama: GET /api/tags
      fetchUrl = `${baseUrl}/api/tags`;
    } else if (isGemini) {
      // Gemini: GET /models?key={apiKey}
      const keyPart = apiKey ? `?key=${encodeURIComponent(apiKey)}` : "";
      fetchUrl = `${baseUrl}/models${keyPart}`;
    } else {
      // OpenAI-compatible + Anthropic: GET /models
      fetchUrl = `${baseUrl}/models`;
      if (authType === "bearer" && apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      } else if (authType === "x-api-key" && apiKey) {
        headers["x-api-key"] = apiKey;
      }
      if (apiVersion) headers["anthropic-version"] = apiVersion;
      if (orgId) headers["OpenAI-Organization"] = orgId;
    }

    // ---- Fetch with timeout ----
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await fetch(fetchUrl, {
        method: "GET",
        headers,
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (e: any) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FETCH_FAILED",
            message: `Tidak dapat terhubung ke ${fetchUrl}: ${e?.message || "network error"}`,
          },
        },
        { status: 502 }
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PROVIDER_ERROR",
            message: `Provider mengembalikan HTTP ${resp.status}: ${errText.slice(0, 200)}`,
          },
        },
        { status: 502 }
      );
    }

    const json: any = await resp.json().catch(() => null);
    if (!json) {
      return NextResponse.json(
        { success: false, error: { code: "PARSE_ERROR", message: "Response bukan JSON valid" } },
        { status: 502 }
      );
    }

    // ---- Normalize response to { id, displayName?, ownedBy?, contextWindow? }[] ----
    const models: NormalizedModel[] = [];

    if (isOllama) {
      const list = json.models || [];
      for (const m of list) {
        if (!m?.name) continue;
        models.push({
          id: m.name,
          displayName: m.name,
          ownedBy: m?.details?.family || "ollama",
        });
      }
    } else if (isGemini) {
      const list = json.models || [];
      for (const m of list) {
        if (!m?.name) continue;
        const id = m.name.replace(/^models\//, "");
        models.push({
          id,
          displayName: m.displayName || id,
          contextWindow: m.inputTokenLimit ? Number(m.inputTokenLimit) : undefined,
        });
      }
    } else {
      const list = json.data || json.models || [];
      for (const m of list) {
        if (!m?.id) continue;
        models.push({
          id: m.id,
          displayName: m.display_name || m.id,
          ownedBy: m.owned_by,
          contextWindow: m.context_window ? Number(m.context_window) : undefined,
        });
      }
    }

    const seen = new Set<string>();
    const unique = models
      .filter((m) => !seen.has(m.id) && seen.add(m.id))
      .sort((a, b) => a.id.localeCompare(b.id));

    return NextResponse.json({
      success: true,
      data: {
        models: unique,
        count: unique.length,
        fetchedAt: new Date().toISOString(),
        providerShape: isOllama ? "ollama" : isGemini ? "gemini" : isAnthropic ? "anthropic" : "openai-compatible",
      },
    });
  } catch (e: any) {
    console.error("AI fetch-models error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
