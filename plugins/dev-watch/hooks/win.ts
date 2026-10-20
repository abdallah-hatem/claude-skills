import type { EngineInterface } from 'claude-code'

/**
 * Windows support. The module was written against macOS tools (pgrep, pkill, kill, lsof, xcrun,
 * osascript); on Windows each call is translated here, so scan.ts's parsers and register.tsx's flow
 * stay as they are. Arguments travel in environment variables, never spliced into a script, so a
 * pattern or a toast's text can't break the PowerShell quoting.
 */

export type HostCall = { argv: string[]; env?: Record<string, string> }

const PS = ['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command']

/** Claude itself, its app, and MCP servers: never matched for killing, whatever the pattern. */
const OWN_PS = String.raw`[\\/]\.claude[\\/]|claude\.exe|Claude Helper|\bmcp\b|@anthropic-ai|claude-code`

/**
 * One query over Win32_Process. pgrep matches case-sensitively, so -cmatch. Mode:
 *   ids   pgrep -f    one pid per line
 *   long  pgrep -fl   "pid command line"
 *   name  pgrep -x    pids whose image name is exactly the name
 *   killp pkill -f    tree-kill every match, Claude's own excepted
 *   killn pkill -x    the same, by image name
 */
const QUERY = String.raw`
$p = $env:DW_PAT; $mode = $env:DW_MODE
$all = Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID }
if ($mode -eq 'name' -or $mode -eq 'killn') {
  $hit = $all | Where-Object { $_.Name -ceq $p -or $_.Name -ceq "$p.exe" }
} else {
  $hit = $all | Where-Object { $_.CommandLine -and $_.CommandLine -cmatch $p }
}
if ($mode -like 'kill*') {
  $hit | Where-Object { -not ($_.CommandLine -match $env:DW_OWN) } |
    ForEach-Object { taskkill /T /F /PID $_.ProcessId 2>$null | Out-Null }
} elseif ($mode -eq 'long') {
  $hit | ForEach-Object { "$($_.ProcessId) $(($_.CommandLine -replace '[\r\n]+', ' '))" }
} else {
  $hit | ForEach-Object { $_.ProcessId }
}`

/** macOS's Docker Desktop process pattern, and what the same processes are called on Windows. */
const MAC_DOCKER = /Docker\.app|Docker Desktop\.app/
const WIN_DOCKER = String.raw`Docker Desktop\.exe|com\.docker\.backend`

function query(mode: string, pattern: string): HostCall {
  return { argv: [...PS, QUERY], env: { DW_MODE: mode, DW_PAT: pattern, DW_OWN: OWN_PS } }
}

/**
 * The Windows form of a macOS command, or null when there is none (lsof, xcrun, simulators):
 * null reads as empty output, which is exactly "nothing of that kind is running".
 */
export function toWindows(argv: readonly string[]): HostCall | null {
  const [cmd, ...rest] = argv
  const flags = rest.filter(a => a.startsWith('-'))
  const args = rest.filter(a => !a.startsWith('-'))
  // The macOS pattern is app-bundle paths throughout, so a hit swaps it outright rather than in part.
  const pattern = MAC_DOCKER.test(args[0] ?? '') ? WIN_DOCKER : (args[0] ?? '')
  switch (cmd) {
    case 'pgrep':
      if (flags.includes('-x')) return query('name', pattern)
      return query(flags.includes('-fl') ? 'long' : 'ids', pattern)
    case 'pkill':
      return query(flags.includes('-x') ? 'killn' : 'killp', pattern)
    case 'kill': {
      // kill is SIGTERM, kill -9 is SIGKILL: taskkill without /F asks a process to close, with /F forces.
      const pids = args.filter(a => /^\d+$/.test(a))
      if (!pids.length) return null
      return { argv: ['taskkill', '/T', ...(flags.includes('-9') ? ['/F'] : []), ...pids.flatMap(p => ['/PID', p])] }
    }
    case '/usr/local/bin/docker':
      return { argv: ['docker', ...rest] }
    case 'lsof':
    case 'xcrun':
    case 'osascript':
      return null
    default:
      return { argv: [...argv] }
  }
}

let windows: Promise<boolean> | null = null

/** The engine exposes no OS, so probe once per load: cmd.exe only starts on Windows. */
export function onWindows($: EngineInterface): Promise<boolean> {
  windows ??= $.process
    .run(['cmd.exe', '/d', '/c', 'exit 0'], { timeoutMs: 5_000 })
    .then(r => r.exitCode === 0, () => false)
  return windows
}

const TOAST = String.raw`
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$x = $t.GetElementsByTagName('text')
[void]$x.Item(0).AppendChild($t.CreateTextNode('Claude Code'))
[void]$x.Item(1).AppendChild($t.CreateTextNode($env:CC_TOAST))
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe').Show([Windows.UI.Notifications.ToastNotification]::new($t))`

/** A native Windows toast, the counterpart of the macOS notification. */
export async function toastWindows($: EngineInterface, text: string): Promise<void> {
  await $.process.run([...PS, TOAST], { env: { CC_TOAST: text }, timeoutMs: 10_000 })
}
