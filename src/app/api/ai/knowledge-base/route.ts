// MVMP — AI Knowledge Base documents
// GET  — list documents. Filters: ?category=, ?search= (title OR content, contains).
//        Include _count: { chunks: true }. Ordered by createdAt desc.
// POST — create document. Body: { title, category, content, visibilityJson?,
//        sourceType?, sourceUrl?, fileName? }.
//        After create: auto-chunk content into 500-char chunks with 50-char overlap,
//        extract keywords per chunk (split by spaces, filter >3 chars, unique),
//        create AIKnowledgeChunk records, update document.chunkCount.
//        Audit: KB_DOCUMENT_CREATE.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";

const ALLOWED_CATEGORIES = new Set([
  "faq",
  "product",
  "protocol",
  "troubleshooting",
  "pricing",
  "policy",
  "reseller",
  "article",
]);

const ALLOWED_SOURCE_TYPES = new Set(["manual", "upload", "url"]);

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;

/**
 * Split `content` into overlapping chunks of ~CHUNK_SIZE characters.
 * Each subsequent chunk starts CHUNK_OVERLAP characters before the end of the
 * previous one so context is preserved across chunk boundaries.
 */
function chunkContent(content: string): string[] {
  const text = (content || "").trim();
  if (!text) return [];
  if (text.length <= CHUNK_SIZE) return [text];

  const chunks: string[] = [];
  const step = Math.max(1, CHUNK_SIZE - CHUNK_OVERLAP); // 450
  for (let i = 0; i < text.length; i += step) {
    const chunk = text.slice(i, i + CHUNK_SIZE);
    chunks.push(chunk);
    if (i + CHUNK_SIZE >= text.length) break;
  }
  return chunks;
}

/**
 * Extract a unique space-separated keyword index from a chunk.
 * Tokens are lowercased, filtered to those longer than 3 chars, and de-duplicated.
 */
function extractKeywords(chunk: string): string {
  const seen = new Set<string>();
  const words = (chunk || "")
    .toLowerCase()
    .split(/[\s,.;:!?\-_\n\r\t"'`(){}\[\]|/\\]+/)
    .filter((w) => w.length > 3 && !seen.has(w) && seen.add(w));
  return words.slice(0, 100).join(" ");
}

// GET — list documents
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }
    if (!hasPermission(user.role as any, "ai.view" as any)) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melihat knowledge base" } },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category")?.trim() || "";
    const search = searchParams.get("search")?.trim() || "";

    const where: any = {};
    if (category && ALLOWED_CATEGORIES.has(category)) where.category = category;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { content: { contains: search, mode: "insensitive" } },
      ];
    }

    const items = await db.aIKnowledgeDocument.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { chunks: true } },
      },
    });

    return NextResponse.json({ success: true, data: serialize({ items }) });
  } catch (e: any) {
    console.error("AI knowledge base list error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

// POST — create document + auto-chunk content
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
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin menambah knowledge base" } },
        { status: 403 }
      );
    }

    const body = (await req.json()) || {};
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const category = typeof body.category === "string" ? body.category.trim() : "";
    const content = typeof body.content === "string" ? body.content : "";

    if (!title) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Field wajib: title" } },
        { status: 400 }
      );
    }
    if (!category || !ALLOWED_CATEGORIES.has(category)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: `category tidak valid. Pilihan: ${[...ALLOWED_CATEGORIES].join(", ")}`,
          },
        },
        { status: 400 }
      );
    }
    if (!content.trim()) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Field wajib: content" } },
        { status: 400 }
      );
    }

    const sourceType =
      body.sourceType && ALLOWED_SOURCE_TYPES.has(String(body.sourceType))
        ? String(body.sourceType)
        : "manual";
    const sourceUrl =
      typeof body.sourceUrl === "string" && body.sourceUrl.trim() ? body.sourceUrl.trim() : null;
    const fileName =
      typeof body.fileName === "string" && body.fileName.trim() ? body.fileName.trim() : null;
    const visibilityJson =
      body.visibilityJson === undefined || body.visibilityJson === null
        ? null
        : typeof body.visibilityJson === "string"
          ? body.visibilityJson
          : JSON.stringify(body.visibilityJson);

    // 1. Create the document (chunkCount=0 — updated after chunking)
    const document = await db.aIKnowledgeDocument.create({
      data: {
        title,
        category,
        content,
        sourceType,
        sourceUrl,
        fileName,
        visibilityJson,
        chunkCount: 0,
        isActive: true,
        createdBy: user.id,
      },
    });

    // 2. Auto-chunk the content
    const chunks = chunkContent(content);

    // 3. Create AIKnowledgeChunk records (with keyword index per chunk)
    if (chunks.length > 0) {
      await db.aIKnowledgeChunk.createMany({
        data: chunks.map((chunk, idx) => ({
          documentId: document.id,
          chunkIndex: idx,
          content: chunk,
          keywords: extractKeywords(chunk),
        })),
      });
    }

    // 4. Update document.chunkCount
    const updated = await db.aIKnowledgeDocument.update({
      where: { id: document.id },
      data: { chunkCount: chunks.length },
      include: {
        _count: { select: { chunks: true } },
      },
    });

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role as any,
      action: "KB_DOCUMENT_CREATE",
      resourceType: "AIKnowledgeDocument",
      resourceId: document.id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        title,
        category,
        sourceType,
        contentLength: content.length,
        chunkCount: chunks.length,
      },
    });

    return NextResponse.json(
      { success: true, data: serialize(updated) },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("AI knowledge base create error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
