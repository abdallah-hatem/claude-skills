import { expect, test } from 'claude-code/testing'

import { isMainLoop, learningsText, withLearnings } from './compose'

test('labels global and project rules', async () => {
  const t = learningsText('- rule A', '- rule B', '/p/.claude/LEARNINGS.md')
  expect(t).toContain('EVERY project\n\n- rule A')
  expect(t).toContain('(/p/.claude/LEARNINGS.md)\n\n- rule B')
  expect(learningsText('', null, 'x')).toBeNull()
})

test('only the main loop gets it', async () => {
  expect(isMainLoop(['Bash', 'Agent', 'Read'])).toBe(true)
  expect(isMainLoop(['Bash', 'Read'])).toBe(false)
})

test('appends once, as a session section', async () => {
  const base = [{ id: 'core', text: 'x', scope: 'shared' as const }]
  const once = withLearnings(base, 'L')
  expect(once.at(-1)).toEqual({ id: 'learnings', text: 'L', scope: 'session' })
  expect(withLearnings(once, 'L2').filter(s => s.id === 'learnings').length).toBe(1)
})
