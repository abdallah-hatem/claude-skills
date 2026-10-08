import type { EngineInterface, Register } from 'claude-code'

import { check, parseConfig } from './rules'

/** Runs a host command; any failure reads as no output. */
async function sh($: EngineInterface, argv: string[], cwd: string): Promise<string> {
  try {
    const r = await $.process.run(argv, { cwd, timeoutMs: 10_000 })
    return r.exitCode === 0 ? r.stdout : ''
  } catch {
    return ''
  }
}

async function guard($: EngineInterface, command: string, cwd: string, lastPrompt: string): Promise<string | null> {
  const home = (await $.env.get('HOME')) ?? ''
  let json: string | null = null
  try {
    json = await $.fs.read(`${home}/.claude/safe-guard.json`)
  } catch {
    json = null
  }
  return check(command, {
    config: parseConfig(json),
    home,
    cwd,
    lastPrompt,
    gitEmail: dir => sh($, ['git', 'config', 'user.email'], dir),
    gitRemotes: async dir =>
      (await sh($, ['git', 'remote', '-v'], dir))
        .split('\n')
        .map(l => l.split(/\s+/)[1] ?? '')
        .filter(Boolean),
    conflictFiles: async dir =>
      (await sh($, ['git', 'grep', '-l', '-E', '^(<<<<<<<|>>>>>>>) '], dir)).split('\n').filter(Boolean),
  })
}

export const register: Register = on => {
  let lastPrompt = ''
  let cwd = ''

  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    lastPrompt = e.text
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const reason = await guard($, e.command, cwd || '.', lastPrompt)
    if (!reason) return next(e)
    $.ui.toast(`safe-guard blocked: ${e.command.slice(0, 60)}`)
    return { deny: `Blocked by the safe-guard mod: ${reason}` }
  })
}
