// MVMP — AI Prompts management
// GET  — list all prompts with their current version (published) + versions count.
// POST — create new prompt. Body: { key, name, description?, content }.
//        Creates AIPrompt + AIPromptVersion (version=1, status="published",
//        publishedAt=now, publishedBy=user.id). Links currentVersionId to the new
//        version. Audit: AI_PROMPT_CREATE.
//
// Note: AIPrompt has `currentVersionId` (scalar) + `versions[]` relation but no
// `currentVersion` relation, so the current version is fetched in a second query
// (by currentVersionId) and attached as `currentVersion` for display.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasPermission, auditLog } from "@/lib/auth";
import { serialize } from "@/lib/utils-mvmp";

// GET — list prompts with current version + versions count
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
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin melihat AI prompts" } },
        { status: 403 }
      );
    }

    // Load all prompts with versions count (no currentVersion relation — fetch below)
    const prompts = await db.aIPrompt.findMany({
      orderBy: [{ key: "asc" }],
      include: {
        _count: { select: { versions: true } },
      },
    });

    // Resolve current versions:
    //   1. By currentVersionId if set
    //   2. Otherwise latest published version for that prompt
    const promptsWithLinkedId = prompts.filter((p) => p.currentVersionId);
    const promptsWithoutLinkedId = prompts.filter((p) => !p.currentVersionId);

    const linkedVersionIds = promptsWithLinkedId.map((p) => p.currentVersionId as string);
    const linkedVersions =
      linkedVersionIds.length > 0
        ? await db.aIPromptVersion.findMany({ where: { id: { in: linkedVersionIds } } })
        : [];

    const latestForUnlinked =
      promptsWithoutLinkedId.length > 0
        ? await db.aIPromptVersion.findMany({
            where: {
              promptId: { in: promptsWithoutLinkedId.map((p) => p.id) },
              status: "published",
            },
            orderBy: [{ version: "desc" }],
          })
        : [];

    // Build lookup maps
    const linkedByVerId = new Map(linkedVersions.map((v) => [v.id, v]));
    const latestByPromptId = new Map<string, (typeof latestForUnlinked)[number]>();
    for (const v of latestForUnlinked) {
      if (!latestByPromptId.has(v.promptId)) latestByPromptId.set(v.promptId, v);
    }

    const items = prompts.map((p) => ({
      ...p,
      currentVersion:
        (p.currentVersionId && linkedByVerId.get(p.currentVersionId)) ||
        latestByPromptId.get(p.id) ||
        null,
    }));

    return NextResponse.json({ success: true, data: serialize({ items }) });
  } catch (e: any) {
    console.error("AI prompts list error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}

// POST — create a new prompt + initial published version
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
        { success: false, error: { code: "FORBIDDEN", message: "Anda tidak memiliki izin menambah AI prompt" } },
        { status: 403 }
      );
    }

    const body = (await req.json()) || {};
    const key = typeof body.key === "string" ? body.key.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const content = typeof body.content === "string" ? body.content : "";
    const description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : null;

    if (!key) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Field wajib: key" } },
        { status: 400 }
      );
    }
    if (!/^[a-z0-9_\.]+$/i.test(key)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "key hanya boleh huruf, angka, underscore, dan titik",
          },
        },
        { status: 400 }
      );
    }
    if (!name) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Field wajib: name" } },
        { status: 400 }
      );
    }
    if (!content.trim()) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Field wajib: content" } },
        { status: 400 }
      );
    }

    // Uniqueness check — key is unique in the schema
    const existing = await db.aIPrompt.findUnique({ where: { key } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: "DUPLICATE", message: `Prompt dengan key "${key}" sudah ada` } },
        { status: 409 }
      );
    }

    // Create AIPrompt + initial AIPromptVersion (version=1, published) atomically.
    // Then link currentVersionId to the new version.
    const now = new Date();
    const prompt = await db.aIPrompt.create({
      data: {
        key,
        name,
        description,
        isActive: true,
        currentVersionId: null, // linked below
      },
      include: {
        _count: { select: { versions: true } },
      },
    });

    const version = await db.aIPromptVersion.create({
      data: {
        promptId: prompt.id,
        version: 1,
        content,
        status: "published",
        publishedAt: now,
        publishedBy: user.id,
        temperature: 0.7,
        maxTokens: 2048,
      },
    });

    const linked = await db.aIPrompt.update({
      where: { id: prompt.id },
      data: { currentVersionId: version.id },
      include: {
        _count: { select: { versions: true } },
      },
    });

    // Attach the current version object for the response (no relation in schema)
    const response = { ...linked, currentVersion: version };

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";
    await auditLog({
      actorUserId: user.id,
      actorType: user.role as any,
      action: "AI_PROMPT_CREATE",
      resourceType: "AIPrompt",
      resourceId: prompt.id,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        key,
        name,
        versionId: version.id,
        versionNumber: version.version,
        contentLength: content.length,
      },
    });

    return NextResponse.json(
      { success: true, data: serialize(response) },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("AI prompt create error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
