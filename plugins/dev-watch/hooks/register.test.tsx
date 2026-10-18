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

import { mine, nudgeText, shouldNudge } from './register'
import { isLaunch, newKeys, ownKeys, signature } from './scan'

const docker = { id: 'docker:1', kind: 'docker' as const, label: 'Docker (1 container)', ids: ['c1'] }
const web = { id: 'server:Next.js dev:proj/web', kind: 'server' as const, label: 'Next.js dev (proj/web)', ids: ['100', '101'] }
const vite = { id: 'server:Vite:proj/web', kind: 'server' as const, label: 'Vite (proj/web)', ids: ['200'] }
const base = { kept: null, nudged: [] as string[], agentStatuses: ['completed'] }

test('nudges about what this session started', async () => {
  expect(shouldNudge({ ...base, items: [web], all: [docker, web] })).toBe(true)
  expect(nudgeText([web])).toContain('Next.js dev (proj/web)')
})

test('only items whose keys this session owns are its own', async () => {
  const owned = new Set(newKeys([docker], [docker, web]))
  expect(mine([docker, web], owned).map(i => i.id)).toEqual([web.id])
})

test('never nudges again for things already named, even when the set shrinks or something else closes', async () => {
  const nudged = [...ownKeys(web), ...ownKeys(vite)]
  expect(shouldNudge({ ...base, nudged, items: [web], all: [docker, web] })).toBe(false)
  expect(shouldNudge({ ...base, nudged: ownKeys(web), items: [web, vite], all: [web, vite] })).toBe(true)
})

test('stays quiet when nothing of its own is up, or the person kept the set', async () => {
  expect(shouldNudge({ ...base, items: [], all: [docker] })).toBe(false)
  expect(shouldNudge({ ...base, kept: signature([docker, web]), items: [web], all: [docker, web] })).toBe(false)
})

test('stays quiet while an agent is still working — the tools may be its', async () => {
  for (const s of ['running', 'pending', 'waiting']) {
    expect(shouldNudge({ ...base, agentStatuses: ['completed', s], items: [web], all: [web] })).toBe(false)
  }
})

test('recognises calls that start dev tools', async () => {
  expect(isLaunch('Bash', { command: 'cd apps/web && npm run dev' })).toBe(true)
  expect(isLaunch('Bash', { command: 'docker compose up -d' })).toBe(true)
  expect(isLaunch('Bash', { command: 'xcrun simctl boot "iPhone 16"' })).toBe(true)
  expect(isLaunch('Bash', { command: 'sleep 1', run_in_background: true })).toBe(true)
  expect(isLaunch('mcp__Claude_Browser__preview_start', {})).toBe(true)
  expect(isLaunch('Bash', { command: 'git status && npm test' })).toBe(false)
  expect(isLaunch('Read', {})).toBe(false)
})
