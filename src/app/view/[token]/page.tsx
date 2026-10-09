import { Suspense } from "react";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { GuideReader } from "@/components/guide-reader";
async function SharedGuideContent({ params }: {
    params: Promise<{
        token: string;
    }>;
}) {
    const { token } = await params;
    const link = await prisma.shareLink.findUnique({ where: { token }, include: { guide: { include: { steps: { orderBy: { index: "asc" } }, author: { select: { name: true } } } } } });
    if (!link || link.isRevoked || (link.expiresAt && link.expiresAt <= new Date()) || link.password)
        notFound();
    if (link.accessMode === "private") {
        const user = await getCurrentUser();
        if (!user || !await prisma.membership.findUnique({ where: { userId_workspaceId: { userId: user.userId, workspaceId: link.guide.workspaceId } } }))
            notFound();
    }
    const { guide } = link;
    return <GuideReader guide={{ id: guide.id, version: guide.version, title: guide.title, description: guide.description, authorName: guide.author.name || "Your team", steps: guide.steps.map(({ id, instruction, notes, screenshotUrl }) => ({ id, instruction, notes, screenshotUrl })) }}/>;
}
export default function SharedGuidePage(props: {
    params: Promise<{
        token: string;
    }>;
}) { return <Suspense fallback={<div className="gf-site gf-empty" role="status">Loading your guide…</div>}><SharedGuideContent {...props}/></Suspense>; }
