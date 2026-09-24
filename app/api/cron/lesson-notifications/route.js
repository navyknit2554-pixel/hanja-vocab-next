import { NextResponse } from "next/server";
import { sql } from "../../../../src/lib/db";
import { sendWebPushNotification } from "../../../../src/lib/web-push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  return sendLessonNotifications(request);
}

export async function POST(request) {
  return sendLessonNotifications(request);
}

async function sendLessonNotifications(request) {
  const secret = process.env.CRON_SECRET || "";
  if (secret) {
    const auth = request.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 401 });
    }
  }

  const db = await sql();
  const rows = await db`
    select
      ps.id,
      ps.subscription,
      s.current_day
    from student_push_subscriptions ps
    join students s on s.id = ps.student_id
    join curriculum_days c on c.level = s.level and c.day = s.current_day
    left join student_progress p on p.student_id = s.id and p.curriculum_day_id = c.id
    where ps.enabled = true
      and s.current_day > ps.last_notified_day
      and coalesce(p.unlocked_at, now()) <= now()
    order by ps.last_seen_at desc
    limit 200
  `;

  let sent = 0;
  let disabled = 0;
  const failed = [];

  for (const row of rows) {
    try {
      const result = await sendWebPushNotification(row.subscription);
      if (result.ok) {
        sent += 1;
        await db`
          update student_push_subscriptions
          set last_notified_day = ${Number(row.current_day)},
              last_notified_at = now(),
              updated_at = now()
          where id = ${row.id}
        `;
        continue;
      }
      if (result.expired) {
        disabled += 1;
        await db`
          update student_push_subscriptions
          set enabled = false,
              updated_at = now()
          where id = ${row.id}
        `;
        continue;
      }
      failed.push({ id: row.id, status: result.status });
    } catch (error) {
      failed.push({ id: row.id, message: error?.message || "발송 실패" });
    }
  }

  return NextResponse.json({
    ok: true,
    checked: rows.length,
    sent,
    disabled,
    failed: failed.slice(0, 20)
  });
}
