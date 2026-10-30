<#
.SYNOPSIS
  Registers (or removes) the Windows scheduled task that keeps the daemon running.

.DESCRIPTION
  The daemon owns its own cron schedule, so this task only needs to start it once at
  logon and restart it if the process dies. Registering requires no elevation for a
  task in the current user's context.

  The task runs scripts\evidence-daemon-run.ps1 with -WindowStyle Hidden, working
  directory set to the repository, and "restart on failure" configured to 3 retries.

.EXAMPLE
  pwsh -File scripts\install-evidence-daemon-task.ps1
  pwsh -File scripts\install-evidence-daemon-task.ps1 -Uninstall
#>
[CmdletBinding()]
param(
  [string]$TaskName = "HLD-Evidence-Daemon",
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$runner = Join-Path $PSScriptRoot "evidence-daemon-run.ps1"

if ($Uninstall) {
  $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $existing) { Write-Host "task $TaskName is not registered"; exit 0 }
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "unregistered $TaskName"
  exit 0
}

if (-not (Test-Path $runner)) { throw "missing $runner" }
$pwsh = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
if (-not $pwsh) { $pwsh = (Get-Command powershell).Source }

$action = New-ScheduledTaskAction -Execute $pwsh -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runner`"" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 5) `
  -ExecutionTimeLimit (New-TimeSpan -Days 0)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "Human's Last Dashboard evidence automation daemon (discovery + quality audit)" -Force | Out-Null

$task = Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName, State
Write-Host ("registered {0} (state {1}), action: {2} {3}" -f $task.TaskName, $task.State, $pwsh, $runner)
Write-Host "start now with: Start-ScheduledTask -TaskName $TaskName"
