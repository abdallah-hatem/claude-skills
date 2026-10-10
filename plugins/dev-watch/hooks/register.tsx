import type { EngineInterface, Register } from 'claude-code'

import type { Item } from '../types'
import {
  SERVER_PATTERN,
  dockerItem,
  groupServers,
  parseCwd,
  parseServers,
  parseSimulators,
  signature,
} from './scan'

const RUNNING = { plugin: 'dev-watch', key: 'running' } as const
const KEPT = { plugin: 'dev-watch', key: 'kept' } as const
const STOPPING = { plugin: 'dev-watch', key: 'stopping' } as const
const TASKS_OPEN = { plugin: 'dev-watch', key: 'tasksOpen' } as const

const DOCKER = '/usr/local/bin/docker'

/** Runs a host command; any failure (not installed, timed out) reads as no output. */
async function sh($: EngineInterface, argv: string[], timeoutMs = 10_000): Promise<string> {
  try {
    const r = await $.process.run(argv, { timeoutMs })
    return r.stdout
  } catch {
    return ''
  }
}

/** A macOS notification with a sound: the Code tab doesn't show a mod's toasts. */
async function notify($: EngineInterface, text: string, sound: string): Promise<void> {
  const quoted = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  try {
    await $.process.run(['osascript', '-e', `display notification "${quoted}" with title "Claude Code" sound name "${sound}"`], { timeoutMs: 5_000 })
  } catch {
    // No notification is better than a failed hook.
  }
}

async function scan($: EngineInterface): Promise<Item[]> {
  const [dockerUp, sims, emu, servers] = await Promise.all([
    sh($, ['pgrep', '-f', 'Docker.app/Contents/MacOS/com.docker.backend|Docker Desktop.app']),
    sh($, ['xcrun', 'simctl', 'list', 'devices', 'booted']),
    sh($, ['pgrep', '-f', 'qemu-system']),
    sh($, ['pgrep', '-fl', SERVER_PATTERN]),
  ])

  const items: Item[] = []
  if (dockerUp.trim()) items.push(dockerItem(await sh($, [DOCKER, 'ps', '--format', '{{.ID}}'], 5_000)))
  items.push(...parseSimulators(sims))
  const emuPids = emu.split('\n').map(s => s.trim()).filter(Boolean)
  if (emuPids.length) items.push({ id: 'emulator', kind: 'emulator', label: 'Android emulator', ids: emuPids })

  const procs = await Promise.all(
    parseServers(servers).map(async p => ({
      ...p,
      cwd: parseCwd(await sh($, ['lsof', '-a', '-p', p.pid, '-d', 'cwd', '-Fn'], 5_000)),
    })),
  )
  items.push(...groupServers(procs))
  return items
}

let scanning: Promise<void> | null = null

/** Rescans, one scan at a time; a call made while one runs waits for it. */
function refresh($: EngineInterface): Promise<void> {
  scanning ??= rescan($)
  return scanning
}

async function rescan($: EngineInterface): Promise<void> {
  try {
    const items = await scan($)
    await $.state.set(RUNNING, items)
  } finally {
    scanning = null
  }
}

async function stopAll($: EngineInterface) {
  const { value: items = [] } = await $.state.get(RUNNING)
  const pids = items.filter(i => i.kind === 'server' || i.kind === 'emulator').flatMap(i => i.ids)

  if (pids.length) await sh($, ['kill', ...pids])
  await sh($, ['pkill', '-f', 'react-native-devtools'])
  await sh($, ['pkill', '-f', 'React Native DevTools'])

  if (items.some(i => i.kind === 'simulator')) {
    await sh($, ['xcrun', 'simctl', 'shutdown', 'all'], 60_000)
    await sh($, ['pkill', '-x', 'Simulator'])
  }

  const docker = items.find(i => i.kind === 'docker')
  if (docker) {
    if (docker.ids.length) await sh($, [DOCKER, 'stop', ...docker.ids], 90_000)
    // A graceful quit of Docker Desktop hangs; force-quit it.
    await sh($, ['pkill', '-9', '-f', 'Docker Desktop'])
    await sh($, ['pkill', '-9', '-f', 'com.docker'])
  }

  // Anything that ignored SIGTERM gets SIGKILL.
  if (pids.length) {
    await $.clock.sleep(2_000)
    await sh($, ['kill', '-9', ...pids])
  }
}

/** Terminal apps "stop dev" force-closes, by process name. */
const TERMINALS = ['Terminal', 'iTerm2', 'Warp', 'stable', 'ghostty', 'Ghostty', 'alacritty', 'Alacritty', 'kitty', 'wezterm-gui', 'Hyper', 'Tabby']

/** CoreSimulator services that outlive simctl shutdown; launchd respawns them, so one kill is enough. */
const SIM_SERVICES = ['com.apple.CoreSimulator.CoreSimulatorService', 'simdiskimaged', 'SimLaunchHost', 'SimStreamProcessorService', 'SimAudioProcessorService']

