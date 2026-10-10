import type { EngineInterface, Register } from 'claude-code'

import { progressText, toRows } from './rows'
import type { Seen, Step, StepStatus } from './rows'

const EVERY_MS = 15_000
const ROWS = { plugin: 'agent-watch', key: 'rows' } as const

const firstSeen = new Map<string, number>()
const lastActivity = new Map<string, number>()
const lastBackground = new Map<string, boolean>()
/** Per agent: its TodoWrite list (replaced whole on each call). */
const todoSteps = new Map<string, Step[]>()
/** Per agent: tasks made with TaskCreate, by id, kept current by TaskUpdate. */
const taskSteps = new Map<string, Map<string, Step>>()

const STATUSES: readonly StepStatus[] = ['pending', 'in_progress', 'completed']
const isStatus = (v: unknown): v is StepStatus => STATUSES.includes(v as StepStatus)

function stepsOf(agentId: string): Step[] {
  return todoSteps.get(agentId) ?? [...(taskSteps.get(agentId)?.values() ?? [])]
}
// Module state: a reload starts these over, which only resets the timers shown.
let shown = '[]'

async function poll($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  const agents = await $.agent.list()
  const seen: Seen[] = agents
    .filter(a => !a.teammateId)
    .map(a => {
      if (!firstSeen.has(a.id)) firstSeen.set(a.id, now)
      return {
        id: a.id,
        description: a.description,
        type: a.type,
        status: a.status,
        firstSeenAt: firstSeen.get(a.id) ?? now,
        lastActivityAt: lastActivity.get(a.id) ?? null,
        lastWasBackground: lastBackground.get(a.id) ?? false,
        steps: stepsOf(a.id),
      }
    })
  const rows = toRows(seen, now)
  const next = JSON.stringify(rows)
  // Only redraw when something visible changed.
  if (next !== shown) {
    shown = next
    await $.state.set(ROWS, rows)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    void poll($)
    $.clock.every(EVERY_MS, () => poll($))
    return result
  })

  on('tool.call', async ($, e, next) => {
    const agentId = e.agentId
    if (!agentId) return next(e)
    lastActivity.set(agentId, await $.clock.now())
    lastBackground.set(agentId, e.tool === 'Bash' && e.run_in_background === true)

    if (e.tool === 'TodoWrite') {
      todoSteps.set(
        agentId,
        e.todos.filter(t => isStatus(t.status)).map(t => ({ status: t.status, label: t.activeForm || t.content })),
      )
      return next(e)
    }

    if (e.tool === 'TaskCreate') {
      const ran = await next(e)
      const id = ran.deny === undefined && !ran.isError ? (ran.result as { task?: { id?: string } } | undefined)?.task?.id : undefined
      if (id) {
        const tasks = taskSteps.get(agentId) ?? new Map<string, Step>()
        tasks.set(id, { status: 'pending', label: e.activeForm || e.subject })
        taskSteps.set(agentId, tasks)
      }
      return ran
    }

    if (e.tool === 'TaskUpdate') {
      const task = taskSteps.get(agentId)?.get(e.taskId)
      if (task) {
        if (e.status === 'deleted') taskSteps.get(agentId)?.delete(e.taskId)
        else
          taskSteps.get(agentId)?.set(e.taskId, {
            status: isStatus(e.status) ? e.status : task.status,
            label: e.activeForm || e.subject || task.label,
          })
      }
      return next(e)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const { value: rows = [] } = await $.state.get(ROWS)
    if (!rows.length) return below

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
          <Text dimColor>Subagents ({rows.length}):</Text>
          {rows.map(r => (
            <Text key={r.id} color={r.flag ? 'red' : undefined}>
              {r.label} · {r.elapsedMin}m{r.progress ? ` · ${progressText(r.progress)}` : ''}
              {r.flag ? ` ⚠ ${r.flag}` : ''}
            </Text>
          ))}
        </Box>
        {below}
      </Box>
    )
  })
}
