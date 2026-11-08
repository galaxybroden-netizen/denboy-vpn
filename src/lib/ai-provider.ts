// MVMP — AI Provider Library (Multi-provider adapter pattern)
// Phase 12: AES-256-GCM encryption, sandbox/production mode, PII redaction.
//
// Mode detection:
//   - SANDBOX (NODE_ENV !== "production"): Mock fallback allowed when no provider configured
//   - PRODUCTION (NODE_ENV === "production"): No mock — returns error if all providers fail
//
// Provider adapters:
//   - OpenAI-Compatible (OpenAI, Groq, DeepSeek, Mistral, OpenRouter, vLLM, LM Studio)
//   - Anthropic Claude (different API format)
//   - Google Gemini (different API format)
//   - Ollama (local, no auth)

import { db } from "@/lib/db";
import { encrypt as aesEncrypt, decrypt as aesDecrypt, maskCredential } from "@/lib/crypto";
import { validateProviderUrl, validateDnsResolution } from "@/lib/ssrf";

// ============================================================================
// TYPES
// ============================================================================

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  feature: "chatbot_landing" | "chatbot_customer" | "chatbot_reseller" | "agent" | "reply_assist";
  userId?: string;
  conversationId?: string;
}

interface ChatCompletionResponse {
  content: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  status: "REAL_AI_SUCCESS" | "MOCK_FALLBACK" | "PROVIDER_ERROR" | "QUOTA_EXCEEDED" | "AI_UNAVAILABLE";
  errorMessage?: string;
}

// ============================================================================
// SANDBOX / PRODUCTION MODE
// ============================================================================

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const IS_SANDBOX = !IS_PRODUCTION;

// ============================================================================
// CREDENTIAL DECRYPTION (Phase 12 — AES-256-GCM)
// Uses src/lib/crypto.ts for real authenticated encryption.
// Falls back to base64 decode for legacy credentials (migration support).
// ============================================================================

function decryptCredential(encrypted: string | null): string | null {
  return aesDecrypt(encrypted);
}

/** Encrypt a credential for storage — uses AES-256-GCM */
export function encryptCredential(plaintext: string): string | null {
  return aesEncrypt(plaintext);
}

/** Mask a credential for display — first 4 + last 4 chars */
export function maskCred(plaintext: string): string {
  return maskCredential(plaintext);
}

// ============================================================================
// PII REDACTION
// ============================================================================

/** Redact personally identifiable information from messages before sending to AI provider.
 *  Replaces email addresses, phone numbers, and credit card numbers with placeholders. */
