<#
.SYNOPSIS
  Stops the background evidence automation daemon.

.DESCRIPTION
  Stops only the process recorded in the state file, then marks the state as not
  running. An unrecorded or already-dead process is reported, not guessed at.
#>
[CmdletBinding()]
param([switch]$Force)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$stateFile = Join-Path $repo ".evidence-mcp\state\daemon.json"

if (-not (Test-Path $stateFile)) {
  Write-Host "no state file; nothing recorded to stop"
  exit 0
}

$state = Get-Content $stateFile -Raw | ConvertFrom-Json
$process = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
if (-not $process) {
  Write-Host "recorded pid $($state.pid) is not running; marking state stopped"
} else {
  Stop-Process -Id $state.pid -ErrorAction Stop
  Write-Host "stopped daemon pid $($state.pid)"
}

$state.running = $false
$state | Add-Member -NotePropertyName stopped_at -NotePropertyValue (Get-Date).ToString("o") -Force
$state | ConvertTo-Json -Depth 6 | Set-Content -Path $stateFile -Encoding utf8
