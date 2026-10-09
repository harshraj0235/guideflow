import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/analytics/pixel - Tracking pixel for embed views
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const guideToken = searchParams.get("guide") || "";
    const event = searchParams.get("event") || "guide_embed_view";
    const referrer = searchParams.get("r") || "";

    if (guideToken) {
      const shareLink = await prisma.shareLink.findUnique({
        where: { token: guideToken },
        select: { guideId: true },
      });

      if (shareLink) {
        const visitorId = `v_${hashString(request.headers.get("user-agent") || "" + request.headers.get("x-forwarded-for") || "")}`;

        await prisma.analyticsEvent.create({
          data: {
            guideId: shareLink.guideId,
            event,
            visitorId,
            sessionId: `embed_${Date.now()}`,
            referrer,
            userAgent: request.headers.get("user-agent") || "",
          },
        });
      }
    }

    // Return 1x1 transparent GIF
    const pixel = Buffer.from(
      "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      "base64"
    );

    return new NextResponse(pixel, {
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    // Silently fail — analytics should never break the page
    const pixel = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
    return new NextResponse(pixel, {
      headers: { "Content-Type": "image/gif" },
    });
  }
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}
