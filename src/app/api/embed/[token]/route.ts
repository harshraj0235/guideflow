import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/embed/[token] - Get guide data for embed widget
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const shareLink = await prisma.shareLink.findUnique({
      where: { token },
      include: {
        guide: {
          include: {
            steps: {
              orderBy: { index: "asc" },
              select: {
                index: true,
                instruction: true,
                notes: true,
                screenshotUrl: true,
                selector: true,
                hotkey: true,
              },
            },
            author: { select: { name: true } },
          },
        },
      },
    });

    if (!shareLink || shareLink.isRevoked || shareLink.accessMode === "private" || !!shareLink.password) {
      return NextResponse.json({ error: "Guide not found" }, { status: 404 });
    }

    if (shareLink.expiresAt && new Date(shareLink.expiresAt) < new Date()) {
      return NextResponse.json({ error: "Link expired" }, { status: 410 });
    }

    // Increment view count
    await prisma.shareLink.update({
      where: { id: shareLink.id },
      data: { viewCount: { increment: 1 } },
    });

    return NextResponse.json({
      guide: {
        title: shareLink.guide.title,
        description: shareLink.guide.description,
        steps: shareLink.guide.steps,
        authorName: shareLink.guide.author.name,
        stepCount: shareLink.guide.steps.length,
      },
    }, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Embed API error:", error);
    return NextResponse.json({ error: "Failed to load guide" }, { status: 500 });
  }
}
