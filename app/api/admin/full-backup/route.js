import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { adminCookieName, readAdminSession } from "../../../../src/lib/adminAuth";
import { getAllStateRows, storageMode } from "../../../../src/lib/serverStore";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const cookieStore = await cookies();
  const session = readAdminSession(cookieStore.get(adminCookieName)?.value);
  if (!session.authenticated) {
    return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }
  if (session.role !== "master") {
    return NextResponse.json({ ok: false, message: "전체 DB 백업은 소유자 관리자만 실행할 수 있습니다." }, { status: 403 });
  }

  const rows = await getAllStateRows();
  const format = new URL(request.url).searchParams.get("format");
  const date = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    const payload = {
      exportedAt: new Date().toISOString(),
      storage: storageMode(),
      table: "app_state",
      rows
    };
    return fileResponse(
      JSON.stringify(payload, null, 2),
      `hanja-app-state-full-backup-${date}.json`,
      "application/json; charset=utf-8"
    );
  }

  return fileResponse(
    buildRestoreSql(rows),
    `hanja-app-state-restore-${date}.sql`,
    "application/sql; charset=utf-8"
  );
}

function buildRestoreSql(rows) {
  const lines = [
    "begin;",
    "",
    "create table if not exists app_state (",
    "  key text primary key,",
    "  data jsonb not null,",
    "  updated_at timestamptz not null default now()",
    ");",
    ""
  ];

  rows.forEach((row) => {
    lines.push(
      "insert into app_state (key, data, updated_at) values " +
      `(${sqlLiteral(row.key)}, ${sqlLiteral(JSON.stringify(row.data))}::jsonb, ${sqlLiteral(new Date(row.updated_at).toISOString())}::timestamptz) ` +
      "on conflict (key) do update set data = excluded.data, updated_at = excluded.updated_at;"
    );
  });

  lines.push("", "commit;", "");
  return lines.join("\n");
}

function sqlLiteral(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function fileResponse(content, filename, contentType) {
  return new Response(content, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
}
