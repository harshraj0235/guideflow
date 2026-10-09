import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { prepareStep, validateSteps } from "@/lib/guide-steps";
// GET /api/guides - List user's guides
export async function GET() {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        // Get user's workspaces
        const memberships = await prisma.membership.findMany({
            where: { userId: user.userId },
            select: { workspaceId: true },
        });
        const workspaceIds = memberships.map((m) => m.workspaceId);
        const guides = await prisma.guide.findMany({
            where: { workspaceId: { in: workspaceIds } },
            include: {
                steps: {
                    orderBy: { index: "asc" },
                    select: {
                        id: true,
                        index: true,
                        instruction: true,
                        actionType: true,
                        screenshotUrl: true,
                    },
                },
                author: {
                    select: { id: true, name: true, email: true },
                },
                shareLinks: {
                    where: { isRevoked: false },
                    select: { id: true, token: true, accessMode: true },
                },
                _count: { select: { steps: true } },
            },
            orderBy: { updatedAt: "desc" },
        });
        return NextResponse.json({ guides });
    }
    catch (error) {
        console.error("List guides error:", error);
        return NextResponse.json({ error: "Failed to fetch guides" }, { status: 500 });
    }
}
// POST /api/guides - Create a new guide (from extension upload)
export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const body = await request.json();
        const { title, description, steps, workspaceId } = body;
        if ((steps !== undefined && !validateSteps(steps)) || (title !== undefined && typeof title !== "string") || (description !== undefined && typeof description !== "string"))
            return NextResponse.json({ error: "Invalid guide or steps" }, { status: 400 });
        // Verify workspace access
        let targetWorkspaceId = workspaceId;
        if (!targetWorkspaceId) {
            const membership = await prisma.membership.findFirst({
                where: { userId: user.userId },
                select: { workspaceId: true },
            });
            targetWorkspaceId = membership?.workspaceId;
        }
        if (!targetWorkspaceId) {
            return NextResponse.json({ error: "No workspace found" }, { status: 400 });
        }
        // Verify membership
        const membership = await prisma.membership.findUnique({
            where: {
                userId_workspaceId: {
                    userId: user.userId,
                    workspaceId: targetWorkspaceId,
                },
            },
        });
        if (!membership) {
            return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
        }
        // Create guide with steps
        const guide = await prisma.guide.create({
            data: {
                title: title || "Untitled Guide",
                description: description || "",
                authorId: user.userId,
                workspaceId: targetWorkspaceId,
                steps: {
                    create: await Promise.all((steps || []).map((step: import("@/lib/guide-steps").StepInput, index: number) => prepareStep(step, index))),
                },
            },
            include: {
                steps: { orderBy: { index: "asc" } },
            },
        });
        return NextResponse.json({ guide }, { status: 201 });
    }
    catch (error) {
        console.error("Create guide error:", error);
        return NextResponse.json({ error: "Failed to create guide" }, { status: 500 });
    }
}
