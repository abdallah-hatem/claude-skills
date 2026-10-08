export type Row = {
  id: string
  /** "Task 3 implementer (general-purpose)" */
  label: string
  elapsedMin: number
  /** Why it needs a look, or null when it is working normally. */
  flag: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'agent-watch': { rows: Row[] }
  }
}
