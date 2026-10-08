/** Personal settings, read from ~/.claude/safe-guard.json; every field optional. */
export type Config = {
  /** Git identities never to commit as (e.g. a retired work email). */
  blockedCommitEmails: string[]
  /** The email to suggest instead, in the block message. */
  commitEmail: string | null
  /** Remote URL fragments where pushing needs no go-ahead (e.g. your backup repo). */
  pushAllowed: string[]
  /** Folders holding projects, and how many levels down each project root sits (1: ~/code/app, 2: ~/Projects/group/app). rm -rf must stay inside a project. */
  projectRoots: { path: string; depth: number }[]
}

export const DEFAULT_CONFIG: Config = {
  blockedCommitEmails: [],
  commitEmail: null,
  pushAllowed: [],
  projectRoots: ['~/Desktop/Projects', '~/Projects', '~/projects', '~/code', '~/dev', '~/src'].map(path => ({ path, depth: 1 })),
}

/** Merges a parsed safe-guard.json over the defaults, ignoring fields of the wrong type. */
export function parseConfig(json: string | null): Config {
  if (!json) return DEFAULT_CONFIG
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(json) as Record<string, unknown>
  } catch {
    return DEFAULT_CONFIG
  }
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null)
  const roots = Array.isArray(raw.projectRoots)
    ? raw.projectRoots.flatMap(r =>
        r && typeof r === 'object' && typeof (r as { path?: unknown }).path === 'string'
          ? [{ path: (r as { path: string }).path, depth: Number((r as { depth?: unknown }).depth) || 1 }]
          : [],
      )
    : null
  return {
    blockedCommitEmails: strings(raw.blockedCommitEmails) ?? DEFAULT_CONFIG.blockedCommitEmails,
    commitEmail: typeof raw.commitEmail === 'string' ? raw.commitEmail : DEFAULT_CONFIG.commitEmail,
    pushAllowed: strings(raw.pushAllowed) ?? DEFAULT_CONFIG.pushAllowed,
    projectRoots: roots ?? DEFAULT_CONFIG.projectRoots,
  }
}

/** What the rules need from the host, looked up only when a rule needs it. */
export type Context = {
  config: Config
  home: string
  /** The session's working directory. */
  cwd: string
  /** The person's latest prompt in this session. */
  lastPrompt: string
  /** `git config user.email` in `dir`. */
  gitEmail: (dir: string) => Promise<string>
  /** Every remote URL of the repo in `dir`. */
  gitRemotes: (dir: string) => Promise<string[]>
  /** Tracked files in `dir` that hold conflict markers. */
  conflictFiles: (dir: string) => Promise<string[]>
}

/** Splits a command line into its simple commands (on && || ; | and newlines), each into words. */
export function segments(command: string): string[][] {
  const out: string[][] = []
  let words: string[] = []
  let word = ''
  let quote: '"' | "'" | null = null
  let hasWord = false
  const endWord = () => {
    if (hasWord) words.push(word)
    word = ''
    hasWord = false
  }
  const endSegment = () => {
    endWord()
    if (words.length) out.push(words)
    words = []
  }
  for (let i = 0; i < command.length; i++) {
    const c = command[i] as string
    if (quote) {
      if (c === quote) quote = null
      else word += c
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      hasWord = true
    } else if (c === '\\' && i + 1 < command.length) {
      word += command[++i]
      hasWord = true
    } else if (c === ' ' || c === '\t') endWord()
    else if (c === '\n' || c === ';' || c === '|' || c === '&' || c === '(' || c === ')') endSegment()
    else {
      word += c
      hasWord = true
    }
  }
  endSegment()
  return out
}

/** Joins a path onto a directory, folding `.` and `..`, expanding `~` and `$HOME`. */
export function resolvePath(dir: string, path: string, home: string): string {
  let p = path.replace(/^(~|\$HOME|\$\{HOME\})(?=\/|$)/, home)
  if (!p.startsWith('/')) p = `${dir}/${p}`
  const parts: string[] = []
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return '/' + parts.join('/')
}

/** Drops leading `VAR=value` assignments and `sudo`/`env`/`command` wrappers. */
function program(words: string[]): string[] {
  let i = 0
  while (i < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i] as string) || ['sudo', 'env', 'command', 'exec', 'nohup'].includes(words[i] as string))) i++
  return words.slice(i)
}

/** A git invocation: its directory (from `-C`) and its subcommand words. */
function gitCall(words: string[], dir: string, home: string): { dir: string; args: string[] } | null {
  if (words[0] !== 'git') return null
  let i = 1
  let d = dir
  while (i < words.length && (words[i] as string).startsWith('-')) {
    const flag = words[i] as string
    if (flag === '-C' && i + 1 < words.length) {
      d = resolvePath(d, words[i + 1] as string, home)
      i += 2
    } else if (flag === '-c' && i + 1 < words.length) i += 2
    else i += 1
  }
  return { dir: d, args: words.slice(i) }
}

