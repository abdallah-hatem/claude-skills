import type { EngineInterface, Register } from 'claude-code'

import { toRows } from './rows'
import type { Seen } from './rows'

const EVERY_MS = 15_000
const ROWS = { plugin: 'agent-watch', key: 'rows' } as const

const firstSeen = new Map<string, number>()
const lastActivity = new Map<string, number>()
const lastBackground = new Map<string, boolean>()
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
    if (e.agentId) {
      lastActivity.set(e.agentId, await $.clock.now())
      lastBackground.set(e.agentId, e.tool === 'Bash' && e.run_in_background === true)
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
              {r.label} · {r.elapsedMin}m{r.flag ? ` ⚠ ${r.flag}` : ''}
            </Text>
          ))}
        </Box>
        {below}
      </Box>
    )
  })
}
