$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$envPath = Join-Path $projectRoot ".env.local"

Write-Host ""
Write-Host "Chologi v2 local env setup"
Write-Host "This saves settings to: $envPath"
Write-Host ""

$supabaseUrl = Read-Host "1 SUPABASE_DATABASE_URL paste full postgresql URL"
if ([string]::IsNullOrWhiteSpace($supabaseUrl) -or -not $supabaseUrl.Trim().StartsWith("postgresql://")) {
  throw "SUPABASE_DATABASE_URL must start with postgresql://"
}

$dictKey = Read-Host "2 KOREAN_DICT_API_KEY paste Korean dictionary API key"
if ([string]::IsNullOrWhiteSpace($dictKey) -or $dictKey.Trim().StartsWith("postgresql://")) {
  throw "KOREAN_DICT_API_KEY is not a database URL. Paste the dictionary API key here."
}

$licenseSecret = Read-Host "3 HANJA_LICENSE_SECRET paste old app license secret"
if ([string]::IsNullOrWhiteSpace($licenseSecret)) {
  throw "HANJA_LICENSE_SECRET is required."
}

$adminPassword = Read-Host "4 ADMIN_PASSWORD choose master admin password"
if ([string]::IsNullOrWhiteSpace($adminPassword)) {
  throw "ADMIN_PASSWORD is required."
}

$adminSecret = Read-Host "5 ADMIN_SESSION_SECRET press Enter to auto-generate"
if ([string]::IsNullOrWhiteSpace($adminSecret)) {
  $adminSecret = [Convert]::ToBase64String([Guid]::NewGuid().ToByteArray()).TrimEnd("=")
}

$studentSecret = Read-Host "6 STUDENT_SESSION_SECRET press Enter to auto-generate"
if ([string]::IsNullOrWhiteSpace($studentSecret)) {
  $studentSecret = [Convert]::ToBase64String([Guid]::NewGuid().ToByteArray()).TrimEnd("=")
}

@"
SUPABASE_DATABASE_URL="$($supabaseUrl.Trim())"
KOREAN_DICT_API_KEY="$($dictKey.Trim())"
HANJA_LICENSE_SECRET="$($licenseSecret.Trim())"
ADMIN_PASSWORD="$($adminPassword.Trim())"
ADMIN_SESSION_SECRET="$($adminSecret.Trim())"
STUDENT_SESSION_SECRET="$($studentSecret.Trim())"
"@ | Set-Content -LiteralPath $envPath -Encoding UTF8

Write-Host ""
Write-Host "Saved .env.local"
Write-Host "Run:"
Write-Host "npm.cmd run dev"
