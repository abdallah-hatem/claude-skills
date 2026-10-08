import { describe, expect, test } from 'claude-code/testing'

import { DEFAULT_CONFIG, check, parseConfig, resolvePath, segments } from './rules'
import type { Context } from './rules'

const HOME = '/Users/a'
const REPO = `${HOME}/code/app`
const BLOCKED = 'old@work.example'
const CONFIG = parseConfig(JSON.stringify({
  blockedCommitEmails: [BLOCKED],
  commitEmail: 'me@example.com',
  pushAllowed: ['me/dotfiles'],
}))

function ctx(over: Partial<Context> = {}): Context {
  return {
    config: CONFIG,
    home: HOME,
    cwd: REPO,
    lastPrompt: 'fix the login bug',
    gitEmail: async () => 'me@example.com\n',
    gitRemotes: async () => ['git@github.com:me/app.git'],
    conflictFiles: async () => [],
    ...over,
  }
}

const blocked = async (cmd: string, over?: Partial<Context>) => (await check(cmd, ctx(over))) !== null

describe('parsing', () => {
  test('splits on && ; | and keeps quoted words whole', async () => {
    expect(segments('cd "my dir" && git push; echo a|wc')).toEqual([['cd', 'my dir'], ['git', 'push'], ['echo', 'a'], ['wc']])
  })
  test('resolves ~, $HOME and ..', async () => {
    expect(resolvePath('/x/y', '../z', HOME)).toBe('/x/z')
    expect(resolvePath('/x', '~/q', HOME)).toBe(`${HOME}/q`)
    expect(resolvePath('/x', '$HOME', HOME)).toBe(HOME)
  })
})

describe('pkill node', () => {
  test('blocks the blanket kill', async () => {
    expect(await blocked('pkill node')).toBe(true)
    expect(await blocked('killall node')).toBe(true)
    expect(await blocked('sudo pkill -9 node')).toBe(true)
  })
  test('allows a matched dev-server pattern', async () => {
    expect(await blocked('pkill -f "next dev"')).toBe(false)
    expect(await blocked('pkill -f react-native-devtools')).toBe(false)
  })
})

describe('git push', () => {
  test('blocks a push nobody asked for', async () => {
    expect(await blocked('git push origin main')).toBe(true)
    expect(await blocked('cd ../other && git push')).toBe(true)
  })
  test('allows it once the prompt says push', async () => {
    expect(await blocked('git push', { lastPrompt: 'looks good, push it' })).toBe(false)
  })
  test('allows the repos listed in pushAllowed', async () => {
    expect(await blocked('git push', { gitRemotes: async () => ['git@github.com:me/dotfiles.git'] })).toBe(false)
  })
  test('blocks every push with the default config', async () => {
    expect(await blocked('git push', { config: DEFAULT_CONFIG, gitRemotes: async () => ['git@github.com:me/dotfiles.git'] })).toBe(true)
  })
  test('does not mistake git -C for a commit flag', async () => {
    expect(await blocked(`git -C ${REPO} status`)).toBe(false)
  })
})

describe('git commit', () => {
  test('blocks the retired identity', async () => {
    expect(await blocked('git commit -m x', { gitEmail: async () => `${BLOCKED}\n` })).toBe(true)
    expect(await blocked(`git -c user.email=${BLOCKED} commit -m x`)).toBe(true)
    expect(await blocked('git commit -m x', { config: DEFAULT_CONFIG, gitEmail: async () => `${BLOCKED}\n` })).toBe(false)
  })
  test('blocks conflict markers', async () => {
    expect(await blocked('git add -A && git commit -m x', { conflictFiles: async () => ['src/strings.ts'] })).toBe(true)
  })
  test('allows a clean commit', async () => {
    expect(await blocked('git add -A && git commit -m "fix"')).toBe(false)
  })
})

describe('docker', () => {
  test('blocks volume wipes', async () => {
    expect(await blocked('docker system prune -a')).toBe(true)
    expect(await blocked('docker volume rm pgdata')).toBe(true)
    expect(await blocked('docker volume prune -f')).toBe(true)
  })
  test('allows stopping and plain image prune', async () => {
    expect(await blocked('docker stop $(docker ps -q)')).toBe(false)
    expect(await blocked('docker image prune -f')).toBe(false)
  })
})

describe('rm -rf', () => {
  test('allows build folders inside a project and temp dirs', async () => {
    expect(await blocked('rm -rf node_modules .next')).toBe(false)
    expect(await blocked('rm -rf apps/web/.next')).toBe(false)
    expect(await blocked('rm -rf /tmp/build-123')).toBe(false)
  })
  test('blocks home, project roots and anything outside', async () => {
    expect(await blocked('rm -rf ~')).toBe(true)
    expect(await blocked('rm -rf /')).toBe(true)
    expect(await blocked('rm -rf ..')).toBe(true)
    expect(await blocked(`rm -rf ${HOME}/code/app`)).toBe(true)
    expect(await blocked('rm -rf ~/Documents')).toBe(true)
    expect(await blocked('rm -rf "$DIR/out"')).toBe(true)
  })
  test('ignores rm without both -r and -f', async () => {
    expect(await blocked('rm ~/notes.txt')).toBe(false)
  })
})

describe('config', () => {
  test('falls back to defaults on bad JSON or wrong types', async () => {
    expect(parseConfig('{nope')).toEqual(DEFAULT_CONFIG)
    expect(parseConfig(JSON.stringify({ pushAllowed: 'x' })).pushAllowed).toEqual([])
  })
  test('custom project depth', async () => {
    const config = parseConfig(JSON.stringify({ projectRoots: [{ path: '~/Desktop/Projects', depth: 2 }] }))
    expect(await blocked(`rm -rf ${HOME}/Desktop/Projects/work/app`, { config })).toBe(true)
    expect(await blocked(`rm -rf ${HOME}/Desktop/Projects/work/app/node_modules`, { config })).toBe(false)
  })
})
