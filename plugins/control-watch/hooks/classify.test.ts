import { describe, expect, test } from 'claude-code/testing'

import { classify } from './classify'

describe('browsers', () => {
  test('your Chrome, with the site', async () => {
    expect(classify('mcp__claude-in-chrome__navigate', { url: 'https://www.linkedin.com/jobs/' })).toEqual({ key: 'chrome', label: 'Your Chrome', detail: 'www.linkedin.com', isYours: true })
  })
  test('batched and prefixed tool names count too', async () => {
    expect(classify('mcp__claude-in-chrome__browser_batch', {})?.key).toBe('chrome')
    expect(classify('mcp__remote-devices__Claude_Browser__navigate', { url: 'http://localhost:3000' })?.detail).toBe('localhost:3000')
  })
  test('built-in browser is not yours', async () => {
    expect(classify('mcp__Claude_Browser__computer', { action: 'left_click' })?.isYours).toBe(false)
  })
})

describe('apps', () => {
  test('computer-use names the app', async () => {
    expect(classify('mcp__computer-use__app_click', { app: 'Finder' })?.label).toBe('Finder')
    expect(classify('mcp__computer-use__request_access', { apps: ['Notes', 'Maps'] })?.label).toBe('Notes, Maps')
    expect(classify('mcp__computer-use__computer_batch', {})?.label).toBe('Your screen')
  })
  test('open -a and osascript from Bash', async () => {
    expect(classify('Bash', { command: 'open -a "Docker Desktop"' })?.label).toBe('Docker Desktop')
    expect(classify('Bash', { command: 'open -t ~/.claude/settings.json' })?.label).toBe('Text editor')
    expect(classify('Bash', { command: "osascript -e 'tell app \"Finder\" to quit'" })?.key).toBe('applescript')
  })
})

describe('dev tools', () => {
  test('docker, simulator, emulator, playwright', async () => {
    expect(classify('Bash', { command: 'cd api && docker compose up -d' })?.label).toBe('Docker')
    expect(classify('Bash', { command: 'xcrun simctl boot "iPhone 16"' })?.label).toBe('iOS Simulator')
    expect(classify('mcp__Claude_Code_iOS_Simulator__control', { action: 'tap' })?.detail).toBe('tap')
    expect(classify('Bash', { command: 'adb shell input tap 10 10' })?.label).toBe('Android emulator')
    expect(classify('Bash', { command: 'npx playwright test' })?.label).toBe('Playwright browser')
  })
  test('simulators driven by build and run tools', async () => {
    expect(classify('Bash', { command: 'open -a Simulator' })?.key).toBe('ios-sim')
    expect(classify('Bash', { command: 'cd apps/mobile && npx expo run:ios --device "iPhone 16"' })?.key).toBe('ios-sim')
    expect(classify('Bash', { command: 'npx expo start --ios' })?.key).toBe('ios-sim')
    expect(classify('Bash', { command: 'npx react-native run-ios' })?.key).toBe('ios-sim')
    expect(classify('Bash', { command: 'xcodebuild -scheme App -destination "platform=iOS Simulator,name=iPhone 16" build' })?.key).toBe('ios-sim')
    expect(classify('Bash', { command: 'idb ui tap 100 200' })?.key).toBe('ios-sim')
    expect(classify('Bash', { command: 'npx expo run:android' })?.key).toBe('android')
    expect(classify('Bash', { command: 'emulator -avd Pixel_8' })?.key).toBe('android')
  })
  test('ordinary commands control nothing', async () => {
    expect(classify('Bash', { command: 'git status && npm test' })).toBeNull()
    expect(classify('Read', { file_path: '/x' })).toBeNull()
    expect(classify('Bash', { command: 'grep -r dockerfile .' })).toBeNull()
  })
})
