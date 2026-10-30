<#
.SYNOPSIS
  Prints daemon state, process liveness, and the next scheduled runs.

.DESCRIPTION
  Reads <repo>\.evidence-mcp\state\daemon.json and cross-checks the recorded pid, so
  a stale state file left by a killed daemon cannot be reported as running.
#>
[CmdletBinding()]
param([switch]$Json)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$stateFile = Join-Path $repo ".evidence-mcp\state\daemon.json"

if (-not (Test-Path $stateFile)) {
  if ($Json) { "{}" } else { "daemon has never been started (no state file)" }
  exit 1
}

$state = Get-Content $stateFile -Raw | ConvertFrom-Json
$process = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
$alive = [bool]$process
$state | Add-Member -NotePropertyName process_alive -NotePropertyValue $alive -Force

if ($Json) {
  $state | ConvertTo-Json -Depth 6
  exit 0
}

function Format-Stamp($value) {
  if (-not $value) { return "-" }
  # The state file stores UTC ISO stamps; show local time and say so.
  $utc = ([datetime]$value).ToUniversalTime()
  return "{0} local ({1:HH:mm}Z)" -f $utc.ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss"), $utc
}

Write-Host ("process: {0} (pid {1})" -f ($(if ($alive) { "running" } else { "NOT running" })), $state.pid)
Write-Host ("heartbeat: {0}" -f (Format-Stamp $state.heartbeat_at))
Write-Host ("store: {0}" -f $state.store)
foreach ($task in $state.tasks) {
  Write-Host ("task {0,-10} cron '{1}' next {2} last {3} ({4})" -f $task.task, $task.cron, (Format-Stamp $task.next_run_at), (Format-Stamp $task.last_run_at), $task.last_status)
}
if (-not $alive) { exit 1 }
