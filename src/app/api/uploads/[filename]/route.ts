import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

// GET /api/uploads/[filename] - Serve uploaded screenshots
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;

    // Sanitize filename — prevent path traversal
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "");
    if (safeName !== filename || filename.includes("..")) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    const uploadDir = join(/* turbopackIgnore: true */
      process.cwd(),
      process.env.UPLOAD_DIR || "./uploads"
    );
    const filePath = join(/* turbopackIgnore: true */ uploadDir, safeName);

    if (!existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const buffer = await readFile(filePath);

    // Determine content type
    const ext = safeName.split(".").pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      gif: "image/gif",
    };

    const contentType = contentTypes[ext || ""] || "application/octet-stream";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("File serve error:", error);
    return NextResponse.json(
      { error: "Failed to serve file" },
      { status: 500 }
    );
  }
}
