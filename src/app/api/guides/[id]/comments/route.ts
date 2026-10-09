import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/guides/[id]/comments - List comments
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const comments = await prisma.comment.findMany({
      where: { guideId: id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ comments });
  } catch (error) {
    console.error("List comments error:", error);
    return NextResponse.json({ error: "Failed to fetch comments" }, { status: 500 });
  }
}

// POST /api/guides/[id]/comments - Add a comment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body.content?.trim()) {
      return NextResponse.json({ error: "Comment content is required" }, { status: 400 });
    }

    const guide = await prisma.guide.findUnique({ where: { id } });
    if (!guide) {
      return NextResponse.json({ error: "Guide not found" }, { status: 404 });
    }

    const comment = await prisma.comment.create({
      data: {
        guideId: id,
        stepIndex: body.stepIndex ?? null,
        authorName: body.authorName || "Anonymous",
        authorEmail: body.authorEmail || "",
        content: body.content.trim(),
        type: body.type || "comment",
      },
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    console.error("Create comment error:", error);
    return NextResponse.json({ error: "Failed to create comment" }, { status: 500 });
  }
}
