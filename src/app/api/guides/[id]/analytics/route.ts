import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getGuideAnalytics } from "@/lib/analytics";

// GET /api/guides/[id]/analytics - Get analytics for a guide
export async function GET(
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

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "30");

    const analytics = await getGuideAnalytics(id, days);

    return NextResponse.json({ analytics });
  } catch (error) {
    console.error("Analytics error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
