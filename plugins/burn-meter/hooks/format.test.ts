import { expect, test } from 'claude-code/testing'

import { formatStatus, levelOf, to12h } from './format'

test('keeps the script line, minus colour codes', async () => {
  expect(formatStatus('\u001b[2m2.6h left\u001b[0m · \u001b[33m31.4M → ~64.2M by 21:00\u001b[0m\n')).toBe('2.6h left · 31.4M → ~64.2M by 9:00 PM')
})

test('clears on empty output', async () => {
  expect(formatStatus('')).toBeUndefined()
  expect(formatStatus('\n  \n')).toBeUndefined()
})

test('reads the verdict', async () => {
  expect(levelOf('2.6h left · 31M → ~64M by 21:00 · normal · ⧉2 sessions')).toBe('normal')
  expect(levelOf('1h left · 90M → ~120M by 21:00 · HEAVY')).toBe('heavy')
  expect(levelOf('5h block · idle')).toBeNull()
})

test('converts to 12-hour time', async () => {
  expect(to12h('21:00')).toBe('9:00 PM')
  expect(to12h('00:30')).toBe('12:30 AM')
  expect(to12h('12:05')).toBe('12:05 PM')
  expect(to12h('09:15')).toBe('9:15 AM')
})
