param(
  [string]$ServiceName = "postgresql-x64-9.4",
  [string]$DataDir = "C:\Program Files\PostgreSQL\9.4\data"
)

$ErrorActionPreference = 'Stop'

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  throw "Run this script in an elevated PowerShell (Run as Administrator)."
}

$pgHba = Join-Path $DataDir 'pg_hba.conf'
$backup = Join-Path $DataDir 'pg_hba.conf.bak.copilot'

if (-not (Test-Path $backup)) {
  throw "Backup not found at $backup"
}

Write-Host "Restoring pg_hba.conf from backup"
Copy-Item $backup $pgHba -Force

Write-Host "Restarting service $ServiceName"
Restart-Service $ServiceName

Write-Host "Done. Localhost auth is back to md5."