function redactPII(text: string): string {
  let redacted = text;
  // Email: xxx@yyy.zzz → [EMAIL_REDACTED]
  redacted = redacted.replace(/[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[EMAIL_REDACTED]");
  // Phone: +62xxx or 08xxx → [PHONE_REDACTED]
  redacted = redacted.replace(/(\+62|0)8\d{8,13}/g, "[PHONE_REDACTED]");
  // Credit card: 16 digits → [CARD_REDACTED]
  redacted = redacted.replace(/\b\d{16}\b/g, "[CARD_REDACTED]");
  // IP address → [IP_REDACTED]
  redacted = redacted.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "[IP_REDACTED]");
  return redacted;
}

/** Apply PII redaction to all user messages if config requires it */
async function applyRedaction(messages: ChatMessage[]): Promise<ChatMessage[]> {
  const config = await db.aIConfiguration.findFirst();
  if (!config?.redactPII) return messages;

  return messages.map((m) => {
    if (m.role === "user") {
      return { ...m, content: redactPII(m.content) };
    }
    return m;
  });
}

// ============================================================================
// PROVIDER ADAPTERS
// ============================================================================

/** OpenAI-compatible adapter — works for: OpenAI, Groq, DeepSeek, Mistral, OpenRouter, vLLM, LM Studio */
async function callOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  modelId: string,
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number; timeout?: number }
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const controller = new AbortController();
  const timeoutMs = (options.timeout || 30) * 1000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text();
      let errMsg = `HTTP ${res.status}`;
      try {
        const errJson = JSON.parse(errBody);
        errMsg = errJson.error?.message || errJson.message || errMsg;
      } catch {
        errMsg = errBody.slice(0, 200) || errMsg;
      }
      throw new ProviderError(res.status, errMsg);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";
    const inputTokens = data.usage?.prompt_tokens || Math.ceil(messages.reduce((s, m) => s + m.content.length, 0) / 4);
    const outputTokens = data.usage?.completion_tokens || Math.ceil(content.length / 4);

    return { content, inputTokens, outputTokens };
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Anthropic Claude adapter — different API format (messages API) */
async function callAnthropic(
  baseUrl: string,
  apiKey: string,
  apiVersion: string,
  modelId: string,
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number; timeout?: number }
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), (options.timeout || 30) * 1000);

  try {
    // Anthropic separates system message from conversation messages
    const systemMsg = messages.find((m) => m.role === "system")?.content || "";
    const convMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": apiVersion || "2023-06-01",
      },
      body: JSON.stringify({
        model: modelId,
        system: systemMsg,
        messages: convMessages,
        max_tokens: options.maxTokens ?? 2048,
        temperature: options.temperature ?? 0.7,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text();
      let errMsg = `HTTP ${res.status}`;
      try {
        const errJson = JSON.parse(errBody);
        errMsg = errJson.error?.message || errMsg;
      } catch {
        errMsg = errBody.slice(0, 200) || errMsg;
      }
      throw new ProviderError(res.status, errMsg);
    }

    const data = await res.json();
    // Anthropic returns content as array of blocks
    const content = (data.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");
    const inputTokens = data.usage?.input_tokens || 0;
    const outputTokens = data.usage?.output_tokens || Math.ceil(content.length / 4);

    return { content, inputTokens, outputTokens };
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Google Gemini adapter — different API format (generateContent) */
async function callGemini(
  baseUrl: string,
  apiKey: string,
  modelId: string,
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number; timeout?: number }
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), (options.timeout || 30) * 1000);

  try {
    // Gemini uses systemInstruction + contents array
    const systemMsg = messages.find((m) => m.role === "system")?.content || "";
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const url = `${baseUrl}/models/${modelId}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: systemMsg ? { parts: [{ text: systemMsg }] } : undefined,
        contents,
        generationConfig: {
          temperature: options.temperature ?? 0.7,
          maxOutputTokens: options.maxTokens ?? 2048,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text();
      let errMsg = `HTTP ${res.status}`;
      try {
        const errJson = JSON.parse(errBody);
        errMsg = errJson.error?.message || errMsg;
      } catch {
        errMsg = errBody.slice(0, 200) || errMsg;
      }
      throw new ProviderError(res.status, errMsg);
    }

    const data = await res.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const inputTokens = data.usageMetadata?.promptTokenCount || 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount || Math.ceil(content.length / 4);

    return { content, inputTokens, outputTokens };
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Ollama adapter — local, no auth, different endpoint */
async function callOllama(
  baseUrl: string,
  modelId: string,
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number; timeout?: number }
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), (options.timeout || 60) * 1000);

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: false,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens ?? 2048,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new ProviderError(res.status, errBody.slice(0, 200) || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const content = data.message?.content || "";
    const inputTokens = data.prompt_eval_count || 0;
    const outputTokens = data.eval_count || Math.ceil(content.length / 4);

    return { content, inputTokens, outputTokens };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================================
// ERROR CLASS
// ============================================================================

class ProviderError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = "ProviderError";
  }
}

// ============================================================================
// MODEL SELECTION (routing)
// ============================================================================

async function selectModel(feature: string): Promise<{ provider: any; model: any } | null> {
  const config = await db.aIConfiguration.findFirst();
  if (!config) return null;
  if (config.emergencyShutdown) return null;

  // Budget check
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayUsage = await db.aIUsage.aggregate({
    where: { createdAt: { gte: today } },
    _sum: { costUsd: true },
  });
  if (todayUsage._sum.costUsd && todayUsage._sum.costUsd >= config.dailyBudgetUsd) {
    return null; // daily budget exceeded
  }

  // Manual mode: use configured model for this feature
  if (config.routingMode === "manual") {
    const modelId =
      feature === "agent" ? config.agentModelId :
      feature.startsWith("chatbot") ? config.chatbotModelId :
      config.defaultModelId;
    if (modelId) {
      const model = await db.aIModel.findUnique({
        where: { id: modelId },
        include: { provider: true },
      });
      if (model && model.provider.isActive && model.isActive) {
        return { provider: model.provider, model };
      }
    }
  }

  // Auto-routing: find active providers with active models
  const providers = await db.aIProvider.findMany({
    where: { isActive: true },
    include: { models: { where: { isActive: true } } },
    orderBy: { priority: "asc" },
  });

  if (providers.length === 0) return null;

  const pairs: Array<{ provider: any; model: any }> = [];
  for (const p of providers) {
    for (const m of p.models) {
      if (feature === "agent" && m.recommendedUse && !["agent", "reasoning"].includes(m.recommendedUse)) continue;
      if (feature === "reply_assist" && m.recommendedUse && !["fast_reply", "chatbot"].includes(m.recommendedUse)) continue;
      pairs.push({ provider: p, model: m });
    }
  }

  if (pairs.length === 0) return null;

  switch (config.routingMode) {
    case "free_first":
      pairs.sort((a, b) => {
        if (a.model.isFree && !b.model.isFree) return -1;
        if (!a.model.isFree && b.model.isFree) return 1;
        return a.provider.priority - b.provider.priority;
      });
      break;
    case "cheapest_first":
      pairs.sort((a, b) =>
        (a.model.inputPricePer1M + a.model.outputPricePer1M) -
        (b.model.inputPricePer1M + b.model.outputPricePer1M)
      );
      break;
    case "performance_first":
      pairs.sort((a, b) => b.model.contextWindow - a.model.contextWindow);
      break;
    case "quality_first":
      pairs.sort((a, b) => b.model.outputPricePer1M - a.model.outputPricePer1M);
      break;
  }

  return pairs[0];
}

// ============================================================================
// MAIN CHAT COMPLETION
// ============================================================================

export async function chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
  const startTime = Date.now();

  // 0. Apply PII redaction if configured
  const redactedMessages = await applyRedaction(req.messages);

  // 1. Select model based on routing config
  const selected = await selectModel(req.feature);

  if (!selected) {
    // No provider configured or budget exceeded
    if (IS_SANDBOX) {
      // Sandbox: allow mock fallback for development
      const mockContent = generateMockResponse(req.messages[req.messages.length - 1]?.content || "", req.feature);
      return {
        content: mockContent,
        model: "mock",
        provider: "builtin",
        inputTokens: 0,
        outputTokens: mockContent.length,
        costUsd: 0,
        latencyMs: Date.now() - startTime,
        status: "MOCK_FALLBACK",
        errorMessage: "No active AI provider configured or daily budget exceeded. Using keyword-based fallback (sandbox mode).",
      };
    } else {
      // Production: NO mock — return error
      return {
        content: "Maaf, layanan AI sedang tidak tersedia. Silakan hubungi admin melalui WhatsApp.",
        model: "none",
        provider: "none",
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs: Date.now() - startTime,
        status: "AI_UNAVAILABLE",
        errorMessage: "No active AI provider configured or daily budget exceeded in production mode.",
      };
    }
  }

  const { provider, model } = selected;

  // 2. Decrypt API key using AES-256-GCM
  const apiKey = decryptCredential(provider.apiKeyEncrypted);
  if (!apiKey && provider.authType !== "none") {
    if (IS_SANDBOX) {
      const mockContent = generateMockResponse(req.messages[req.messages.length - 1]?.content || "", req.feature);
      return {
        content: mockContent,
        model: model.modelId,
        provider: provider.name,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs: Date.now() - startTime,
        status: "MOCK_FALLBACK",
        errorMessage: `Provider ${provider.name} has no API key configured. Using mock fallback (sandbox).`,
      };
    } else {
      return {
        content: "Maaf, layanan AI sedang tidak tersedia. Provider belum dikonfigurasi dengan API key.",
        model: model.modelId,
        provider: provider.name,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs: Date.now() - startTime,
        status: "AI_UNAVAILABLE",
        errorMessage: `Provider ${provider.name} has no API key configured in production mode.`,
      };
    }
  }

  // 3. SSRF protection — validate provider baseUrl before making any request
  const ssrfCheck = validateProviderUrl(provider.baseUrl);
  if (!ssrfCheck.allowed) {
    return {
      content: IS_SANDBOX ? generateMockResponse(req.messages[req.messages.length - 1]?.content || "", req.feature) : "Layanan AI tidak tersedia.",
      model: model.modelId,
      provider: provider.name,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: Date.now() - startTime,
      status: IS_SANDBOX ? "MOCK_FALLBACK" : "AI_UNAVAILABLE",
      errorMessage: `SSRF protection: ${ssrfCheck.reason}`,
    };
  }

  // 4. Call provider adapter based on provider name/type
  try {
    let result: { content: string; inputTokens: number; outputTokens: number };

    const providerName = provider.name.toLowerCase();
    const timeout = provider.timeout || 30;

    if (providerName.includes("anthropic") || providerName.includes("claude")) {
      result = await callAnthropic(
        provider.baseUrl,
        apiKey!,
        provider.apiVersion || "2023-06-01",
        model.modelId,
        redactedMessages,
        { temperature: req.temperature ?? model.defaultTemp, maxTokens: req.maxTokens ?? model.defaultMaxTokens, timeout }
      );
    } else if (providerName.includes("gemini") || providerName.includes("google")) {
      result = await callGemini(
        provider.baseUrl,
        apiKey!,
        model.modelId,
        redactedMessages,
        { temperature: req.temperature ?? model.defaultTemp, maxTokens: req.maxTokens ?? model.defaultMaxTokens, timeout }
      );
    } else if (providerName.includes("ollama")) {
      result = await callOllama(
        provider.baseUrl,
        model.modelId,
        redactedMessages,
        { temperature: req.temperature ?? model.defaultTemp, maxTokens: req.maxTokens ?? model.defaultMaxTokens, timeout }
      );
    } else {
      // OpenAI-compatible: OpenAI, Groq, DeepSeek, Mistral, OpenRouter, vLLM, LM Studio
      result = await callOpenAICompatible(
        provider.baseUrl,
        apiKey || "",
        model.modelId,
        redactedMessages,
        { temperature: req.temperature ?? model.defaultTemp, maxTokens: req.maxTokens ?? model.defaultMaxTokens, timeout }
      );
    }

    // 4. Calculate cost
    const costUsd =
      (result.inputTokens / 1_000_000) * model.inputPricePer1M +
      (result.outputTokens / 1_000_000) * model.outputPricePer1M;

    const latencyMs = Date.now() - startTime;

    // 5. Track usage
    await db.aIUsage.create({
      data: {
        providerId: provider.id,
        modelId: model.id,
        feature: req.feature,
        userId: req.userId,
        conversationId: req.conversationId,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd,
        latencyMs,
        status: "success",
      },
    });

    // 6. Update provider lastConnectedAt
    await db.aIProvider.update({
      where: { id: provider.id },
      data: { lastConnectedAt: new Date(), lastError: null },
    });

    return {
      content: result.content,
      model: model.modelId,
      provider: provider.name,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd,
      latencyMs,
      status: "REAL_AI_SUCCESS",
    };
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    const errMsg = error?.message || "Unknown error";
    const errStatus = error instanceof ProviderError ? error.statusCode : 500;

    // Determine status based on error type
    let status: ChatCompletionResponse["status"] = "PROVIDER_ERROR";
    if (errStatus === 429) status = "QUOTA_EXCEEDED";
    if (error?.name === "AbortError") status = "PROVIDER_ERROR";

    // Track failed usage
    await db.aIUsage.create({
      data: {
        providerId: provider.id,
        modelId: model.id,
        feature: req.feature,
        userId: req.userId,
        conversationId: req.conversationId,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs,
        status: "error",
        errorMessage: errMsg.slice(0, 500),
      },
    });

    // Update provider error state
    await db.aIProvider.update({
      where: { id: provider.id },
      data: { lastError: errMsg.slice(0, 200) },
    });

    // Try fallback model
    const config = await db.aIConfiguration.findFirst();
    if (config?.fallbackModelId && config.fallbackModelId !== model.id) {
      const fallbackModel = await db.aIModel.findUnique({
        where: { id: config.fallbackModelId },
        include: { provider: true },
      });
      if (fallbackModel && fallbackModel.provider.isActive) {
        // Recursive call with fallback (max 1 level deep)
        try {
          const fallbackKey = decryptCredential(fallbackModel.provider.apiKeyEncrypted);
          if (fallbackKey || fallbackModel.provider.authType === "none") {
            const fallbackResult = await callOpenAICompatible(
              fallbackModel.provider.baseUrl,
              fallbackKey || "",
              fallbackModel.modelId,
              req.messages,
              { temperature: req.temperature ?? 0.7, maxTokens: req.maxTokens ?? 2048 }
            );
            return {
              content: fallbackResult.content,
              model: fallbackModel.modelId,
              provider: fallbackModel.provider.name + " (fallback)",
              inputTokens: fallbackResult.inputTokens,
              outputTokens: fallbackResult.outputTokens,
              costUsd: (fallbackResult.inputTokens / 1e6) * fallbackModel.inputPricePer1M + (fallbackResult.outputTokens / 1e6) * fallbackModel.outputPricePer1M,
              latencyMs: Date.now() - startTime,
              status: "REAL_AI_SUCCESS",
              errorMessage: `Primary provider failed (${errMsg}), used fallback.`,
            };
          }
        } catch {
          // Fallback also failed → mock
        }
      }
    }

    // All providers failed
    if (IS_SANDBOX) {
      // Sandbox: mock fallback
      return {
        content: generateMockResponse(req.messages[req.messages.length - 1]?.content || "", req.feature),
        model: model.modelId,
        provider: provider.name,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs,
        status: "MOCK_FALLBACK",
        errorMessage: `Provider error (${errMsg}), using mock fallback (sandbox mode).`,
      };
    } else {
      // Production: NO mock — return error with helpful message
      return {
        content: "Maaf, layanan AI sedang mengalami gangguan. Tim kami sudah diberi tahu. Silakan coba lagi atau hubungi WhatsApp support.",
        model: model.modelId,
        provider: provider.name,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs,
        status,
        errorMessage: errMsg,
      };
    }
  }
}

// ============================================================================
// PROVIDER CONNECTION TEST
// ============================================================================

export async function testProviderConnection(providerId: string): Promise<{
  success: boolean;
  connected: boolean;
  message: string;
  models?: string[];
}> {
  const provider = await db.aIProvider.findUnique({
    where: { id: providerId },
    include: { models: { where: { isActive: true }, select: { modelId: true } } },
  });

  if (!provider) {
    return { success: false, connected: false, message: "Provider tidak ditemukan" };
  }

  if (!provider.isActive) {
    return { success: false, connected: false, message: "Provider tidak aktif" };
  }

  const apiKey = decryptCredential(provider.apiKeyEncrypted);
  if (!apiKey && provider.authType !== "none") {
    return { success: false, connected: false, message: "API key belum dikonfigurasi" };
  }

  try {
    const providerName = provider.name.toLowerCase();

    // Simple test: send a minimal chat completion request
    const testMessages: ChatMessage[] = [
      { role: "user", content: "Hi" },
    ];

    let result;
    if (providerName.includes("anthropic")) {
      result = await callAnthropic(provider.baseUrl, apiKey!, provider.apiVersion || "2023-06-01", provider.models[0]?.modelId || "claude-3-5-haiku-20241022", testMessages, { maxTokens: 10, timeout: 15 });
    } else if (providerName.includes("gemini")) {
      result = await callGemini(provider.baseUrl, apiKey!, provider.models[0]?.modelId || "gemini-1.5-flash", testMessages, { maxTokens: 10, timeout: 15 });
    } else if (providerName.includes("ollama")) {
      result = await callOllama(provider.baseUrl, provider.models[0]?.modelId || "llama3.2", testMessages, { maxTokens: 10, timeout: 15 });
    } else {
      result = await callOpenAICompatible(provider.baseUrl, apiKey || "", provider.models[0]?.modelId || "gpt-4o-mini", testMessages, { maxTokens: 10, timeout: 15 });
    }

    await db.aIProvider.update({
      where: { id: providerId },
      data: { lastConnectedAt: new Date(), lastError: null },
    });

    return {
      success: true,
      connected: true,
      message: `Koneksi berhasil ke ${provider.name}. Response: "${result.content.slice(0, 50)}..."`,
      models: provider.models.map((m) => m.modelId),
    };
  } catch (error: any) {
    const errMsg = error?.message || "Unknown error";
    await db.aIProvider.update({
      where: { id: providerId },
      data: { lastError: errMsg.slice(0, 200) },
    });

    return {
      success: false,
      connected: false,
      message: `Koneksi gagal: ${errMsg}`,
    };
  }
}

// ============================================================================
// MOCK RESPONSE (fallback only — explicitly marked)
// ============================================================================

function generateMockResponse(message: string, feature: string): string {
  const msg = message.toLowerCase();

  if (msg.includes("harga") || msg.includes("paket") || msg.includes("biaya")) {
    return `Kami punya 4 paket VPN:\n\n📦 Hemat — Rp 25.000/bulan (SSH, OpenVPN, Shadowsocks)\n🚀 Pro — Rp 40.000/bulan (WireGuard, VMess, VLESS, Trojan)\n🎮 Sultan — Rp 55.000/bulan (Hysteria2, TUIC, VLESS+Reality)\n👑 ALL ACCESS — Rp 65.000/bulan (SEMUA 10 protokol)\n\nTersedia paket tahunan hemat 15%. Semua unlimited bandwidth.`;
  }
  if (msg.includes("server") || msg.includes("lokasi")) {
    return `5 server: 🇮🇩 Indonesia (Jakarta ×2), 🇸🇬 Singapore, 🇺🇸 USA (LA), 🇳🇱 Netherlands. Semua 10 protokol VPN.`;
  }
  if (msg.includes("daftar") || msg.includes("register")) {
    return `Daftar gratis: 1) Klik "Daftar Sekarang", 2) Isi nama/email/WA/password, 3) Akun aktif, 4) Login, 5) Pilih paket + bayar, 6) VPN auto-generate.`;
  }
  if (msg.includes("bayar") || msg.includes("pembayaran")) {
    return `Bayar via: QRIS (e-wallet), Transfer (BCA/Mandiri/BNI/BRI), Gateway (Xendit/Midtrans/DOKU/iPaymu). QRIS instan, transfer max 1 jam.`;
  }
  if (msg.includes("protokol")) {
    return `10 protokol: OpenVPN, WireGuard, VMess, VLESS, Reality, Trojan, Shadowsocks, Hysteria2, TUIC, SSH.`;
  }
  if (msg.includes("connect") || msg.includes("gagal") || msg.includes("error")) {
    return `Jika VPN tidak connect: 1) Cek status ACTIVE, 2) Ganti protokol, 3) Ganti server, 4) Download ulang config, 5) Restart app. Hubungi WA 0811-0000-002.`;
  }
  if (msg.includes("download") || msg.includes("config")) {
    return `Download config: Portal > Akun Saya > Config > scan QR / download .conf > import ke app VPN.`;
  }
  if (msg.includes("halo") || msg.includes("hai")) {
    return `Halo! 👋 Ada yang bisa saya bantu? Tanya tentang paket, server, protokol, cara daftar, atau pembayaran.`;
  }
  return `Saya mengerti Anda bertanya tentang "${message}". Untuk bantuan lebih lanjut, hubungi WhatsApp 0811-0000-002 (24/7).`;
}
