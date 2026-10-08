import type { EngineInterface, Register } from 'claude-code'

import { formatStatus, levelOf } from './format'

const EVERY_MS = 60_000
const LINE = { plugin: 'burn-meter', key: 'line' } as const
const LEVEL = { plugin: 'burn-meter', key: 'level' } as const
const COLOR = { easy: 'green', normal: 'yellow', heavy: 'red' } as const

/**
 * Finds this session's transcript and feeds it to the burn script: ~/.claude/statusline-burn.py when the
 * terminal's statusline uses one, else the copy bundled with this mod ($2).
 */
const SCRIPT = `f=$(ls "$HOME"/.claude/projects/*/"$1".jsonl 2>/dev/null | head -1)
s="$HOME/.claude/statusline-burn.py"; [ -f "$s" ] || s="$2/scripts/statusline-burn.py"
printf '{"transcript_path":"%s"}' "$f" | NO_COLOR=1 python3 "$s"`

async function refresh($: EngineInterface): Promise<void> {
  let line: string | null = null
  try {
    const id = await $.session.id()
    const r = await $.process.run(['/bin/sh', '-c', SCRIPT, 'sh', id, $.plugin.root], { timeoutMs: 20_000 })
    line = formatStatus(r.stdout) ?? null
  } catch {
    line = null
  }
  await $.state.set(LINE, line)
  await $.state.set(LEVEL, line ? levelOf(line) : null)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    $.ui.status(undefined) // 0.1.0 drew this in the status area
    void refresh($)
    $.clock.every(EVERY_MS, () => refresh($))
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    void refresh($)
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    // The terminal already shows this through the statusLine command.
    if (e.surface === 'terminal' || e.props.hasSurvey) return below

    const { value: line = null } = await $.state.get(LINE)
    if (!line) return below
    const { value: level = null } = await $.state.get(LEVEL)

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Text>
          <Text dimColor>5h usage · </Text>
          <Text color={level ? COLOR[level] : undefined}>{line}</Text>
        </Text>
        {below}
      </Box>
    )
  })
}
