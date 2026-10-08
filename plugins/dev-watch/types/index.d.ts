export type Item = {
  /** Stable id, used to tell whether the set of running things changed. */
  id: string
  /** What the band shows, e.g. "Docker (3 containers)". */
  label: string
  kind: 'docker' | 'simulator' | 'emulator' | 'server'
  /** Process ids to stop (servers, emulators); container ids for Docker. */
  ids: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'dev-watch': {
      running: Item[]
      /** Signature of the set the person chose to keep running; the band hides until it changes. */
      kept: string | null
      stopping: boolean
    }
  }
}
