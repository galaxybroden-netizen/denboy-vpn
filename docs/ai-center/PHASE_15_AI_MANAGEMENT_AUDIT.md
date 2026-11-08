# MVMP — AI Management System Audit Report (FASE 1)

**Date**: 2026-11-06
**Auditor**: Automated code audit + manual review
**Status**: ⏸️ AUDIT SELESAI — menunggu persetujuan sebelum FASE 2

---

## A. Arsitektur AI Management Saat Ini

### Struktur Folder

```
src/components/mvmp/views/ai/
├── AICenterView.tsx          — Main dashboard dengan 4 tab (Overview/Providers/Models/Configuration)
├── AIAgentView.tsx           — AI Agent chat interface
├── AdminLiveChat.tsx         — WhatsApp Web-style live chat inbox
├── KnowledgeBaseView.tsx     — Knowledge Base document management
└── PromptManagementView.tsx  — System prompt management

src/app/api/ai/
├── overview/route.ts              — GET dashboard stats
├── providers/route.ts             — GET list, POST create
├── providers/[id]/test/route.ts   — POST test connection
├── providers/fetch-models/route.ts — POST dynamic model fetch
├── models/route.ts                — GET list only (NO PATCH/DELETE!)
├── knowledge-base/route.ts        — GET list, POST create
├── knowledge-base/[id]/route.ts   — GET, PATCH, DELETE (complete)
├── conversations/route.ts         — GET list
├── conversations/[id]/route.ts    — GET detail
├── conversations/[id]/messages/route.ts — GET messages
├── conversations/[id]/handover/route.ts — POST takeover/return
├── conversations/[id]/suggest/route.ts  — POST AI suggest
├── agent/route.ts                 — POST agent chat with tools
├── config/route.ts                — GET/PATCH AI config
└── prompts/route.ts               — GET/POST prompts

src/app/api/whatsapp/
├── integration/route.ts           — GET, PATCH
├── integration/connect/route.ts   — POST connect, DELETE disconnect
├── integration/confirm-pair/route.ts — POST confirm QR pairing
├── contacts/route.ts              — GET list, POST create
├── conversations/route.ts         — GET list
├── conversations/[id]/messages/route.ts — GET messages
├── templates/route.ts             — GET, POST
├── broadcasts/route.ts            — GET, POST
├── broadcasts/[id]/route.ts       — DELETE
└── quick-replies/route.ts         — GET, POST

src/lib/
├── ai-provider.ts    — Multi-provider adapter (OpenAI/Anthropic/Gemini/Ollama)
├── crypto.ts         — AES-256-GCM encryption for API keys
├── ssrf.ts           — SSRF protection for provider URLs
├── rate-limit.ts     — In-memory rate limiting
└── whatsapp.ts       — WhatsApp integration lib (279 lines)

mini-services/realtime-service/ — socket.io gateway (port 3003)
```

### Database Models (Prisma) — 19 model terkait AI

| Model | Purpose | Status |
| --- | --- | --- |
| `AIProvider` | Provider config (OpenAI, Anthropic, dll) | ✅ |
| `AIModel` | Model config (gpt-4o, claude-sonnet, dll) | ✅ schema, ❌ no [id] API |
| `AICredential` | Encrypted API keys | ✅ |
| `AIConfiguration` | Singleton config (routing, toggles) | ✅ |
| `AIUsage` | Token usage tracking | ✅ |
| `AIBudget` | Budget limits | ✅ |
| `AIAgent` | Agent config (single-row) | ✅ |
| `AIAgentTool` | Tool registry | ✅ schema, ❌ no seed data |
| `AIExecution` | Approval workflow | ✅ |
| `AIKnowledgeDocument` | KB docs | ✅ |
| `AIKnowledgeChunk` | KB chunks (keyword-based, no vector) | ✅ |
| `AIPrompt` | System prompts | ✅ |
| `AIPromptVersion` | Prompt versioning | ✅ |
| `ChatConversation` | Live chat conversations | ✅ |
| `ChatMessage` | Chat messages | ✅ |
| `ChatAssignment` | Admin assignments | ✅ |
| `ChatSuggestedReply` | AI suggested replies | ✅ |
| `ChatAuditLog` | Chat audit trail | ✅ |
| `WhatsappIntegration` | WA connection config | ✅ |
| `WhatsappContact` | Contact list | ✅ |
| `WhatsappConversation` | WA conversations | ✅ |
| `WhatsappMessage` | WA messages | ✅ |
| `WhatsappTemplate` | WA templates | ✅ |
| `WhatsappBroadcast` | Broadcast campaigns | ✅ |
| `WhatsappQuickReply` | Quick replies | ✅ |

