import { NextResponse } from "next/server";
import { adminConfigError, adminCookieName, adminSessionValue, isValidAdminPassword } from "../../../../src/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const configError = adminConfigError();
  if (configError) return NextResponse.json({ ok: false, message: configError }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  if (!isValidAdminPassword(body.password)) {
    return NextResponse.json({ ok: false, message: "관리자 비밀번호를 확인해 주세요." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminCookieName, adminSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12
  });
  return response;
}
