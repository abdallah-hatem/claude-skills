# SubagentStop on Windows: the PowerShell twin of subagent-sweep.sh, which hands off to this file there.
# Same three rules, Windows means:
#   1. anything whose command line is inside the finished agent's worktree
#      (<repo>\.claude\worktrees\agent-<agent_id>\). Windows exposes no process's working directory,
#      so unlike macOS a process that only *sits* in the worktree is not caught.
#   2. jest from any agent worktree whose parent has exited (Windows re-parents nothing to pid 1)
#   3. safety net: a node jest process alive 45+ minutes with its whole tree idle
# Never touches Claude, its MCP servers, or anything outside these patterns. Always exits 0.
# DRYRUN=1 logs what it would kill and kills nothing.
$ErrorActionPreference = 'SilentlyContinue'
$log = Join-Path $HOME '.claude\logs\subagent-sweep.log'
New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null
$dry = $env:DRYRUN -eq '1'

$agent = ''
try { $agent = [string](([Console]::In.ReadToEnd() | ConvertFrom-Json).agent_id) } catch {}

# Mirrors safe() in the .sh. Worktrees live under .claude\ too, so .claude as such is not excluded.
$own = 'claude\.exe|claude-code|[\\/]\.claude[\\/]local[\\/]|mcp|@anthropic-ai'

$procs = @(Get-CimInstance Win32_Process)
$byId = @{}; foreach ($p in $procs) { $byId[[int]$p.ProcessId] = $p }
$children = @{}
foreach ($p in $procs) {
  $pp = [int]$p.ParentProcessId
  if (-not $children.ContainsKey($pp)) { $children[$pp] = New-Object System.Collections.ArrayList }
  [void]$children[$pp].Add([int]$p.ProcessId)
}
function Get-Tree([int]$id) {
  $out = @($id)
  if ($children.ContainsKey($id)) { foreach ($c in $children[$id]) { if ($c -ne $id) { $out += Get-Tree $c } } }
  $out
}

$killed = @{}
function Stop-Tree($p, [string]$reason) {
  $id = [int]$p.ProcessId
  if ($id -eq $PID -or $killed.ContainsKey($id)) { return }
  $cmd = [string]$p.CommandLine
  if (-not $cmd -or $cmd -match $own) { return }
  $killed[$id] = $true
  $short = $cmd.Substring(0, [Math]::Min(160, $cmd.Length))
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  if ($dry) { Add-Content $log "$stamp [$reason] WOULD kill $id (+tree): $short"; return }
  taskkill /T /F /PID $id 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { Add-Content $log "$stamp [$reason] killed $id (+tree): $short" }
}

# 1. the finished agent's worktree
if ($agent) {
  $wt = '\.claude[\\/]worktrees[\\/]agent-' + [regex]::Escape($agent) + '(?=[\\/"''\s]|$)'
  foreach ($p in $procs) { if ($p.CommandLine -match $wt) { Stop-Tree $p "worktree $agent" } }
}

# 2. orphaned jest from any agent worktree
foreach ($p in $procs) {
  $c = [string]$p.CommandLine
  if ($c -match 'jest' -and $c -match '\.claude[\\/]worktrees[\\/]' -and -not $byId.ContainsKey([int]$p.ParentProcessId)) {
    Stop-Tree $p 'orphan jest'
  }
}

# 3. node jest alive 45+ minutes with its whole tree idle: a live run uses CPU somewhere in its tree.
#    Windows has no instant %CPU, so CPU time is sampled twice, two seconds apart.
$cutoff = (Get-Date).AddMinutes(-45)
$cands = @($procs | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'jest' -and $_.CreationDate -lt $cutoff })
if ($cands.Count) {
  function Get-TreeCpu([int]$id) { (Get-Process -Id (Get-Tree $id) | Measure-Object -Property CPU -Sum).Sum }
  $before = @{}; foreach ($p in $cands) { $before[[int]$p.ProcessId] = Get-TreeCpu $p.ProcessId }
  Start-Sleep -Seconds 2
  foreach ($p in $cands) {
    if ((Get-TreeCpu $p.ProcessId) -eq $before[[int]$p.ProcessId]) {
      $age = [int]((Get-Date) - $p.CreationDate).TotalMinutes
      Stop-Tree $p "idle jest ${age}m"
    }
  }
}
exit 0