---

## B. Kondisi Masing-Masing Modul

### B1. Models Management — ❌ BUG (tidak ada Edit/Delete)

**Backend status**:
- ✅ `GET /api/ai/models` — list dengan filter category/provider
- ❌ `PATCH /api/ai/models/[id]` — **TIDAK ADA** (folder [id] tidak exist)
- ❌ `DELETE /api/ai/models/[id]` — **TIDAK ADA**
- ❌ `POST /api/ai/models` — **TIDAK ADA** (model hanya dibuat via provider creation)

**Frontend status**:
- `ModelsTab` di AICenterView.tsx (line 1966) — hanya filter + table display
- ❌ TIDAK ada kolom "Aksi" di Models table
- ❌ TIDAK ada dialog Edit Model
- ❌ TIDAK ada dialog konfirmasi Delete Model
- ❌ TIDAK ada tombol Edit/Hapus per model

**Penyebab**: Models dianggap sebagai child dari Provider — dibuat saat Provider dibuat (auto-create model). Tapi tidak ada UI/API untuk edit/delete model individual.

### B2. Knowledge Base Management — ❌ BUG (UI tidak terhubung ke backend)

**Backend status** — LENGKAP:
- ✅ `GET /api/ai/knowledge-base` — list
- ✅ `POST /api/ai/knowledge-base` — create
- ✅ `GET /api/ai/knowledge-base/[id]` — detail + chunks
- ✅ `PATCH /api/ai/knowledge-base/[id]` — update + re-chunk otomatis
- ✅ `DELETE /api/ai/knowledge-base/[id]` — transactional delete (chunks + doc)

**Frontend status** — BUG:
- `KnowledgeBaseView.tsx` line 265-276:
  ```js
  function handleEdit(doc) {
    toast.info("Fitur edit segera hadir");  // ← stub, tidak call API
  }
  function confirmDelete() {
    toast.info("Fitur delete segera hadir");  // ← stub, tidak call API
    setDeleteItem(null);
  }
  ```
- ❌ Edit hanya tampilkan toast "segera hadir" — tidak terhubung ke PATCH API
- ❌ Delete hanya tampilkan toast "segera hadir" — tidak terhubung ke DELETE API
- Padahal backend PATCH/DELETE sudah complete dengan re-chunking + audit log

**Penyebab**: UI belum di-wire ke backend API yang sudah ada. Dialog Edit/Delete sudah ada (AlertDialog) tapi handler-nya stub.

### B3. Live Chat Layout — ⚠️ Perlu verifikasi + Tambah Kontak

**Layout structure** (`AdminLiveChat.tsx`):
- Container: `flex h-[calc(100vh-8rem)]` — fixed height 100vh - 8rem
- 3 panel: LEFT (280px conversation list) + CENTER (thread) + RIGHT (profile)
- Mobile: Tabs switcher (list/thread/profile)
- ScrollArea untuk message thread

**Potensi layout bug**:
- `h-[calc(100vh-8rem)]` — bisa salah jika parent container punya transform/padding
- Tidak ada `min-h-0` di flex children → bisa cause overflow
- Tidak ada `overflow-hidden` di parent → bisa bocor ke sidebar

**Fitur Tambah Kontak**:
- ❌ TIDAK ADA tombol "Tambah Kontak" di conversation list
- Backend `POST /api/whatsapp/contacts` SUDAH ADA — tinggal wire UI
- `WhatsappContact` model LENGKAP (phoneNumber, displayName, source, tags)

### B4. AI Agent Chat Interface — ⚠️ Terlalu sempit + belum lengkap

**Layout bug**:
- `AIAgentView.tsx` line 286: `Card className="mx-auto flex h-[calc(100vh-12rem)] max-w-3xl"`
- `max-w-3xl` = 768px — TERLALU KECIL untuk full-page chat
- Seharusnya pakai `w-full max-w-none` atau `max-w-6xl`

**Fitur yang ADA**:
- ✅ Model selector (line 326-330) — pakai `selectedModel` state, kirim ke `/api/ai/agent`
- ✅ Conversation history (sebelumnya)
- ✅ Tool call display
- ✅ Approval workflow display
- ✅ Send message

