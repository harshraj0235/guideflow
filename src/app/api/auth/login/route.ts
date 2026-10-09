import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { signToken, createTokenCookie } from "@/lib/auth";
import { createHash, timingSafeEqual } from "crypto";
import { compare, hash } from "bcryptjs";
async function verifyPassword(password: string, stored: string): Promise<boolean> {
    if (stored.startsWith("$2"))
        return compare(password, stored);
    const [salt, hash] = stored.split(":");
    const testHash = createHash("sha256")
        .update(password + salt)
        .digest("hex");
    return typeof hash === "string" && hash.length === testHash.length && timingSafeEqual(Buffer.from(hash), Buffer.from(testHash));
}
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { password } = body;
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        if (!email || typeof password !== "string") {
            return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
        }
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !await verifyPassword(password, user.passwordHash)) {
            return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
        }
        if (!user.passwordHash.startsWith("$2") && Buffer.byteLength(password) <= 72)
            await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hash(password, 12) } });
        const token = await signToken({ userId: user.id, email: user.email });
        // Get user's workspaces
        const memberships = await prisma.membership.findMany({
            where: { userId: user.id },
            include: { workspace: true },
        });
        const response = NextResponse.json({
            user: { id: user.id, email: user.email, name: user.name },
            workspaces: memberships.map((m) => ({
                id: m.workspace.id,
                name: m.workspace.name,
                slug: m.workspace.slug,
                role: m.role,
            })),
        });
        response.cookies.set(createTokenCookie(token));
        return response;
    }
    catch (error) {
        console.error("Login error:", error);
        return NextResponse.json({ error: "Login failed. Please try again." }, { status: 500 });
    }
}
