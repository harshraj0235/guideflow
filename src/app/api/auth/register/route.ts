import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { signToken, createTokenCookie } from "@/lib/auth";
import { randomBytes } from "crypto";
import { hash } from "bcryptjs";
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { password, name } = body;
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        if (!email || typeof password !== "string" || (name !== undefined && typeof name !== "string")) {
            return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
        }
        if (password.length < 8 || Buffer.byteLength(password) > 72) {
            return NextResponse.json({ error: "Password must be at least 8 characters and at most 72 bytes" }, { status: 400 });
        }
        // Check if user exists
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
        }
        // Create user
        const passwordHash = await hash(password, 12);
        const { user, workspace } = await prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    email,
                    name: name || email.split("@")[0],
                    passwordHash,
                },
            });
            // Create default workspace
            const slug = `${email.split("@")[0]}-workspace`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
            const workspace = await tx.workspace.create({
                data: {
                    name: `${user.name}'s Workspace`,
                    slug: `${slug}-${randomBytes(5).toString("hex")}`,
                    members: {
                        create: {
                            userId: user.id,
                            role: "owner",
                        },
                    },
                },
            });
            return { user, workspace };
        });
        // Create JWT token
        const token = await signToken({ userId: user.id, email: user.email });
        const response = NextResponse.json({
            user: { id: user.id, email: user.email, name: user.name },
            workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
        });
        response.cookies.set(createTokenCookie(token));
        return response;
    }
    catch (error) {
        console.error("Registration error:", error);
        return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
    }
}