**Fitur yang TIDAK ADA**:
- ❌ Attachment/upload file — tidak ada tombol, tidak ada API upload
- ❌ Plan Mode / Build Mode / Chat Mode — tidak ada toggle
- ❌ Context selector — tidak ada UI pilih Knowledge Base
- ❌ Stop generation — tidak ada cancel button
- ❌ Regenerate response — tidak ada
- ❌ Copy response — tidak ada
- ❌ New conversation button — perlu cek

### B5. Telegram Integration — ❌ TIDAK ADA SAMA SEKALI

**Status**: 0% implemented
- ❌ Tidak ada model di Prisma schema (grep "telegram" = empty)
- ❌ Tidak ada API route
- ❌ Tidak ada lib
- ❌ Tidak ada UI

**Perlu buat dari scratch**:
- Prisma model `TelegramIntegration` + `TelegramConversation` + `TelegramMessage`
- API routes: config, webhook, send message
- Lib: `src/lib/telegram.ts` — Telegram Bot API client
- UI: Telegram configuration page di Settings atau AI Center

### B6. WhatsApp Integration — ✅ Sebagian besar ada

**Status**: 70% implemented
- ✅ Prisma models LENGKAP (8 model terkait WhatsApp)
- ✅ API routes: 10 routes (integration, contacts, conversations, templates, broadcasts, quick-replies)
- ✅ Lib `src/lib/whatsapp.ts` (279 baris) — provider adapter
- ✅ Provider support: baileys (default), meta_cloud, api
- ✅ QR code pairing flow (connect/confirm-pair)

**Yang TIDAK ADA / perlu cek**:
- ❌ Webhook receiver endpoint untuk incoming messages — perlu cek
- ❌ Signature validation untuk Meta Cloud API
- ❌ Integrasi dengan AI Agent — pesan WA masuk belum otomatis ke AI Agent
- ❌ Default Agent / Default Model config per integration
- ❌ Connection status real-time update

---

## C. Penyebab Setiap Keluhan

| Keluhan | Modul | Penyebab | Status Backend | Status UI |
| --- | --- | --- | --- | --- |
| Models tidak bisa Edit | Models Management | Tidak ada API PATCH/DELETE untuk model individual | ❌ Tidak ada | ❌ Tidak ada kolom Aksi |
| Models tidak bisa Hapus | Models Management | Sama — tidak ada API DELETE | ❌ Tidak ada | ❌ Tidak ada tombol Hapus |
| KB Edit "segera hadir" | Knowledge Base | UI handler stub, tidak call PATCH API | ✅ PATCH ada | ❌ Stub toast |
| KB Hapus tidak berfungsi | Knowledge Base | UI handler stub, tidak call DELETE API | ✅ DELETE ada | ❌ Stub toast |
| Live Chat layout rusak | AdminLiveChat | `h-[calc(100vh-8rem)]` + tidak ada `min-h-0` di flex children | — | ⚠️ Perlu fix |
| Tidak ada Tambah Kontak | AdminLiveChat | Tombol tidak ada di UI | ✅ POST ada | ❌ Tidak ada tombol |
| AI Agent chat terlalu kecil | AIAgentView | `max-w-3xl` (768px) — harus full width | — | ❌ Perlu fix |
| Tidak ada Model Selector | AIAgentView | Sebenarnya ADA (line 326) tapi mungkin tidak visible | — | ✅ Ada (verify) |
| Tidak ada Upload File | AIAgentView | Tidak ada tombol + tidak ada API upload | ❌ Tidak ada | ❌ Tidak ada |
| Tidak ada Plan/Build Mode | AIAgentView | Tidak ada toggle mode di UI | ❌ Backend agent hanya single mode | ❌ Tidak ada |
| Tidak ada Telegram | Telegram | Tidak ada implementasi sama sekali | ❌ 0% | ❌ 0% |
| WhatsApp tidak terintegrasi AI | WhatsApp | Webhook + AI Agent routing belum ada | ⚠️ Sebagian | ⚠️ Sebagian |

---

## D. Komponen yang Sudah Tersedia dan Dapat Digunakan Kembali

