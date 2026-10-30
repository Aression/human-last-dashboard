<#
.SYNOPSIS
  Runs the evidence automation daemon in the foreground.

.DESCRIPTION
  This is the process a supervisor (the Windows scheduled task, a container entry
  point, or a terminal) should own. It does not detach: it keeps running until
  stopped, because the daemon owns its own cron schedule.

  State, logs and run records land under <repo>\.evidence-mcp\.
#>
[CmdletBinding()]
param(
  [ValidateSet("discovery", "quality")]
  [string]$Once
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$node = (Get-Command node -ErrorAction Stop).Source
if (-not (Test-Path (Join-Path $repo "node_modules\tsx"))) {
  throw "tsx is not installed; run 'npm install' in $repo first"
}

$arguments = @("--import", "tsx", "tools/evidence-mcp/src/daemon.ts")
if ($Once) { $arguments += @("--once", $Once) }

# Two schedulers would fire every task twice. Refuse to start when a live daemon
# already holds the state file (the logon task and a manual start can overlap).
if (-not $Once) {
  $stateFile = Join-Path $repo ".evidence-mcp\state\daemon.json"
  if (Test-Path $stateFile) {
    try {
      $state = Get-Content $stateFile -Raw | ConvertFrom-Json
      $alive = [bool](Get-Process -Id $state.pid -ErrorAction SilentlyContinue)
      if ($alive -and $state.running -eq $true) {
        Write-Host "daemon already running (pid $($state.pid)); not starting a second scheduler"
        exit 0
      }
    } catch {
      # Unreadable state is not proof of a second daemon; keep starting.
    }
  }
}

& $node @arguments
exit $LASTEXITCODE
