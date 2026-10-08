export type Section = { id: string; text: string; scope: 'shared' | 'session' }

/** The section text: global rules first, then the project's, each labelled with where it applies. */
export function learningsText(global: string | null, project: string | null, projectPath: string): string | null {
  const parts: string[] = []
  if (global?.trim()) parts.push(`# Global corrections (~/.claude/LEARNINGS.md) — these apply in EVERY project\n\n${global.trim()}`)
  if (project?.trim()) parts.push(`# Corrections for this project (${projectPath})\n\n${project.trim()}`)
  if (!parts.length) return null
  return `These are standing instructions from the user, recorded from past corrections. Follow them without being asked again.\n\n${parts.join('\n\n')}`
}

/** Main-loop requests offer the Agent tool; subagents' don't, and skip the ~9k tokens. */
export function isMainLoop(tools: readonly string[]): boolean {
  return tools.includes('Agent')
}

/** Adds the section last (a session section may follow every shared one), replacing an older copy. */
export function withLearnings(sections: readonly Section[], text: string): Section[] {
  return [...sections.filter(s => s.id !== 'learnings'), { id: 'learnings', text, scope: 'session' }]
}
