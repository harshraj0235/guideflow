import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === "production") throw new Error("JWT_SECRET must be configured in production");
  return new TextEncoder().encode(secret || "guideflow-dev-secret");
}

const TOKEN_NAME = "guideflow_token";
const TOKEN_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface TokenPayload {
  userId: string;
  email: string;
}

export async function signToken(payload: TokenPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_MAX_AGE}s`)
    .sign(jwtSecret());
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret());
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

export async function getTokenFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(TOKEN_NAME)?.value || null;
}

export async function getCurrentUser(): Promise<TokenPayload | null> {
  const token = await getTokenFromCookies();
  if (!token) return null;
  return verifyToken(token);
}

export function createTokenCookie(token: string) {
  return {
    name: TOKEN_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: TOKEN_MAX_AGE,
    path: "/",
  };
}

export function deleteTokenCookie() {
  return {
    name: TOKEN_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 0,
    path: "/",
  };
}