| Komponen | Lokasi | Status |
| --- | --- | --- |
| shadcn/ui Select, Dialog, AlertDialog, Table, Tabs, Badge, etc. | `src/components/ui/*` | ✅ Lengkap |
| `apiFetch` helper | `src/components/mvmp/lib` | ✅ |
| `EmptyState` component | `src/components/mvmp/lib` | ✅ |
| `PageHeader` component | `src/components/mvmp/PageHeader` | ✅ |
| `formatDateTime`, `timeAgo` | `src/lib/utils-mvmp` | ✅ |
| `cn` utility | `src/lib/utils` | ✅ |
| `auditLog` | `src/lib/auth` | ✅ |
| `getSessionUser`, `hasPermission` | `src/lib/auth` | ✅ |
| `serialize` (BigInt safe) | `src/lib/utils-mvmp` | ✅ |
| AES-256-GCM encryption | `src/lib/crypto` | ✅ |
| SSRF protection | `src/lib/ssrf` | ✅ |
| Rate limiting | `src/lib/rate-limit` | ✅ |
| Multi-provider AI adapter | `src/lib/ai-provider` | ✅ |
| WhatsApp lib | `src/lib/whatsapp` | ✅ |
| Realtime socket.io | `mini-services/realtime-service` | ✅ |
| RBAC (4 roles, 24 permissions) | `src/lib/auth` | ✅ |

---

## E. Gap Analysis — Kebutuhan vs Kondisi Saat Ini

| # | Kebutuhan | Kondisi Saat Ini | Gap |
| --- | --- | --- | --- |
| 1 | Models Edit | Tidak ada API + UI | Buat `/api/ai/models/[id]/route.ts` (PATCH) + dialog Edit di ModelsTab |
| 2 | Models Hapus | Tidak ada API + UI | Buat DELETE handler + dialog konfirmasi + dependency check |
| 3 | KB Edit berfungsi | Backend ada, UI stub | Wire `handleEdit` ke PATCH API + dialog form |
| 4 | KB Hapus berfungsi | Backend ada, UI stub | Wire `confirmDelete` ke DELETE API |
| 5 | Live Chat layout stabil | Layout ada, potensi overflow | Fix `min-h-0` + `overflow-hidden` di flex children |
| 6 | Tambah Kontak | Backend POST ada | Tambah tombol + modal form di conversation list |
| 7 | AI Agent chat lebar | `max-w-3xl` (768px) | Ubah ke `w-full max-w-6xl` atau full width |
| 8 | Model Selector Agent | ADA (verify) | Pastikan visible + berfungsi |
| 9 | Upload File Agent | Tidak ada | Buat API upload + tombol attachment + preview |
| 10 | Plan/Build/Chat Mode | Tidak ada | Tambah toggle mode + integrasi backend |
| 11 | Context Selector | Tidak ada | Tambah dropdown pilih Knowledge Base |
| 12 | Stop/Regenerate/Copy | Tidak ada | Tambah toolbar buttons |
| 13 | Telegram Integration | 0% | Buat dari scratch (model + API + lib + UI) |
| 14 | WhatsApp + AI Agent | Sebagian | Buat webhook receiver + routing ke AI Agent |
| 15 | WhatsApp signature validation | Tidak ada | Tambah HMAC validation untuk Meta Cloud |

---

## F. Rencana Teknis Perbaikan per Fase

### FASE 2 — Models & Knowledge Base
**File yang akan diubah/dibuat**:
1. `src/app/api/ai/models/[id]/route.ts` — NEW: PATCH (update) + DELETE (with dependency check)
2. `src/components/mvmp/views/ai/AICenterView.tsx` — MODIFIED: tambah kolom Aksi di ModelsTab + Edit dialog + Delete confirmation
3. `src/components/mvmp/views/ai/KnowledgeBaseView.tsx` — MODIFIED: wire `handleEdit` ke PATCH API + `confirmDelete` ke DELETE API + form dialog

**Risiko**: 
- DELETE model yang sedang digunakan oleh AIConfiguration (chatbotModelId, agentModelId, dll) → perlu dependency check sebelum delete
- KB re-chunking saat edit content → pastikan chunks ter-delete dan re-create dengan benar (sudah ada di backend)

### FASE 3 — Live Chat
**File yang akan diubah**:
1. `src/components/mvmp/views/ai/AdminLiveChat.tsx` — MODIFIED: fix layout (`min-h-0`, `overflow-hidden`) + tambah tombol "Tambah Kontak" + modal form

**Risiko**: 
- Layout change bisa affect responsive behavior → test di 4 viewport
- Tambah Kontak harus validate phoneNumber unique (WhatsappContact.phoneNumber @unique)

### FASE 4 — AI Agent
**File yang akan diubah/dibuat**:
1. `src/components/mvmp/views/ai/AIAgentView.tsx` — MODIFIED: layout full width + tambah toolbar (attachment, context, mode toggle, stop, regenerate, copy)
2. `src/app/api/ai/agent/route.ts` — MODIFIED: terima `mode` (plan/build/chat), `contextKbIds`, `attachments`
3. `src/app/api/upload/route.ts` — NEW: file upload API (PDF/DOCX/TXT/MD/CSV/image)
4. `src/lib/file-upload.ts` — NEW: file processing lib

