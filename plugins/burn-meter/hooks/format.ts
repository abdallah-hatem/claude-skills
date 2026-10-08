import type { Level } from '../types'

/** "21:00" → "9:00 PM", "00:30" → "12:30 AM". */
export function to12h(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  const suffix = h < 12 ? 'AM' : 'PM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`
}

/** Strips colour codes and whitespace from the script's line and shows times in 12-hour form; empty output clears the band. */
export function formatStatus(out: string): string | undefined {
  const line = out.replace(/\u001b\[[0-9;]*m/g, '').trim().split('\n')[0]?.trim()
  return line ? line.replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g, t => to12h(t)) : undefined
}

/** The script's verdict word ("easy", "normal", "HEAVY") as a level. */
export function levelOf(line: string): Level | null {
  const m = line.match(/\b(easy|normal|HEAVY)\b/)
  return m ? (m[1]?.toLowerCase() as Level) : null
}
