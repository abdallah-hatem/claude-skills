import { expect, test } from 'claude-code/testing'

import { parseServers } from './scan'
import { toWindows } from './win'

test('pgrep and pkill become one Win32_Process query, the pattern passed in env', async () => {
  const fl = toWindows(['pgrep', '-fl', 'next dev|vite'])
  expect(fl?.argv[0]).toBe('powershell.exe')
  expect(fl?.env).toMatchObject({ DW_MODE: 'long', DW_PAT: 'next dev|vite' })
  expect(toWindows(['pgrep', '-f', 'qemu-system'])?.env?.DW_MODE).toBe('ids')
  expect(toWindows(['pgrep', '-x', 'alacritty'])?.env?.DW_MODE).toBe('name')
  expect(toWindows(['pkill', '-9', '-f', 'com.docker'])?.env?.DW_MODE).toBe('killp')
  expect(toWindows(['pkill', '-9', '-x', 'Hyper'])?.env?.DW_MODE).toBe('killn')
})

test('the macOS Docker Desktop pattern is swapped for its Windows process names', async () => {
  const call = toWindows(['pgrep', '-f', 'Docker.app/Contents/MacOS/com.docker.backend|Docker Desktop.app'])
  expect(call?.env?.DW_PAT).toContain('Docker Desktop\\.exe')
  expect(call?.env?.DW_PAT).not.toContain('.app')
})

test('kill is a polite taskkill, kill -9 a forced one, both over the whole tree', async () => {
  expect(toWindows(['kill', '12', '34'])?.argv).toEqual(['taskkill', '/T', '/PID', '12', '/PID', '34'])
  expect(toWindows(['kill', '-9', '12'])?.argv).toEqual(['taskkill', '/T', '/F', '/PID', '12'])
  expect(toWindows(['kill'])).toBe(null)
})

test('macOS-only tools read as nothing running, docker loses its Homebrew path', async () => {
  expect(toWindows(['lsof', '-a', '-p', '1', '-d', 'cwd', '-Fn'])).toBe(null)
  expect(toWindows(['xcrun', 'simctl', 'list', 'devices', 'booted'])).toBe(null)
  expect(toWindows(['/usr/local/bin/docker', 'ps', '-q'])?.argv).toEqual(['docker', 'ps', '-q'])
})

test('Claude’s own processes are left out on Windows paths too', async () => {
  const out = [
    '7388 C:\\nvm4w\\nodejs\\node.exe C:\\proj\\node_modules\\vite\\bin\\vite.js',
    '5000 node C:\\Users\\a\\.claude\\plugins\\x\\vite-mcp\\index.js',
    '5001 C:\\Users\\a\\AppData\\Local\\AnthropicClaude\\claude.exe --metro',
  ].join('\n')
  expect(parseServers(out)).toEqual([{ pid: '7388', label: 'Vite' }])
})
