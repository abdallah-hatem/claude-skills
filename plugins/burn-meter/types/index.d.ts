export type Level = 'easy' | 'normal' | 'heavy'

declare module 'claude-code' {
  interface PluginState {
    'burn-meter': {
      /** The script's line, colour codes stripped; null when there is nothing to show. */
      line: string | null
      level: Level | null
    }
  }
}