const TEMP_ROOTS = ['/tmp/', '/private/tmp/', '/private/var/folders/', '/var/folders/']

/** Whether `rm -rf` may delete this absolute path without asking. */
export function rmAllowed(abs: string, home: string, roots: Config['projectRoots'] = DEFAULT_CONFIG.projectRoots): boolean {
  if (TEMP_ROOTS.some(r => abs.startsWith(r) && abs.length > r.length)) return true
  for (const root of roots) {
    const base = resolvePath('/', root.path, home) + '/'
    // Inside a project, never a project root (or a group folder above it).
    if (abs.startsWith(base)) return abs.slice(base.length).split('/').length > root.depth
  }
  return [`${home}/.claude/dev-mods/`, `${home}/Library/Caches/`, `${home}/Library/Application Support/Claude/scratch-workspaces/`].some(
    r => abs.startsWith(r) && abs.length > r.length,
  )
}

function rmReason(words: string[], dir: string, home: string, roots: Config['projectRoots']): string | null {
  const flags = words.filter(w => w.startsWith('-')).join('')
  const isRecursive = /-[a-zA-Z]*[rR]|--recursive/.test(flags)
  const isForce = /-[a-zA-Z]*f|--force/.test(flags)
  if (!isRecursive || !isForce) return null
  for (const target of words.slice(1).filter(w => !w.startsWith('-'))) {
    if (/\$(?!HOME\b|\{HOME\})/.test(target)) return `rm -rf on "${target}": a variable that may be empty or unexpected`
    if (target === '*' || target.startsWith('/*')) return `rm -rf ${target}: a wildcard at the top of a folder`
    const abs = resolvePath(dir, target, home)
    if (!rmAllowed(abs, home, roots)) return `rm -rf ${abs}: outside a project or temp folder`
  }
  return null
}

/** Why this command is blocked, or null when it may run. */
export async function check(command: string, ctx: Context): Promise<string | null> {
  let dir = ctx.cwd
  const asksToPush = /\bpush/i.test(ctx.lastPrompt)

  for (const raw of segments(command)) {
    const words = program(raw)
    const [cmd] = words
    if (!cmd) continue

    if (cmd === 'cd' && words[1]) {
      dir = resolvePath(dir, words[1], ctx.home)
      continue
    }

    if ((cmd === 'pkill' || cmd === 'killall') && words.slice(1).some(w => /^node$/i.test(w))) {
      return `${cmd} node kills the Claude session and its MCP servers. Match the dev server's pattern instead (e.g. pkill -f "next dev").`
    }

    if (cmd === 'docker') {
      const rest = words.slice(1).join(' ')
      if (/^(system|volume) prune\b|^volume rm\b|^system prune\b/.test(rest) || (/^(image|container|network|builder) prune\b/.test(rest) && /(^| )(-a|--all|--volumes)\b/.test(rest))) {
        return `docker ${rest} deletes data (database volumes) across every project. Stop containers with docker stop instead.`
      }
    }

    if (cmd === 'rm') {
      const reason = rmReason(words, dir, ctx.home, ctx.config.projectRoots)
      if (reason) return `${reason}. Ask the user before deleting it.`
    }

    const git = gitCall(words, dir, ctx.home)
    if (!git) continue
    const [sub] = git.args

    if (sub === 'push' && !asksToPush) {
      const remotes = await ctx.gitRemotes(git.dir)
      const isAllowed = (url: string) => ctx.config.pushAllowed.some(fragment => url.includes(fragment))
      if (!remotes.length || !remotes.every(isAllowed)) {
        return 'git push needs the user\'s explicit go-ahead. Ask them; once their message says "push", it is allowed.'
      }
    }

    if (sub === 'commit') {
      const blocked = ctx.config.blockedCommitEmails
      if (blocked.length) {
        const email = blocked.find(b => command.includes(b)) ?? (await ctx.gitEmail(git.dir)).trim()
        if (blocked.includes(email)) {
          const fix = ctx.config.commitEmail ? ` Run git config user.email ${ctx.config.commitEmail} in this repo first.` : ' Set the right git user.email in this repo first.'
          return `git commit would be authored as ${email}, an identity you blocked.${fix}`
        }
      }
      const conflicted = await ctx.conflictFiles(git.dir)
      if (conflicted.length) {
        return `git commit with conflict markers still in: ${conflicted.slice(0, 5).join(', ')}. Resolve them first.`
      }
    }
  }
  return null
}
