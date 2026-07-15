import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { adminConfigError, adminCookieName, readAdminSession } from "../../../../src/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  const configError = adminConfigError();
  if (configError) return NextResponse.json({ authenticated: false, configError });

  const cookieStore = await cookies();
  const session = readAdminSession(cookieStore.get(adminCookieName)?.value);
  return NextResponse.json(session.authenticated ? session : { authenticated: false });
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.delete(adminCookieName);
  return response;
}
