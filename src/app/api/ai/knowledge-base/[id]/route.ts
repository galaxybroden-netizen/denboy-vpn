// MVMP — Knowledge Base document detail: GET, PATCH (update), DELETE
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";

// GET — document detail with chunks
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } }, { status: 401 });
  if (!hasPermission(user.role as any, "ai.view" as any) && user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin" } }, { status: 403 });
  }

  const { id } = await params;
  const doc = await db.aIKnowledgeDocument.findUnique({
    where: { id },
    include: { chunks: { orderBy: { chunkIndex: "asc" } } },
  });

  if (!doc) return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Dokumen tidak ditemukan" } }, { status: 404 });

  return NextResponse.json({ success: true, data: serialize(doc) });
}

// PATCH — update document (re-chunks content if changed)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } }, { status: 401 });
  if (!hasPermission(user.role as any, "ai.manage" as any) && user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin" } }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { title, category, content, visibilityJson, isActive } = body || {};

  const existing = await db.aIKnowledgeDocument.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Dokumen tidak ditemukan" } }, { status: 404 });

  const data: any = {};
  if (title !== undefined) data.title = title;
  if (category !== undefined) data.category = category;
  if (visibilityJson !== undefined) data.visibilityJson = visibilityJson;
  if (isActive !== undefined) data.isActive = isActive;

  // If content changed, re-chunk
  if (content !== undefined && content !== existing.content) {
    data.content = content;

    // Delete old chunks
    await db.aIKnowledgeChunk.deleteMany({ where: { documentId: id } });

    // Create new chunks
    const chunks: string[] = [];
    const chunkSize = 500;
    const overlap = 50;
    for (let i = 0; i < content.length; i += chunkSize - overlap) {
      chunks.push(content.slice(i, i + chunkSize));
      if (i + chunkSize >= content.length) break;
    }

    for (let i = 0; i < chunks.length; i++) {
      const keywords = chunks[i]
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .filter((w, idx, arr) => arr.indexOf(w) === idx)
        .join(" ");
      await db.aIKnowledgeChunk.create({
        data: { documentId: id, chunkIndex: i, content: chunks[i], keywords },
      });
    }
    data.chunkCount = chunks.length;
  }

  const updated = await db.aIKnowledgeDocument.update({ where: { id }, data });

  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const ua = req.headers.get("user-agent") || "unknown";
  await auditLog({ actorUserId: user.id, actorType: user.role as any, action: "KB_DOCUMENT_UPDATE", resourceType: "AIKnowledgeDocument", resourceId: id, ipAddress: ip, userAgent: ua, metadata: { title: updated.title, reChunked: content !== undefined } });

  return NextResponse.json({ success: true, data: serialize(updated) });
}

// DELETE — delete document + all chunks (transactional)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } }, { status: 401 });
  if (!hasPermission(user.role as any, "ai.manage" as any) && user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin" } }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.aIKnowledgeDocument.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Dokumen tidak ditemukan" } }, { status: 404 });

  // Transactional delete: chunks first (via cascade), then document
  await db.$transaction([
    db.aIKnowledgeChunk.deleteMany({ where: { documentId: id } }),
    db.aIKnowledgeDocument.delete({ where: { id } }),
  ]);

  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const ua = req.headers.get("user-agent") || "unknown";
  await auditLog({ actorUserId: user.id, actorType: user.role as any, action: "KB_DOCUMENT_DELETE", resourceType: "AIKnowledgeDocument", resourceId: id, ipAddress: ip, userAgent: ua, metadata: { title: existing.title, category: existing.category } });

  return NextResponse.json({ success: true, data: { id, deleted: true } });
}
