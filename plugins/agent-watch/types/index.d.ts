export type Progress = {
  done: number
  total: number
  /** The step in progress ("Writing tests"), when the list marks one. */
  current: string | null
}

export type Row = {
  id: string
  /** "Task 3 implementer (general-purpose)" */
  label: string
  elapsedMin: number
  /** Why it needs a look, or null when it is working normally. */
  flag: string | null
  /** From the agent's own to-do list; null when it keeps none. */
  progress: Progress | null
}

declare module 'claude-code' {
  interface PluginState {
    'agent-watch': { rows: Row[] }
  }
}
