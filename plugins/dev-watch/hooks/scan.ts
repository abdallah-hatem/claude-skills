import type { Item } from '../types'

/** Dev servers and tools worth flagging, matched against full command lines (pgrep -f, extended regex). */
export const SERVER_PATTERN =
  'next dev|next-server|vite|nest start|nodemon|expo start|react-native start|metro|turbo (run|dev)|playwright|ngrok|cloudflared|maestro|react-native-devtools|React Native DevTools'

const LABELS: [RegExp, string][] = [
  [/next dev|next-server/, 'Next.js dev'],
  [/nest start/, 'NestJS'],
  [/expo start|react-native start|metro/, 'Metro'],
  [/react-native-devtools|React Native DevTools/, 'RN DevTools'],
  [/vite/, 'Vite'],
  [/nodemon/, 'nodemon'],
  [/turbo (run|dev)/, 'Turbo'],
  [/playwright/, 'Playwright'],
  [/ngrok/, 'ngrok'],
  [/cloudflared/, 'cloudflared'],
  [/maestro/, 'Maestro'],
]

/**
 * Lines that belong to Claude itself (its MCP servers, the app) and must never be flagged or killed.
 * Either slash: Windows command lines use backslashes, and the app is claude.exe there.
 */
const OWN = /[\\/]\.claude[\\/]|Claude\.app|Claude Helper|claude\.exe|\bmcp\b/i

export type ServerProc = { pid: string; label: string; cwd: string | null }

/** `pgrep -fl` output → the dev processes in it, Claude's own left out. */
export function parseServers(pgrepOut: string): { pid: string; label: string }[] {
  const out: { pid: string; label: string }[] = []
  for (const line of pgrepOut.split('\n')) {
    const [, pid, cmd] = line.match(/^(\d+)\s+(.*)$/) ?? []
    if (!pid || !cmd || OWN.test(cmd)) continue
    const hit = LABELS.find(([re]) => re.test(cmd))
    if (hit) out.push({ pid, label: hit[1] })
  }
  return out
}

/** `lsof -Fn` output → the process's working directory. */
export function parseCwd(lsofOut: string): string | null {
  const line = lsofOut.split('\n').find(l => l.startsWith('n/'))
  return line ? line.slice(1) : null
}

/** Last two path segments, enough to name the project ("azhar_tutor/api"). */
export function shortPath(cwd: string | null): string | null {
  if (!cwd) return null
  const parts = cwd.split('/').filter(Boolean)
  return parts.slice(-2).join('/')
}

/** Dev processes grouped by tool and project, so Next's two processes read as one line. */
export function groupServers(procs: ServerProc[]): Item[] {
  const groups = new Map<string, Item>()
  for (const p of procs) {
    const where = shortPath(p.cwd)
    const id = `server:${p.label}:${where ?? ''}`
    const g = groups.get(id)
    if (g) g.ids.push(p.pid)
    else groups.set(id, { id, kind: 'server', label: where ? `${p.label} (${where})` : p.label, ids: [p.pid] })
  }
  return [...groups.values()]
}

/** `xcrun simctl list devices booted` output → the booted simulators. */
export function parseSimulators(out: string): Item[] {
  const items: Item[] = []
  for (const line of out.split('\n')) {
    const [, name, udid] = line.match(/^\s+(.+?) \(([0-9A-F-]{36})\) \(Booted\)/) ?? []
    if (name && udid) items.push({ id: `sim:${udid}`, kind: 'simulator', label: `${name} simulator`, ids: [udid] })
  }
  return items
}

/** `docker ps --format {{.ID}}` output → one Docker item (Desktop up counts even with no containers). */
export function dockerItem(psOut: string | null): Item {
  const ids = (psOut ?? '').split('\n').map(s => s.trim()).filter(Boolean)
  const n = ids.length
  const label = n === 0 ? 'Docker Desktop' : `Docker (${n} container${n === 1 ? '' : 's'})`
  return { id: `docker:${n}`, kind: 'docker', label, ids }
}

/** What the band remembers when the person chooses to keep things running. */
export function signature(items: Item[]): string {
  return items.map(i => i.id).sort().join('|')
}

/**
 * What identifies an item across scans, for "who started it": process ids, container ids, a simulator's
 * UDID. Docker Desktop itself counts as one key, so a session that started Docker owns it too.
 */
export function ownKeys(item: Item): string[] {
  if (item.kind === 'docker') return ['docker-desktop', ...item.ids.map(id => `ctr:${id}`)]
  if (item.kind === 'simulator') return item.ids.map(id => `sim:${id}`)
  return item.ids.map(id => `pid:${id}`)
}

/** Keys present now that were not present before the turn: what appeared while the turn ran. */
export function newKeys(before: Item[], after: Item[]): string[] {
  const had = new Set(before.flatMap(ownKeys))
  return after.flatMap(ownKeys).filter(k => !had.has(k))
}

const LAUNCH =
  /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start|serve|storybook|preview)\b|\bnext\s+(dev|start)\b|\bvite\b|\bnest\s+start\b|\bnodemon\b|\bexpo\s+(start|run:)|\breact-native\s+(start|run-)|\bdocker(\s+compose|-compose)?\s+(up|run|start)\b|\bopen\s+(?:-\w+\s+)*-a\s+["']?(Docker|Simulator)|\bsimctl\s+boot\b|\bemulator\s+(-avd|@)|\b(playwright|maestro|ngrok|cloudflared)\b|\bturbo\s+(run|dev)\b/

/** Whether a tool call can start a dev tool: a launching Bash command, any background Bash, a preview server or simulator tool. */
export function isLaunch(tool: string, args: Record<string, unknown>): boolean {
  if (tool === 'Bash') return args.run_in_background === true || LAUNCH.test(typeof args.command === 'string' ? args.command : '')
  return /preview_start$|iOS_Simulator__|terminal__run_in_terminal$/.test(tool)
}
