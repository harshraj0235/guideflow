import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { prepareStep, validateSteps } from "@/lib/guide-steps";
// GET /api/guides/[id] - Get a specific guide
export async function GET(_request: NextRequest, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    try {
        const { id } = await params;
        const user = await getCurrentUser();
        const guide = await prisma.guide.findUnique({
            where: { id },
            include: {
                steps: { orderBy: { index: "asc" } },
                author: { select: { id: true, name: true, email: true } },
                shareLinks: {
                    where: { isRevoked: false },
                    select: { id: true, token: true, accessMode: true, expiresAt: true },
                },
                workspace: { select: { id: true, name: true } },
            },
        });
        if (!guide) {
            return NextResponse.json({ error: "Guide not found" }, { status: 404 });
        }
        // Check access: owner/member or has share link
        if (user) {
            const membership = await prisma.membership.findUnique({
                where: {
                    userId_workspaceId: {
                        userId: user.userId,
                        workspaceId: guide.workspaceId,
                    },
                },
            });
            if (membership) {
                return NextResponse.json({ guide, canEdit: true });
            }
        }
        // Guide IDs are not share credentials. Public readers use a validated share token.
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    catch (error) {
        console.error("Get guide error:", error);
        return NextResponse.json({ error: "Failed to fetch guide" }, { status: 500 });
    }
}
// PATCH /api/guides/[id] - Update a guide
export async function PATCH(request: NextRequest, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    try {
        const { id } = await params;
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const guide = await prisma.guide.findUnique({
            where: { id },
            include: { steps: true },
        });
        if (!guide) {
            return NextResponse.json({ error: "Guide not found" }, { status: 404 });
        }
        // Verify membership
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
        if ((body.steps !== undefined && !validateSteps(body.steps)) || (body.title !== undefined && typeof body.title !== "string") || (body.description !== undefined && typeof body.description !== "string") || (body.status !== undefined && !["draft", "published", "archived"].includes(body.status)))
            return NextResponse.json({ error: "Invalid guide or steps" }, { status: 400 });
        // Optimistic concurrency check
        if (body.expectedVersion && body.expectedVersion !== guide.version) {
            return NextResponse.json({ error: "Guide was modified by another session. Please refresh." }, { status: 409 });
        }
        const preparedSteps = body.steps === undefined ? undefined : await Promise.all(body.steps.map((step: import("@/lib/guide-steps").StepInput, index: number) => prepareStep(step, index, guide.steps.find(previous => previous.id === step.id))));
        // Guard the version and replace steps in one transaction: no partial saves.
        const updatedGuide = await prisma.$transaction(async (tx) => {
            const result = await tx.guide.updateMany({
                where: { id, version: guide.version },
                data: { title: body.title, description: body.description, status: body.status, version: { increment: 1 }, publishedAt: body.status === "published" ? new Date() : undefined },
            });
            if (result.count !== 1)
                throw new Error("VERSION_CONFLICT");
            if (preparedSteps) {
                await tx.step.deleteMany({ where: { guideId: id } });
                for (const step of preparedSteps)
                    await tx.step.create({ data: { ...step, guideId: id } });
            }
            return tx.guide.findUniqueOrThrow({ where: { id }, include: { steps: { orderBy: { index: "asc" } } } });
        });
        return NextResponse.json({ guide: updatedGuide });
    }
    catch (error) {
        if (error instanceof Error && error.message === "VERSION_CONFLICT")
            return NextResponse.json({ error: "Guide changed in another session. Reload before saving." }, { status: 409 });
        console.error("Update guide error:", error);
        return NextResponse.json({ error: "Failed to update guide" }, { status: 500 });
    }
}
// DELETE /api/guides/[id] - Delete a guide
export async function DELETE(_request: NextRequest, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    try {
        const { id } = await params;
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const guide = await prisma.guide.findUnique({
            where: { id },
            select: { workspaceId: true, authorId: true },
        });
        if (!guide) {
            return NextResponse.json({ error: "Guide not found" }, { status: 404 });
        }
        // Only owner/admin or author can delete
        const membership = await prisma.membership.findUnique({
            where: {
                userId_workspaceId: {
                    userId: user.userId,
                    workspaceId: guide.workspaceId,
                },
            },
        });
        if (!membership || (membership.role === "member" && guide.authorId !== user.userId)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }
        await prisma.guide.delete({ where: { id } });
        return NextResponse.json({ success: true });
    }
    catch (error) {
        console.error("Delete guide error:", error);
        return NextResponse.json({ error: "Failed to delete guide" }, { status: 500 });
    }
}
