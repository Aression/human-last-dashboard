<#
.SYNOPSIS
  Starts the evidence automation daemon in the background and confirms it is alive.

.DESCRIPTION
  Refuses to start a second daemon when the recorded process is still running.
  Success is reported only after the state file shows a heartbeat newer than the
  moment this script started — a crashed-on-boot process must not look started.

  The process is created through Win32_Process.Create rather than Start-Process so
  it inherits none of this shell's stdio handles. With Start-Process, the daemon
  kept the parent's output pipe open for its whole lifetime, so any caller that
  captures the script's output (a CI step, an agent harness, `pwsh -Command`)
  blocked until the daemon exited. The daemon writes its own log and state files,
  so it needs no redirection.

.EXAMPLE
  pwsh -File scripts\evidence-daemon-start.ps1

.EXAMPLE
  pwsh -File scripts\evidence-daemon-start.ps1 -Foreground
#>
[CmdletBinding()]
param(
  # Run the scheduler in this shell instead of detaching it.
  [switch] $Foreground
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$stateDir = Join-Path $repo ".evidence-mcp\state"
$stateFile = Join-Path $stateDir "daemon.json"
$logDir = Join-Path $repo ".evidence-mcp\logs"
New-Item -ItemType Directory -Force -Path $stateDir, $logDir | Out-Null

if (Test-Path $stateFile) {
  $state = Get-Content $stateFile -Raw | ConvertFrom-Json
  $existing = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
  if ($existing -and $state.running -ne $false) {
    Write-Host "daemon already running (pid $($state.pid)); nothing to do"
    exit 0
  }
}

$node = (Get-Command node -ErrorAction Stop).Source

if ($Foreground) {
  & $node --import tsx tools/evidence-mcp/src/daemon.ts
  exit $LASTEXITCODE
}

$startedAt = Get-Date
$commandLine = "`"$node`" --import tsx tools/evidence-mcp/src/daemon.ts"
$created = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
  CommandLine      = $commandLine
  CurrentDirectory = $repo
}
if ($created.ReturnValue -ne 0) {
  throw "could not create the daemon process (Win32_Process.Create returned $($created.ReturnValue))"
}
$pid_ = [int]$created.ProcessId

$deadline = (Get-Date).AddSeconds(30)
$confirmed = $false
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 500
  if (-not (Get-Process -Id $pid_ -ErrorAction SilentlyContinue)) { break }
  if (Test-Path $stateFile) {
    try {
      $state = Get-Content $stateFile -Raw | ConvertFrom-Json
      # heartbeat_at is UTC ISO; compare in UTC so a non-UTC clock cannot fake success.
      if ($state.running -eq $true -and [int]$state.pid -eq $pid_ -and
        ([datetime]$state.heartbeat_at).ToUniversalTime() -gt $startedAt.ToUniversalTime()) {
        $confirmed = $true
        break
      }
    } catch {
      # state file written mid-read: retry
    }
  }
}

if (-not $confirmed) {
  Stop-Process -Id $pid_ -Force -ErrorAction SilentlyContinue
  throw "daemon did not start; see $(Join-Path $logDir "daemon-$(Get-Date -Format 'yyyy-MM-dd').log")"
}

Write-Host "daemon running (pid $pid_); state: $stateFile"
Write-Host ("scheduled: " + (($state.tasks | ForEach-Object { "$($_.task)@$($_.cron) -> $($_.next_run_at)" }) -join "; "))
