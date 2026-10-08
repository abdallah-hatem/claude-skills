import type { EngineInterface, Register } from 'claude-code'

import { isMainLoop, learningsText, withLearnings } from './compose'

async function readOrNull($: EngineInterface, path: string): Promise<string | null> {
  try {
    return await $.fs.read(path)
  } catch {
    return null
  }
}

/** Read once per session so the system prompt stays stable and the prompt cache holds. */
async function load($: EngineInterface, cwd: string): Promise<string | null> {
  const home = (await $.env.get('HOME')) ?? ''
  const globalPath = `${home}/.claude/LEARNINGS.md`
  const projectPath = `${cwd}/.claude/LEARNINGS.md`
  const global = await readOrNull($, globalPath)
  const project = projectPath === globalPath ? null : await readOrNull($, projectPath)
  return learningsText(global, project, projectPath)
}

export const register: Register = on => {
  let text: Promise<string | null> | null = null

  on('session.start', async ($, e, next) => {
    text = load($, e.cwd)
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!isMainLoop(e.tools)) return composed
    text ??= load($, await $.session.cwd())
    const learnings = await text
    return learnings ? { sections: withLearnings(composed.sections, learnings) } : composed
  })
}