/** The full "stop dev" teardown, whatever was found running. Returns what it stopped. */
async function stopEverything($: EngineInterface): Promise<string[]> {
  const stopped: string[] = []

  const servers = parseServers(await sh($, ['pgrep', '-fl', SERVER_PATTERN]))
  const emu = (await sh($, ['pgrep', '-f', 'qemu-system'])).split('\n').map(s => s.trim()).filter(Boolean)
  const pids = [...servers.map(p => p.pid), ...emu]
  if (servers.length) stopped.push(...new Set(servers.map(p => p.label)))
  if (emu.length) stopped.push('Android emulator')
  if (pids.length) await sh($, ['kill', ...pids])
  await sh($, ['pkill', '-f', 'react-native-devtools'])
  await sh($, ['pkill', '-f', 'React Native DevTools'])

  if (parseSimulators(await sh($, ['xcrun', 'simctl', 'list', 'devices', 'booted'])).length) stopped.push('simulators')
  await sh($, ['xcrun', 'simctl', 'shutdown', 'all'], 60_000)
  await sh($, ['pkill', '-x', 'Simulator'])
  for (const svc of SIM_SERVICES) await sh($, ['pkill', '-f', svc])

  if ((await sh($, ['pgrep', '-f', 'Docker.app/Contents/MacOS/com.docker.backend|Docker Desktop.app'])).trim()) {
    const ids = (await sh($, [DOCKER, 'ps', '-q'], 5_000)).split('\n').map(s => s.trim()).filter(Boolean)
    if (ids.length) await sh($, [DOCKER, 'stop', ...ids], 90_000)
    await sh($, ['pkill', '-9', '-f', 'Docker Desktop'])
    await sh($, ['pkill', '-9', '-f', 'com.docker'])
    stopped.push(ids.length ? `Docker (${ids.length} containers)` : 'Docker Desktop')
  }

  for (const app of TERMINALS) {
    if ((await sh($, ['pgrep', '-x', app])).trim()) {
      await sh($, ['pkill', '-9', '-x', app])
      stopped.push(app === 'stable' ? 'Warp' : app)
    }
  }

  if (pids.length) {
    await $.clock.sleep(2_000)
    await sh($, ['kill', '-9', ...pids])
  }
  return stopped
}

/** Opens the desktop app's background-tasks pane, or closes it when it is already open. */
async function toggleTasks($: EngineInterface): Promise<void> {
  const layout = await $.tool.call({ tool: 'mcp__ccd_view__get_layout' })
  const raw = 'text' in layout && typeof layout.text === 'string' ? layout.text : JSON.stringify('result' in layout ? layout.result : {})
  const isOpen = /"open_panes"\s*:\s*\[[^\]]*"tasks"/.test(raw)
  if (isOpen) await $.tool.call({ tool: 'mcp__ccd_view__close_pane', pane: 'tasks' })
  else await $.tool.call({ tool: 'mcp__ccd_view__show_pane', pane: 'tasks' })
  await $.state.set(TASKS_OPEN, !isOpen)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({
      name: 'stopdev',
      description: 'Stop all dev tools: servers, Metro, simulators, emulator, Docker, terminal apps',
    })
    void refresh($)
    return result
  })

  on('command.run', { command: 'stopdev' }, async $ => {
    $.ui.toast('Stopping dev tools…')
    const stopped = await stopEverything($)
    await refresh($)
    const { value: left = [] } = await $.state.get(RUNNING)
    const summary = stopped.length ? `Stopped: ${stopped.join(', ')}.` : 'Nothing was running.'
    const rest = left.length ? ` Still up: ${left.map(i => i.label).join(', ')}.` : ''
    $.ui.toast(left.length ? 'Some dev tools are still up' : 'Dev tools stopped')
    void notify($, summary + rest, left.length ? 'Basso' : 'Glass')
    return { text: summary + rest }
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    void refresh($)
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Other plugins' bands (burn-meter) draw beneath; keep them.
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const { value: items = [] } = await $.state.get(RUNNING)
    const { value: isStopping = false } = await $.state.get(STOPPING)
    const { value: keptSig = null } = await $.state.get(KEPT)
    const { value: tasksOpen = false } = await $.state.get(TASKS_OPEN)

    const showRunning = items.length > 0 && (isStopping || keptSig !== signature(items))
    // The tasks pane is the desktop app's; the terminal has no such pane.
    const showTasks = e.surface !== 'terminal'
    if (!showRunning && !showTasks) return below

    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {showRunning ? (
          <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
            <Text>
              <Text color="yellow" bold>
                Still running:{' '}
              </Text>
              {items.map(i => i.label).join(' · ')}
            </Text>
            <Box flexDirection="row" columnGap={1}>
              <Button
                key="stop"
                label={isStopping ? 'Stopping…' : 'Stop all'}
                variant="primary"
                hotkey="s"
                onPress={async () => {
                  if ((await $.state.get(STOPPING)).value) return
                  await $.state.set(STOPPING, true)
                  const { value: before = [] } = await $.state.get(RUNNING)
                  try {
                    await stopAll($)
                    await refresh($)
                  } finally {
                    await $.state.set(STOPPING, false)
                  }
                  const { value: left = [] } = await $.state.get(RUNNING)
                  const done =
                    left.length === 0
                      ? `Stopped ${before.length} thing${before.length === 1 ? '' : 's'}`
                      : `Still up: ${left.map(i => i.label).join(', ')}`
                  $.ui.toast(done)
                  void notify($, done, left.length ? 'Basso' : 'Glass')
                }}
              />
              <Button
                key="keep"
                label="Keep running"
                hotkey="k"
                onPress={async () => {
                  const { value: now = [] } = await $.state.get(RUNNING)
                  await $.state.set(KEPT, signature(now))
                }}
              />
            </Box>
          </Box>
        ) : null}
        {showTasks ? (
          <Box flexDirection="row">
            <Button
              key="tasks"
              label={tasksOpen ? 'Hide background tasks' : 'Background tasks'}
              hotkey="t"
              onPress={async () => {
                try {
                  await toggleTasks($)
                } catch {
                  $.ui.toast('Could not toggle the tasks pane')
                }
              }}
            />
          </Box>
        ) : null}
        {below}
      </Box>
    )
  })
}
