export type Hit = { key: string; label: string; detail: string | null; isYours: boolean }

type Args = Record<string, unknown>

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

function host(url: unknown): string | null {
  const s = str(url)
  if (!s) return null
  const m = s.match(/^[a-z]+:\/\/([^/?#]+)/i)
  return m?.[1] ?? (s.length > 40 ? `${s.slice(0, 40)}…` : s)
}

function short(cmd: string): string {
  const one = cmd.replace(/\s+/g, ' ').trim()
  return one.length > 48 ? `${one.slice(0, 48)}…` : one
}

/** Which outside thing a Bash command drives, if any. */
function fromBash(command: string): Hit | null {
  const c = command
  // Simulators and emulators first: `open -a Simulator` and `emulator -avd` are theirs, not generic apps.
  if (/\bopen\s+(?:-\w+\s+)*-a\s+["']?Simulator\b/.test(c)) return { key: 'ios-sim', label: 'iOS Simulator', detail: 'opened', isYours: false }
  if (/\b(expo\s+(run:ios|start\b.*--ios)|react-native\s+run-ios)\b|\bnpx\s+expo\s+run:ios/.test(c)) return { key: 'ios-sim', label: 'iOS Simulator', detail: short(c), isYours: false }
  if (/\bxcodebuild\b.*-destination\s+["']?[^"']*Simulator/.test(c)) return { key: 'ios-sim', label: 'iOS Simulator', detail: 'xcodebuild', isYours: false }
  if (/\bidb\s/.test(c)) return { key: 'ios-sim', label: 'iOS Simulator', detail: short(c), isYours: false }
  if (/\b(expo\s+(run:android|start\b.*--android)|react-native\s+run-android)\b|\bemulator\s+(-avd|@)/.test(c)) return { key: 'android', label: 'Android emulator', detail: short(c), isYours: false }
  const openApp = c.match(/\bopen\s+(?:-\w+\s+)*-a\s+(?:"([^"]+)"|'([^']+)'|(\S+))/)
  if (openApp) {
    const app = openApp[1] ?? openApp[2] ?? openApp[3] ?? 'an app'
    return { key: `app:${app}`, label: app, detail: 'opened', isYours: true }
  }
  if (/\bopen\s+-t\b/.test(c)) return { key: 'app:TextEdit', label: 'Text editor', detail: 'opened a file', isYours: true }
  if (/\bopen\s+["']?https?:\/\//.test(c)) return { key: 'default-browser', label: 'Your default browser', detail: host(c.match(/https?:\/\/\S+/)?.[0]), isYours: true }
  if (/\bosascript\b/.test(c)) return { key: 'applescript', label: 'macOS apps (AppleScript)', detail: short(c), isYours: true }
  if (/(^|[\s;&|(])docker(\s|-compose\b)/.test(c)) return { key: 'docker', label: 'Docker', detail: short(c), isYours: false }
  if (/\bmaestro\b/.test(c)) return { key: 'ios-sim', label: 'iOS Simulator', detail: 'Maestro', isYours: false }
  if (/\bxcrun\s+simctl\b/.test(c)) return { key: 'ios-sim', label: 'iOS Simulator', detail: short(c), isYours: false }
  if (/\b(adb|emulator)\s/.test(c)) return { key: 'android', label: 'Android emulator', detail: short(c), isYours: false }
  if (/\bplaywright\b/.test(c)) return { key: 'playwright', label: 'Playwright browser', detail: short(c), isYours: false }
  return null
}

/** What a tool call controls outside the conversation, or null when it controls nothing. */
export function classify(tool: string, args: Args): Hit | null {
  if (tool === 'Bash') return fromBash(str(args.command) ?? '')

  // Match the server name anywhere: remote setups prefix it (mcp__remote-devices__Claude_Browser__…).
  const action = tool.split('__').at(-1) ?? tool
  if (tool.includes('claude-in-chrome__')) {
    return { key: 'chrome', label: 'Your Chrome', detail: host(args.url) ?? action, isYours: true }
  }
  if (tool.includes('Claude_Browser__')) {
    return { key: 'builtin-browser', label: 'Built-in browser', detail: host(args.url) ?? action, isYours: false }
  }
  if (tool.includes('computer-use__')) {
    const apps = Array.isArray(args.apps) ? args.apps.filter(a => typeof a === 'string') : []
    const app = str(args.app) ?? str(args.app_name) ?? str(args.application) ?? str(args.bundle_id) ?? (apps.length ? apps.join(', ') : null)
    return app
      ? { key: `app:${app}`, label: app, detail: action, isYours: true }
      : { key: 'screen', label: 'Your screen', detail: action, isYours: true }
  }
  if (tool.includes('iOS_Simulator__')) {
    return { key: 'ios-sim', label: 'iOS Simulator', detail: str(args.action), isYours: false }
  }
  if (tool === 'mcp__terminal__run_in_terminal' || tool === 'mcp__terminal__open_terminal_tab') {
    return { key: 'terminal-panel', label: 'Terminal panel', detail: str(args.command) ? short(str(args.command) as string) : null, isYours: false }
  }
  return null
}
