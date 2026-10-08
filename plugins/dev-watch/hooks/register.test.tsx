import { expect, test } from 'claude-code/testing'

import { dockerItem, groupServers, parseServers, parseSimulators } from './scan'

test('parses pgrep output and leaves Claude’s own processes out', async () => {
  const out = [
    '4242 node /Users/a/proj/node_modules/.bin/nest start --watch',
    '4300 node /Users/a/proj/web/node_modules/.bin/next dev',
    '4301 next-server (v15.1.0)',
    '5000 node /Users/a/.claude/plugins/x/vite-mcp/index.js',
    '5001 /Applications/Claude.app/Contents/Helpers/metro',
  ].join('\n')
  expect(parseServers(out)).toEqual([
    { pid: '4242', label: 'NestJS' },
    { pid: '4300', label: 'Next.js dev' },
    { pid: '4301', label: 'Next.js dev' },
  ])
})

test('groups Next’s two processes in one project into one line', async () => {
  const items = groupServers([
    { pid: '1', label: 'Next.js dev', cwd: '/Users/a/proj/web' },
    { pid: '2', label: 'Next.js dev', cwd: '/Users/a/proj/web' },
  ])
  expect(items.length).toBe(1)
  expect(items[0]?.label).toBe('Next.js dev (proj/web)')
  expect(items[0]?.ids).toEqual(['1', '2'])
})

test('reads booted simulators and docker containers', async () => {
  const sims = parseSimulators(
    '== Devices ==\n-- iOS 18.2 --\n    iPhone 16 (0A1B2C3D-0000-1111-2222-333344445555) (Booted) \n',
  )
  expect(sims[0]?.label).toBe('iPhone 16 simulator')
  expect(dockerItem('abc\ndef\n').label).toBe('Docker (2 containers)')
  expect(dockerItem('').label).toBe('Docker Desktop')
})
