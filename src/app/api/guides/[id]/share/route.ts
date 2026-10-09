import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { randomBytes } from "crypto";

// POST /api/guides/[id]/share - Create a share link
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
      select: { workspaceId: true },
    });

    if (!guide) {
      return NextResponse.json({ error: "Guide not found" }, { status: 404 });
    }

    const membership = await prisma.membership.findUnique({
      where: {
        userId_workspaceId: {
          userId: user.userId,
          workspaceId: guide.workspaceId,
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    if (body.accessMode && !["private", "unlisted", "public"].includes(body.accessMode)) return NextResponse.json({ error: "Invalid access mode" }, { status: 400 });
    if (body.expiresInDays !== undefined && (!Number.isFinite(body.expiresInDays) || body.expiresInDays <= 0 || body.expiresInDays > 3650)) return NextResponse.json({ error: "Invalid expiry" }, { status: 400 });
    const token = randomBytes(24).toString("base64url");

    const shareLink = await prisma.shareLink.create({
      data: {
        guideId: id,
        token,
        accessMode: body.accessMode || "unlisted",
        expiresAt: body.expiresInDays
          ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000)
          : null,
      },
    });

    const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/view/${token}`;

    return NextResponse.json({
      shareLink: {
        id: shareLink.id,
        token: shareLink.token,
        url: shareUrl,
        accessMode: shareLink.accessMode,
        expiresAt: shareLink.expiresAt,
      },
    });
  } catch (error) {
    console.error("Create share link error:", error);
    return NextResponse.json(
      { error: "Failed to create share link" },
      { status: 500 }
    );
  }
}

// DELETE /api/guides/[id]/share - Revoke a share link
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { shareLinkId } = body;

    if (!shareLinkId) {
      return NextResponse.json(
        { error: "Share link ID is required" },
        { status: 400 }
      );
    }

    // Verify ownership
    const shareLink = await prisma.shareLink.findUnique({
      where: { id: shareLinkId },
      include: { guide: { select: { workspaceId: true } } },
    });

    if (!shareLink || shareLink.guideId !== id) {
      return NextResponse.json(
        { error: "Share link not found" },
        { status: 404 }
      );
    }

    const membership = await prisma.membership.findUnique({
      where: {
        userId_workspaceId: {
          userId: user.userId,
          workspaceId: shareLink.guide.workspaceId,
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await prisma.shareLink.update({
      where: { id: shareLinkId },
      data: { isRevoked: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Revoke share link error:", error);
    return NextResponse.json(
      { error: "Failed to revoke share link" },
      { status: 500 }
    );
  }
}
