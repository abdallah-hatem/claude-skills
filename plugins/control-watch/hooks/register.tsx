import type { EngineInterface, Register } from 'claude-code'

import type { Control } from '../types'
import { classify } from './classify'

const CONTROLS = { plugin: 'control-watch', key: 'controls' } as const
/** How long a thing stays on the band after its last call. */
const RECENT_MS = 60_000

// Module state: a reload starts it over.
const controls = new Map<string, Control>()
let shown = '[]'

/** A macOS notification with a sound: the Code tab doesn't show a mod's toasts. */
async function notify($: EngineInterface, text: string): Promise<void> {
  const quoted = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  try {
    await $.process.run(['osascript', '-e', `display notification "${quoted}" with title "Claude Code" sound name "Glass"`], { timeoutMs: 5_000 })
  } catch {
    // No notification is better than a failed tool call.
  }
}

/** Writes the visible list to state when it changed (drops what went quiet a minute ago). */
async function publish($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  for (const [key, c] of controls) if (!c.isRunning && now - c.lastAt > RECENT_MS) controls.delete(key)
  const list = [...controls.values()].sort((a, b) => Number(b.isYours) - Number(a.isYours) || b.lastAt - a.lastAt)
  const next = JSON.stringify(list.map(c => [c.key, c.label, c.detail, c.isRunning, c.byAgent]))
  if (next === shown) return
  shown = next
  await $.state.set(CONTROLS, list)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    $.clock.every(5_000, () => publish($))
    return result
  })

  on('tool.call', async ($, e, next) => {
    const hit = classify(e.tool, e as unknown as Record<string, unknown>)
    if (!hit) return next(e)

    const now = await $.clock.now()
    const before = controls.get(hit.key)
    if (hit.isYours && !before) {
      const text = `Claude is now controlling ${hit.label}${hit.detail ? ` (${hit.detail})` : ''}`
      $.ui.toast(text)
      void notify($, text)
    }
    controls.set(hit.key, { ...hit, isRunning: true, lastAt: now, byAgent: Boolean(e.agentId) })
    await publish($)
    try {
      return await next(e)
    } finally {
      const c = controls.get(hit.key)
      if (c) controls.set(hit.key, { ...c, isRunning: false, lastAt: await $.clock.now() })
      await publish($)
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const { value: list = [] } = await $.state.get(CONTROLS)
    if (!list.length) return below

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
          <Text bold color={list.some(c => c.isYours) ? 'red' : 'yellow'}>
            Claude is controlling:
          </Text>
          {list.map(c => (
            <Text key={c.key} color={c.isYours ? 'red' : undefined}>
              {c.isRunning ? '● ' : '○ '}
              {c.label}
              {c.detail ? ` (${c.detail})` : ''}
              {c.byAgent ? ' · subagent' : ''}
              {c.isRunning ? '' : ' · just now'}
            </Text>
          ))}
        </Box>
        {below}
      </Box>
    )
  })
}
