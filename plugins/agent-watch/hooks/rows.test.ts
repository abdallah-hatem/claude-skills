import { expect, test } from 'claude-code/testing'

import { progressOf, progressText, toRows } from './rows'
import type { Seen } from './rows'

const MIN = 60_000
const agent = (over: Partial<Seen>): Seen => ({
  id: 'a1', description: 'Task 3 implementer', type: 'general-purpose', status: 'running',
  firstSeenAt: 0, lastActivityAt: null, lastWasBackground: false, steps: [], ...over,
})

test('lists running agents only, oldest first', async () => {
  const rows = toRows([
    agent({ id: 'b', firstSeenAt: 2 * MIN }),
    agent({ id: 'a', firstSeenAt: 0 }),
    agent({ id: 'done', status: 'completed' }),
  ], 3 * MIN)
  expect(rows.map(r => r.id)).toEqual(['a', 'b'])
  expect(rows[0]?.elapsedMin).toBe(3)
})

test('flags a quiet agent', async () => {
  expect(toRows([agent({ lastActivityAt: 1 * MIN })], 7 * MIN)[0]?.flag).toBe('quiet 6m')
  expect(toRows([agent({ lastActivityAt: 5 * MIN })], 7 * MIN)[0]?.flag).toBeNull()
})

test('flags an agent sitting on a background run sooner', async () => {
  expect(toRows([agent({ lastActivityAt: 4 * MIN, lastWasBackground: true })], 7 * MIN)[0]?.flag).toBe('waiting on a background run 3m')
})

test('names the type unless it is the default', async () => {
  expect(toRows([agent({ type: 'Explore', description: 'find auth' })], 0)[0]?.label).toBe('find auth (Explore)')
  expect(toRows([agent({})], 0)[0]?.label).toBe('Task 3 implementer')
})

test('step progress from a to-do list', async () => {
  const p = progressOf([
    { status: 'completed', label: 'Read the plan' },
    { status: 'completed', label: 'Write the DTO' },
    { status: 'in_progress', label: 'Writing tests' },
    { status: 'pending', label: 'Run the suite' },
  ])
  expect(p).toEqual({ done: 2, total: 4, current: 'Writing tests' })
  expect(progressText(p!)).toBe('step 3 of 4: Writing tests')
  expect(progressText({ done: 4, total: 4, current: null })).toBe('4 of 4 done')
  expect(progressText({ done: 1, total: 4, current: null })).toBe('1 of 4 done')
  expect(progressOf([])).toBeNull()
})

test('rows carry progress, or null without a list', async () => {
  const rows = toRows([agent({ steps: [{ status: 'in_progress', label: 'x' }] }), agent({ id: 'b' })], 0)
  expect(rows[0]?.progress).toEqual({ done: 0, total: 1, current: 'x' })
  expect(rows[1]?.progress).toBeNull()
})
