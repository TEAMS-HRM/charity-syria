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

if (-not (Test-Path $pgHba)) {
    throw "pg_hba.conf not found at $pgHba"
}

Write-Host "Backing up pg_hba.conf to $backup"
Copy-Item $pgHba $backup -Force

Write-Host "Temporarily switching localhost auth to trust"
(Get-Content $pgHba) |
ForEach-Object {
    $_ -replace '^(\s*host\s+all\s+all\s+127\.0\.0\.1/32\s+)md5(\s*)$', '$1trust$2' `
        -replace '^(\s*host\s+all\s+all\s+::1/128\s+)md5(\s*)$', '$1trust$2'
} |
Set-Content $pgHba

Write-Host "Restarting service $ServiceName"
Restart-Service $ServiceName

Write-Host ""
Write-Host "Now run in another terminal:"
Write-Host "  & 'C:\Program Files\PostgreSQL\9.4\bin\psql.exe' -U postgres -h 127.0.0.1 -d postgres"
Write-Host "Inside psql run:"
Write-Host "  \password postgres"
Write-Host "  \q"
Write-Host ""
Write-Host "After setting the password, run:"
Write-Host "  powershell -ExecutionPolicy Bypass -File .\scripts\restore-local-postgres-auth.ps1"
