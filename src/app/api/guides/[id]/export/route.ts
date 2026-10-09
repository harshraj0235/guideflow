import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { exportGuide, ExportFormat } from "@/lib/export";

// POST /api/guides/[id]/export - Export guide in various formats
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const guide = await prisma.guide.findUnique({
      where: { id },
      include: {
        steps: { orderBy: { index: "asc" } },
        author: { select: { name: true, email: true } },
      },
    });

    if (!guide) {
      return NextResponse.json({ error: "Guide not found" }, { status: 404 });
    }

    const membership = await prisma.membership.findUnique({ where: { userId_workspaceId: { userId: user.userId, workspaceId: guide.workspaceId } } });
    if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    const body = await request.json();
    const format = (body.format || "markdown") as ExportFormat;

    // Get workspace branding if available
    let branding = null;
    try {
      branding = await prisma.workspaceBranding.findUnique({
        where: { workspaceId: guide.workspaceId },
      });
    } catch { /* branding optional */ }

    const content = exportGuide(guide, {
      format,
      includeBranding: body.includeBranding !== false,
      includeScreenshots: body.includeScreenshots !== false,
      includeNotes: body.includeNotes !== false,
      includeMetadata: body.includeMetadata !== false,
      customCSS: branding?.customCSS || "",
      brandName: branding?.brandName || "GuideFlow",
      brandColor: branding?.brandColor || "#6366f1",
      brandLogo: branding?.logoUrl || undefined,
    });

    // Track export
    try {
      await prisma.analyticsEvent.create({
        data: {
          guideId: id,
          event: "guide_export",
          metadata: JSON.stringify({ format }),
          visitorId: user.userId,
          sessionId: `export_${Date.now()}`,
        },
      });
    } catch { /* analytics optional */ }

    const contentTypes: Record<string, string> = {
      markdown: "text/markdown",
      html: "text/html",
      json: "application/json",
      notion: "text/markdown",
      confluence: "text/html",
    };

    const extensions: Record<string, string> = {
      markdown: "md",
      html: "html",
      json: "json",
      notion: "md",
      confluence: "html",
    };

    return new NextResponse(content, {
      headers: {
        "Content-Type": contentTypes[format] || "text/plain",
        "Content-Disposition": `attachment; filename="${guide.title.replace(/[^a-zA-Z0-9 ]/g, '')}.${extensions[format] || 'txt'}"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Failed to export guide" }, { status: 500 });
  }
}
