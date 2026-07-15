import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { adminConfigError, adminCookieName, isValidAdminSession } from "../../../../src/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  const configError = adminConfigError();
  if (configError) return NextResponse.json({ authenticated: false, configError });

  const cookieStore = await cookies();
  return NextResponse.json({ authenticated: isValidAdminSession(cookieStore.get(adminCookieName)?.value) });
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.delete(adminCookieName);
  return response;
}
