import type { Progress, Row } from '../types'

export const QUIET_MIN = 5
export const BG_WAIT_MIN = 2

export type StepStatus = 'pending' | 'in_progress' | 'completed'
export type Step = { status: StepStatus; label: string }

/** An agent's to-do list → done / total and the step in progress; null for an empty list. */
export function progressOf(steps: readonly Step[]): Progress | null {
  if (!steps.length) return null
  const done = steps.filter(s => s.status === 'completed').length
  const current = steps.find(s => s.status === 'in_progress')?.label ?? null
  return { done, total: steps.length, current }
}

/** How a row shows progress: "step 4 of 7: Writing tests", or "7 of 7 done". */
export function progressText(p: Progress): string {
  if (p.done >= p.total) return `${p.done} of ${p.total} done`
  const step = p.current ? Math.min(p.done + 1, p.total) : p.done
  const name = p.current ? `: ${p.current.length > 40 ? `${p.current.slice(0, 40)}…` : p.current}` : ''
  return p.current ? `step ${step} of ${p.total}${name}` : `${p.done} of ${p.total} done`
}

export type Seen = {
  id: string
  description: string
  type: string
  status: string
  firstSeenAt: number
  lastActivityAt: number | null
  /** The agent's last Bash call ran in the background. */
  lastWasBackground: boolean
  steps: readonly Step[]
}

const ACTIVE = new Set(['pending', 'running', 'waiting'])

/** Running agents → band rows, oldest first, each flagged when it looks stalled. */
export function toRows(agents: Seen[], now: number): Row[] {
  return agents
    .filter(a => ACTIVE.has(a.status))
    .sort((a, b) => a.firstSeenAt - b.firstSeenAt)
    .map(a => {
      const elapsedMin = Math.floor((now - a.firstSeenAt) / 60_000)
      const quietMin = Math.floor((now - (a.lastActivityAt ?? a.firstSeenAt)) / 60_000)
      let flag: string | null = null
      if (a.lastWasBackground && quietMin >= BG_WAIT_MIN) flag = `waiting on a background run ${quietMin}m`
      else if (quietMin >= QUIET_MIN) flag = `quiet ${quietMin}m`
      const label = a.type && a.type !== 'general-purpose' ? `${a.description} (${a.type})` : a.description
      return { id: a.id, label, elapsedMin, flag, progress: progressOf(a.steps) }
    })
}
