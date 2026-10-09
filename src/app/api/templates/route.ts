import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// GET /api/templates - List available templates
export async function GET() {
  try {
    const templates = await prisma.guideTemplate.findMany({
      where: { isPublic: true },
      orderBy: { usageCount: "desc" },
    });

    return NextResponse.json({ templates });
  } catch (error) {
    console.error("List templates error:", error);
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
  }
}

// POST /api/templates - Create a template (seed or from guide)
export async function POST(request: NextRequest) {
  try {
    if (!await getCurrentUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    if (typeof body.name !== "string" || !body.name.trim()) return NextResponse.json({ error: "Template name is required" }, { status: 400 });
    const template = await prisma.guideTemplate.create({
      data: {
        name: body.name,
        description: body.description || "",
        category: body.category || "general",
        icon: body.icon || "📋",
        data: JSON.stringify(body.steps || []),
        isPublic: body.isPublic !== false,
      },
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error("Create template error:", error);
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }
}
