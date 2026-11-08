// MVMP — WhatsApp helper library
// - Normalize phone numbers to E.164 (without +)
// - Render templates with variables
// - Sync contacts from Customer + User tables
// - Provider-agnostic send orchestration (mock implementation for sandbox;
//   in production: real Meta Cloud API call, Baileys websocket, or HTTP API call)

import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

/** Normalize a phone string to E.164 (no +, no spaces, no dashes). */
export function normalizePhone(input: string): string {
  if (!input) return "";
  let s = String(input).trim();
  // Remove anything that's not a digit
  s = s.replace(/[^\d]/g, "");
  // Indonesian: 08xxx → 628xxx
  if (s.startsWith("0")) s = "62" + s.slice(1);
  // +62xxx already handled (we stripped +)
  if (s.startsWith("62")) return s;
  // Fallback: assume already international
  if (s.length >= 8) return s;
  return "";
}

/** Render template body by substituting {{var}} with values from `vars`. */
export function renderTemplate(body: string, vars: Record<string, string | number | null | undefined>): string {
  return body.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_m, key) => {
    const v = vars[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

/** Extract variable names used in a template body (returns unique list in order). */
export function extractTemplateVariables(body: string): string[] {
  const matches = body.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out;
}

/**
 * Sync contacts from Customer + User tables into WhatsappContact.
 * - For each Customer with a phone, create/update a WhatsappContact with source=CUSTOMER.
 * - For each User (admin/reseller) with a phone who has logged in (lastLoginAt not null),
 *   create/update a WhatsappContact with source=USER.
 * - Returns the count of contacts created/updated.
 */
export async function syncWhatsappContacts(): Promise<{
  created: number;
  updated: number;
  total: number;
}> {
  let created = 0;
  let updated = 0;

  // Sync from Customer
  const customers = await db.customer.findMany({
    where: { phone: { not: null }, status: { not: "DELETED" } },
    select: { id: true, name: true, phone: true },
  });
  for (const c of customers) {
    const phone = normalizePhone(c.phone || "");
    if (!phone || phone.length < 8) continue;
    const existing = await db.whatsappContact.findUnique({ where: { phoneNumber: phone } });
    if (existing) {
      if (existing.source !== "CUSTOMER" || existing.sourceId !== c.id || existing.displayName !== c.name) {
        await db.whatsappContact.update({
          where: { id: existing.id },
          data: { source: "CUSTOMER", sourceId: c.id, displayName: c.name },
        });
        updated++;
      }
    } else {
      await db.whatsappContact.create({
        data: {
          phoneNumber: phone,
          displayName: c.name,
          source: "CUSTOMER",
          sourceId: c.id,
          tags: JSON.stringify(["customer"]),
        },
      });
      created++;
    }
  }

  // Sync from User (only those who have logged in — lastLoginAt != null)
  const users = await db.user.findMany({
    where: { phone: { not: null }, lastLoginAt: { not: null } },
    select: { id: true, name: true, phone: true, role: true },
  });
  for (const u of users) {
    const phone = normalizePhone(u.phone || "");
    if (!phone || phone.length < 8) continue;
    const existing = await db.whatsappContact.findUnique({ where: { phoneNumber: phone } });
    const tags = JSON.stringify(["user", u.role.toLowerCase()]);
    if (existing) {
      // Don't override CUSTOMER source — USER is lower priority
      if (existing.source === "MANUAL" || existing.source === "USER") {
        await db.whatsappContact.update({
          where: { id: existing.id },
          data: { source: "USER", sourceId: u.id, displayName: u.name, tags },
        });
        updated++;
      }
    } else {
      await db.whatsappContact.create({
        data: {
          phoneNumber: phone,
          displayName: u.name,
          source: "USER",
          sourceId: u.id,
          tags,
        },
      });
      created++;
    }
  }

  const total = await db.whatsappContact.count();
  return { created, updated, total };
}

/**
 * Send a WhatsApp message to a phone number via the configured integration.
 * Mock implementation: stores the message in DB and simulates delivery status changes.
 *
 * In production, replace this with real provider calls:
 *   - Meta Cloud: POST https://graph.facebook.com/v17.0/{phoneNumberId}/messages
 *   - Baileys: send via WebSocket connection (libs/@whiskeysockets/baileys)
 *   - API: POST to provider's API URL with apiKey
 *
 * Returns the created WhatsappMessage record (without conversation — caller must
 * link it to a conversation if applicable).
 */
export async function sendWhatsappMessage(
  phoneNumber: string,
  body: string,
  options: {
    templateId?: string;
    type?: string; // TEXT | TEMPLATE | IMAGE
    mediaUrl?: string;
    conversationId?: string;
  } = {}
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const phone = normalizePhone(phoneNumber);
  if (!phone) {
    return { success: false, error: "Nomor telepon tidak valid" };
  }

  const integration = await db.whatsappIntegration.findFirst();
  if (!integration || integration.status !== "connected") {
    return { success: false, error: "WhatsApp belum terhubung. Sambungkan di menu Integrasi." };
  }

  // Find or create contact
  let contact = await db.whatsappContact.findUnique({ where: { phoneNumber: phone } });
  if (!contact) {
    contact = await db.whatsappContact.create({
      data: {
        phoneNumber: phone,
        displayName: phone, // will be updated when they reply
        source: "MANUAL",
      },
    });
  }

  // Find or create conversation
  let conversationId = options.conversationId;
  if (!conversationId) {
    let conv = await db.whatsappConversation.findFirst({
      where: { contactId: contact.id },
    });
    if (!conv) {
      conv = await db.whatsappConversation.create({
        data: { contactId: contact.id, status: "OPEN" },
      });
    }
    conversationId = conv.id;
  }

  // Create message record (PENDING)
  const message = await db.whatsappMessage.create({
    data: {
      conversationId,
      direction: "OUT",
      type: options.type || (options.templateId ? "TEMPLATE" : "TEXT"),
      body,
      mediaUrl: options.mediaUrl || null,
      status: "PENDING",
      templateId: options.templateId || null,
      metadataJson: JSON.stringify({
        provider: integration.provider,
        attemptedAt: new Date().toISOString(),
        providerMessageId: `mock_${uuidv4().slice(0, 16)}`,
      }),
    },
  });

  // === MOCK DELIVERY SIMULATION ===
  // In production: this would call the provider's API and update status from response.
  // Here we simulate: PENDING → SENT → DELIVERED → READ with small delays.
  setTimeout(async () => {
    try {
      await db.whatsappMessage.update({
        where: { id: message.id },
        data: { status: "SENT", sentAt: new Date() },
      });
      await db.whatsappConversation.update({
        where: { id: conversationId! },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview: body.slice(0, 100),
          lastMessageDirection: "OUT",
        },
      });
      // Simulate delivered after 500ms
      setTimeout(async () => {
        try {
          await db.whatsappMessage.update({
            where: { id: message.id },
            data: { status: "DELIVERED", deliveredAt: new Date() },
          });
          // Simulate read after 2s (60% chance)
          if (Math.random() < 0.6) {
            setTimeout(async () => {
              try {
                await db.whatsappMessage.update({
                  where: { id: message.id },
                  data: { status: "READ", readAt: new Date() },
                });
              } catch {}
            }, 2000);
          }
        } catch {}
      }, 500);
    } catch {}
  }, 200);

  return { success: true, messageId: message.id };
}

/**
 * Send a templated WhatsApp message to a customer (e.g., payment success notification).
 * Resolves variables from customer + transaction context automatically.
 */
export async function sendTemplatedMessageToCustomer(
  customerId: string,
  templateKey: string,
  extraVars: Record<string, string | number | null | undefined> = {}
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    include: { user: { select: { email: true, role: true } } },
  });
  if (!customer) return { success: false, error: "Customer tidak ditemukan" };
  if (!customer.phone) return { success: false, error: "Customer tidak punya nomor telepon" };

  const template = await db.whatsappTemplate.findUnique({ where: { key: templateKey } });
  if (!template) return { success: false, error: `Template "${templateKey}" tidak ditemukan` };

  // Build vars from customer + extra
  const vars: Record<string, string | number | null | undefined> = {
    customer_name: customer.name,
    customer_code: customer.customerCode,
    customer_email: customer.email,
    ...extraVars,
  };

  const rendered = renderTemplate(template.body, vars);
  return sendWhatsappMessage(customer.phone, rendered, { templateId: template.id });
}
