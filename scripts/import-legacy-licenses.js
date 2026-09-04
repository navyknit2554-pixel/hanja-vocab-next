const postgres = require("postgres");

const sourceUrl = process.env.SOURCE_DATABASE_URL || process.env.OLD_DATABASE_URL || process.env.NEON_DATABASE_URL;
const targetUrl = process.env.TARGET_DATABASE_URL || process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
const write = process.argv.includes("--write");

if (!sourceUrl || !targetUrl) {
  console.error("기존 앱 DB 주소와 새 v2 DB 주소가 모두 필요합니다.");
  console.error("$env:SOURCE_DATABASE_URL=\"기존 앱 app_state가 있는 DB 연결 문자열\"");
  console.error("$env:SUPABASE_DATABASE_URL=\"새 v2 Supabase 연결 문자열\"");
  console.error("npm.cmd run import:legacy-licenses");
  process.exit(1);
}

const source = postgres(sourceUrl, {
  max: 1,
  prepare: false,
  ssl: "require",
  idle_timeout: 20,
  connect_timeout: 20
});

const target = postgres(targetUrl, {
  max: 1,
  prepare: false,
  ssl: "require",
  idle_timeout: 20,
  connect_timeout: 20
});

main()
  .catch((error) => {
    console.error("\n기존 라이선스 가져오기에 실패했습니다.");
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await source.end({ timeout: 5 }).catch(() => {});
    await target.end({ timeout: 5 }).catch(() => {});
  });

async function main() {
  await assertSourceHasAppState();
  await ensureTargetSchema();

  const rows = await source`select data from app_state where key = 'main' limit 1`;
  if (!rows.length) throw new Error("기존 앱 main app_state를 찾지 못했습니다.");
  const data = normalizeJsonData(rows[0].data);
  const records = Array.isArray(data?.licenseRecords) ? data.licenseRecords : [];
  const revocations = Array.isArray(data?.licenseRevocations) ? data.licenseRevocations : [];
  const plans = records.map((record) => buildPlan(record, revocations)).filter(Boolean);

  console.log(`기존 라이선스 기록 ${records.length}개 중 ${plans.length}개를 찾았습니다.`);
  console.table(plans.map((item) => ({
    teacherCode: item.teacherCode,
    status: item.status,
    expiresAt: item.expiresAt ? item.expiresAt.slice(0, 10) : "",
    owner: item.owner,
    hash: item.licenseHash.slice(0, 12)
  })));

  if (!write) {
    console.log("\n아직 DB에 반영하지 않았습니다. 실제 반영하려면:");
    console.log("npm.cmd run import:legacy-licenses -- --write");
    return;
  }

  let saved = 0;
  for (const plan of plans) {
    await upsertTeacherLicense(plan);
    saved += 1;
  }
  console.log(`\n완료: 라이선스 ${saved}개를 v2 teachers 테이블에 반영했습니다.`);

  const summary = await target`
    select code, license_status, license_expires_at, license_owner
    from teachers
    where code <> 'master'
    order by code
  `;
  console.table(summary.map((item) => ({
    teacherCode: item.code,
    status: item.license_status,
    expiresAt: item.license_expires_at,
    owner: item.license_owner
  })));
}

function buildPlan(record, revocations) {
  const licenseHash = clean(record?.licenseHash);
  const teacherCode = clean(record?.teacherCode) || (licenseHash ? `t_${licenseHash.slice(0, 10)}` : "");
  if (!licenseHash || !teacherCode) return null;
  const revocation = revocations.find((item) => clean(item?.licenseHash) === licenseHash && clean(item?.status) !== "restored");
  const expiresAt = validDateOrNull(record?.expiresAt || record?.originalExpiresAt);
  const activeByDate = expiresAt ? new Date(expiresAt).getTime() >= Date.now() : true;
  return {
    teacherCode,
    licenseHash,
    expiresAt,
    originalExpiresAt: validDateOrNull(record?.originalExpiresAt) || expiresAt,
    owner: clean(record?.owner),
    note: clean(record?.note || record?.reason),
    status: revocation ? "revoked" : activeByDate ? "active" : "expired",
    revokedAt: validDateOrNull(revocation?.revokedAt),
    restoredAt: validDateOrNull(revocation?.restoredAt)
  };
}

async function upsertTeacherLicense(plan) {
  await target`
    insert into teachers (
      name,
      code,
      license_hash,
      license_status,
      license_expires_at,
      license_original_expires_at,
      license_owner,
      license_note,
      license_revoked_at,
      license_restored_at
    )
    values (
      ${plan.owner || plan.teacherCode},
      ${plan.teacherCode},
      ${plan.licenseHash},
      ${plan.status},
      ${plan.expiresAt},
      ${plan.originalExpiresAt},
      ${plan.owner},
      ${plan.note},
      ${plan.revokedAt},
      ${plan.restoredAt}
    )
    on conflict (code)
    do update set
      license_hash = excluded.license_hash,
      license_status = excluded.license_status,
      license_expires_at = excluded.license_expires_at,
      license_original_expires_at = excluded.license_original_expires_at,
      license_owner = excluded.license_owner,
      license_note = excluded.license_note,
      license_revoked_at = excluded.license_revoked_at,
      license_restored_at = excluded.license_restored_at
  `;
}

async function assertSourceHasAppState() {
  const rows = await source`select to_regclass('public.app_state') as table_name`;
  if (!rows[0]?.table_name) {
    throw new Error("SOURCE_DATABASE_URL DB에 app_state 테이블이 없습니다. 기존 앱 DB 연결 문자열을 넣어 주세요.");
  }
}

async function ensureTargetSchema() {
  await target`create extension if not exists pgcrypto`;
  await target`
    create table if not exists teachers (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      code text not null unique,
      license_key text unique,
      license_hash text unique,
      license_status text not null default 'active',
      license_expires_at timestamptz,
      license_original_expires_at timestamptz,
      license_owner text not null default '',
      license_note text not null default '',
      license_revoked_at timestamptz,
      license_restored_at timestamptz,
      created_at timestamptz not null default now(),
      last_login_at timestamptz
    )
  `;
  await target`alter table teachers add column if not exists license_hash text unique`;
  await target`alter table teachers add column if not exists license_status text not null default 'active'`;
  await target`alter table teachers add column if not exists license_original_expires_at timestamptz`;
  await target`alter table teachers add column if not exists license_owner text not null default ''`;
  await target`alter table teachers add column if not exists license_note text not null default ''`;
  await target`alter table teachers add column if not exists license_revoked_at timestamptz`;
  await target`alter table teachers add column if not exists license_restored_at timestamptz`;
}

function normalizeJsonData(data) {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function validDateOrNull(value) {
  const text = clean(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function clean(value) {
  return String(value || "").trim();
}
