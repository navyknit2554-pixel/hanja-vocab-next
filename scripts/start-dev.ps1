$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location -LiteralPath $projectRoot

if (-not (Test-Path -LiteralPath ".env.local")) {
  Write-Host ".env.local이 없습니다. 먼저 실행하세요:"
  Write-Host "powershell -ExecutionPolicy Bypass -File scripts\setup-local-env.ps1"
  exit 1
}

Write-Host ""
Write-Host "Chologi v2 dev server"
Write-Host "Project: $projectRoot"
Write-Host ""

$connections = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
foreach ($connection in $connections) {
  $pidToStop = [int]$connection.OwningProcess
  if ($pidToStop -le 0 -or $pidToStop -eq $PID) {
    continue
  }

  $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $pidToStop" -ErrorAction SilentlyContinue
  Write-Host "Port 3000 is already in use by PID $pidToStop."
  if ($processInfo.CommandLine) {
    Write-Host $processInfo.CommandLine
  }
  Write-Host "Stopping the old local server..."

  try {
    Stop-Process -Id $pidToStop -Force -ErrorAction Stop
  } catch {
    & taskkill.exe /PID $pidToStop /F | Out-Host
  }
}

if (Test-Path -LiteralPath ".next\dev\lock") {
  Remove-Item -LiteralPath ".next\dev\lock" -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Starting at http://localhost:3000"
Write-Host ""
npm.cmd run dev
