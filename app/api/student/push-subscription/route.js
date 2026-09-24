import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { readStudentSession, studentCookieName } from "../../../../src/lib/auth";
import { sql } from "../../../../src/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const session = readStudentSession(cookieStore.get(studentCookieName())?.value);
    if (!session?.studentId) return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const subscription = normalizeSubscription(body.subscription);
    if (!subscription) {
      return NextResponse.json({ ok: false, message: "알림 구독 정보를 확인하지 못했습니다." }, { status: 400 });
    }

    const headerStore = await headers();
    const userAgent = String(headerStore.get("user-agent") || "").slice(0, 500);
    const db = await sql();
    await db`
      insert into student_push_subscriptions (
        student_id,
        endpoint,
        subscription,
        user_agent,
        enabled,
        last_notified_day,
        last_seen_at,
        updated_at
      )
      values (
        ${session.studentId},
        ${subscription.endpoint},
        ${JSON.stringify(subscription)}::jsonb,
        ${userAgent},
        true,
        coalesce((select current_day from students where id = ${session.studentId}), 0),
        now(),
        now()
      )
      on conflict (endpoint)
      do update set
        student_id = excluded.student_id,
        subscription = excluded.subscription,
        user_agent = excluded.user_agent,
        enabled = true,
        last_notified_day = greatest(student_push_subscriptions.last_notified_day, excluded.last_notified_day),
        last_seen_at = now(),
        updated_at = now()
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("student push subscription failed", error);
    return NextResponse.json(
      { ok: false, message: error?.message || "학습 알림 설정에 실패했습니다." },
      { status: 500 }
    );
  }
}

function normalizeSubscription(subscription) {
  if (!subscription || typeof subscription !== "object") return null;
  const endpoint = String(subscription.endpoint || "").trim();
  const keys = subscription.keys || {};
  const p256dh = String(keys.p256dh || "").trim();
  const auth = String(keys.auth || "").trim();
  if (!endpoint || !p256dh || !auth) return null;
  return {
    endpoint,
    expirationTime: subscription.expirationTime || null,
    keys: { p256dh, auth }
  };
}
