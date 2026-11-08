// MVMP — Telegram Bot API client
// Phase 15 FASE 5: Telegram integration
//
// Provides:
//   - getMe(token) — test connection, get bot info
//   - sendMessage(token, chatId, text) — send message
//   - setWebhook(token, url, secret) — set webhook
//   - deleteWebhook(token) — remove webhook
//
// Token is passed as parameter (decrypted from DB by caller).
// All calls go to https://api.telegram.org/bot<token>/<method>

const TELEGRAM_API_BASE = "https://api.telegram.org";

export interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
  can_join_groups: boolean;
  can_read_all_group_messages: boolean;
  supports_inline_queries: boolean;
}

export interface TelegramMessageResult {
  message_id: number;
  date: number;
  text: string;
}

async function tgFetch(token: string, method: string, body?: Record<string, unknown>) {
  const url = `${TELEGRAM_API_BASE}/bot${token}/${method}`;
  const resp = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const json = await resp.json();
  if (!json.ok) {
    throw new Error(`Telegram API error: ${json.description || json.error_code || "unknown"}`);
  }
  return json.result;
}

/** Test connection — get bot info */
export async function getMe(token: string): Promise<TelegramBotInfo> {
  return tgFetch(token, "getMe");
}

/** Send text message to a chat */
export async function sendMessage(
  token: string,
  chatId: string | number,
  text: string,
  parseMode?: "Markdown" | "HTML"
): Promise<TelegramMessageResult> {
  return tgFetch(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: parseMode,
  });
}

/** Set webhook URL for receiving updates */
export async function setWebhook(
  token: string,
  webhookUrl: string,
  secretToken?: string
): Promise<boolean> {
  return tgFetch(token, "setWebhook", {
    url: webhookUrl,
    secret_token: secretToken,
    allowed_updates: ["message", "edited_message"],
  });
}

/** Delete webhook — switch to long polling mode */
export async function deleteWebhook(token: string): Promise<boolean> {
  return tgFetch(token, "deleteWebhook");
}

/** Get webhook info — current webhook status */
export async function getWebhookInfo(token: string): Promise<{
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  last_error_date: number;
  last_error_message: string;
}> {
  return tgFetch(token, "getWebhookInfo");
}

/** Mask bot token for display — show first 4 + •••• + last 4 */
export function maskBotToken(token: string): string {
  if (!token || token.length <= 10) return "••••••••";
  return `${token.slice(0, 4)}••••${token.slice(-4)}`;
}