**Risiko**:
- Plan/Build mode butuh backend orchestration yang berbeda — agent API saat ini hanya single mode
- File upload butuh storage strategy (local disk vs S3) → gunakan local disk untuk MVP
- Virus/malicious file protection → validasi MIME type + size limit

### FASE 5 — Telegram
**File yang akan dibuat (dari scratch)**:
1. `prisma/schema.prisma` — MODIFIED: tambah model `TelegramIntegration`, `TelegramConversation`, `TelegramMessage`
2. `src/app/api/telegram/config/route.ts` — NEW: GET/PATCH config
3. `src/app/api/telegram/webhook/route.ts` — NEW: webhook receiver
4. `src/app/api/telegram/send/route.ts` — NEW: send message
5. `src/lib/telegram.ts` — NEW: Telegram Bot API client
6. `src/components/mvmp/views/ai/TelegramIntegrationView.tsx` — NEW: config UI
7. Migration: `prisma db push` untuk apply schema changes

**Risiko**:
- Schema change butuh migration → backup DB dulu
- Webhook butuh public URL → di sandbox tidak bisa test full flow, dokumentasikan
- Bot Token harus encrypted (pakai AES-256-GCM dari src/lib/crypto.ts)

### FASE 6 — WhatsApp + AI Agent Integration
**File yang akan diubah/dibuat**:
1. `src/app/api/whatsapp/webhook/route.ts` — NEW: webhook receiver untuk incoming messages
2. `src/lib/whatsapp.ts` — MODIFIED: tambah signature validation untuk Meta Cloud
3. `src/app/api/whatsapp/integration/route.ts` — MODIFIED: tambah defaultAgentId, defaultModelId, defaultKbId fields
4. `prisma/schema.prisma` — MODIFIED: tambah field defaultAgentId/defaultModelId/defaultKbId di WhatsappIntegration
5. Routing: pesan WA masuk → AI Agent processing → balas via WA

**Risiko**:
- Webhook signature validation butuh APP_SECRET dari Meta → perlu config
- 24-hour customer service window → dokumentasikan batasan
- Duplicate webhook handling → pakai idempotency key (sudah ada di ChatMessage)

### FASE 7 — Integration Testing
- Test end-to-end: Web Chat → AI Agent → Response
- Test: WhatsApp message → AI Agent → Response → WA reply
- Test: Telegram message → AI Agent → Response → Telegram reply
- Test: Model selector benar-benar mengubah model yang dipakai backend
- Test: KB retrieval bekerja di Agent chat

### FASE 8 — Final Audit
- Regression test semua modul yang sudah berjalan
- Security check: credential masking, RBAC, SSRF, rate limit
- Runtime verification via Playwright
- Dokumentasi final

---

## G. Daftar File yang Kemungkinan Perlu Diubah

| Fase | File | Aksi | Estimasi baris |
| --- | --- | --- | --- |
| 2 | `src/app/api/ai/models/[id]/route.ts` | NEW | ~120 |
| 2 | `src/components/mvmp/views/ai/AICenterView.tsx` | MODIFY (ModelsTab) | +150 |
| 2 | `src/components/mvmp/views/ai/KnowledgeBaseView.tsx` | MODIFY (wire handlers) | +80 |
| 3 | `src/components/mvmp/views/ai/AdminLiveChat.tsx` | MODIFY (layout + Tambah Kontak) | +100 |
| 4 | `src/components/mvmp/views/ai/AIAgentView.tsx` | MODIFY (layout + toolbar) | +200 |
| 4 | `src/app/api/ai/agent/route.ts` | MODIFY (mode + context + attachments) | +80 |
| 4 | `src/app/api/upload/route.ts` | NEW | ~100 |
| 4 | `src/lib/file-upload.ts` | NEW | ~80 |
| 5 | `prisma/schema.prisma` | MODIFY (Telegram models) | +60 |
| 5 | `src/app/api/telegram/config/route.ts` | NEW | ~100 |
| 5 | `src/app/api/telegram/webhook/route.ts` | NEW | ~150 |
| 5 | `src/app/api/telegram/send/route.ts` | NEW | ~80 |
| 5 | `src/lib/telegram.ts` | NEW | ~200 |
| 5 | `src/components/mvmp/views/ai/TelegramIntegrationView.tsx` | NEW | ~250 |
| 6 | `src/app/api/whatsapp/webhook/route.ts` | NEW | ~180 |
| 6 | `src/lib/whatsapp.ts` | MODIFY (signature validation) | +50 |
| 6 | `src/app/api/whatsapp/integration/route.ts` | MODIFY (default agent/model/kb) | +30 |
| 6 | `prisma/schema.prisma` | MODIFY (WA fields) | +15 |

