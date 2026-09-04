import { NextResponse } from "next/server";
import { adminCookieName, studentCookieName } from "../../../../src/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  };

  response.cookies.set(studentCookieName(), "", cookieOptions);
  response.cookies.set(adminCookieName(), "", cookieOptions);
  return response;
}
