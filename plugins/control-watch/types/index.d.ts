export type Control = {
  /** One line per controlled thing: "chrome", "app:Finder", "docker". */
  key: string
  label: string
  /** What it was doing last, e.g. "linkedin.com" or "docker compose up". */
  detail: string | null
  /** Your own browser/apps (red) versus sandboxed or dev tools. */
  isYours: boolean
  isRunning: boolean
  lastAt: number
  /** Set when a subagent made the call. */
  byAgent: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'control-watch': { controls: Control[] }
  }
}