**Total estimasi**: ~1900 baris baru/modifikasi

---

## H. Risiko dan Dependency

| Risiko | Severity | Mitigasi |
| --- | --- | --- |
| Schema change (Telegram + WA fields) butuh migration | Medium | Backup DB sebelum `prisma db push` |
| DELETE model yang dipakai AIConfiguration bisa break system | High | Dependency check sebelum delete — query AIConfiguration.chatbotModelId/agentModelId |
| File upload security (malicious file) | High | Validasi MIME type + extension whitelist + size limit + antivirus scan (jika available) |
| Webhook butuh public URL (sandbox tidak bisa test full) | Medium | Dokumentasikan sebagai BLOCKED untuk sandbox testing |
| Telegram Bot Token harus encrypted | High | Pakai AES-256-GCM dari src/lib/crypto.ts |
| WhatsApp 24-hour window | Low | Dokumentasikan batasan, gunakan template message untuk outside window |
| Plan/Build mode butuh backend orchestration change | Medium | Agent API saat ini single mode — perlu extend untuk mode parameter |
| Layout fix Live Chat bisa affect responsive | Low | Test di 4 viewport setelah fix |
| AIAgentView layout change bisa affect tool call display | Low | Preserve existing tool call + approval UI |

---

## I. Strategi Testing dan Verifikasi

| Test Type | Tools | Coverage |
| --- | --- | --- |
| TypeScript check | `npx tsc --noEmit` | Semua file yang diubah |
| API test | curl + Playwright | Setiap endpoint baru/modifikasi |
| Browser runtime test | Playwright (via scripts/verify-dropdown-v3.js pattern) | UI flow per modul |
| Responsive test | Playwright 4 viewport (1920/1366/768/375) | Layout stability |
| Theme test | Playwright dark + light | Konsistensi tema |
| Security test | Manual code review + grep | Credential masking, RBAC, SSRF |
| Integration test | Playwright end-to-end | Web Chat → AI Agent → Response |
| Regression test | Playwright existing flows | Modul yang sudah berjalan tidak rusak |

---

## J. Definition of Done per Fase

Setiap fase dinyatakan PASS jika:
1. ✅ TypeScript clean (no errors)
2. ✅ Halaman compile HTTP 200
3. ✅ API endpoint return expected response
4. ✅ UI flow berfungsi (Playwright test)
5. ✅ Tidak ada regression di modul lain
6. ✅ Responsive di 4 viewport
7. ✅ Dark + light theme konsisten
8. ✅ Security check lulus (credential masking, RBAC)
9. ✅ Runtime verification via Playwright

---

## 🛑 STOP — Menunggu Persetujuan

**Audit selesai.** Saya sudah memahami keseluruhan sistem AI Management, mengidentifikasi bug, gap, dan rencana perbaikan per fase.

**Yang sudah tersedia dan dapat digunakan kembali**:
- Backend KB API lengkap (GET/PATCH/DELETE dengan re-chunking)
- WhatsApp models + API + lib (70% complete)
- AI Agent API dengan tool execution
- All shadcn/ui components + helpers
- AES-256-GCM encryption + SSRF protection + rate limiting

**Yang perlu dibuat/diperbaiki**:
- Models [id] API (PATCH/DELETE) + UI kolom Aksi
- KB UI wire ke backend yang sudah ada
- Live Chat layout fix + Tambah Kontak
- AI Agent layout full width + toolbar (attachment, mode, context)
- Telegram integration dari scratch
- WhatsApp webhook + AI Agent routing

**Pertanyaan untuk Anda**:
1. Apakah Anda setuju dengan rencana perbaikan per fase di atas?
2. Apakah ada prioritas fase yang ingin diubah?
3. Apakah ada batasan tertentu yang perlu saya ketahui sebelum mulai FASE 2?
4. Untuk Telegram — apakah Anda sudah punya Bot Token untuk testing, atau ini hanya implementasi UI/config saja?

**Tunggu instruksi Anda sebelum mulai FASE 2.**
