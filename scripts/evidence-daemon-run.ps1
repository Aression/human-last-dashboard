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

& $node @arguments
exit $LASTEXITCODE
