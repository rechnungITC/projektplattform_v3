#!/usr/bin/env node
/**
 * PreToolUse hook: turns the PROJ-150 branch-collision guard from a prescribed command into an
 * enforced one.
 *
 * Why this exists: PROJ-150 shipped `npm run check:branch-collision`, but nothing made anyone run
 * it — D-150.2 said so plainly. On 2026-08-26 two sessions built PROJ-Y-45p in parallel because the
 * second read a commit-free branch as "not started"; a rule in CLAUDE.md was the only guard, and
 * PROJ-Y-130f had just finished showing what happens to rules nobody executes.
 *
 * Contract, deliberately fail-safe in three ways:
 *
 *   1. The decision travels on STDOUT as JSON. The exit code is always 0. If node crashes, the
 *      regex misfires, or the guard is missing, no JSON is emitted and the tool call proceeds. A
 *      hook that can break `git` for every session on this machine must not be able to fail closed.
 *   2. It only reacts to branch CREATION. Switching, listing, deleting and rebasing are untouched —
 *      blocking those would break every ordinary workflow and train people to disable the hook.
 *   3. The verdict is `deny`, with `BRANCH_COLLISION_GUARD=off` as the documented override.
 *
 *      This reverses the original design and the reversal was forced by a measurement, not taste.
 *      The first version used `ask`, reasoning that a collision is a judgement call and should go to
 *      the human — which also avoided a bypass flag that could leak into a model's context. In this
 *      repo that verdict is a no-op: `.claude/settings.local.json` carries `Bash(git *)` (plus
 *      `git branch *`, `git checkout *`, `git worktree *`, `git switch *`) on its allow list, so
 *      every git command is pre-approved and there is nothing left to ask about. Four attempts
 *      produced no interception — with the settings file verified correct, no `disableAllHooks`
 *      anywhere, and after a session restart.
 *
 *      `deny` is the only verdict a blanket allow rule cannot swallow. The cost is real and is not
 *      hidden: the human stops being the override, so the environment variable becomes the single
 *      way through. It is documented in CLAUDE.md rather than in the refusal message, so it does not
 *      travel into a model's context on every collision.
 *
 * Note on portability: every documented hook example pipes stdin through `jq`. This host has no
 * `jq` (verified), so the parsing is done in node — which also lets the command parser be unit
 * tested instead of living as an unreadable shell one-liner.
 */
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

/** Flags that make `git branch` do something other than create one. */
const BRANCH_NON_CREATING_FLAGS = new Set([
  "-d", "-D", "--delete", "-m", "-M", "--move", "-c", "-C", "--copy",
  "--list", "-l", "-a", "--all", "-r", "--remotes", "--merged", "--no-merged",
  "--contains", "--no-contains", "--show-current", "--format", "--sort",
  "-v", "-vv", "--verbose", "--edit-description", "--unset-upstream",
  "--set-upstream-to", "-u", "--points-at", "--column", "--no-column", "-h", "--help",
])

/** Flags whose VALUE is a newly created branch name. */
const CREATE_FLAGS = new Set(["-b", "-B", "-c", "-C", "--create", "--force-create"])

/**
 * Splits a shell line into command segments.
 *
 * Segment-aware rather than a free-form search over the whole string: `git log --grep="checkout -b"`
 * must not be read as a branch creation, and a real creation can sit after `cd x && `.
 */
export function splitSegments(command) {
  const segments = []
  let current = ""
  let quote = null
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]
    if (quote) {
      current += ch
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      current += ch
      continue
    }
    const two = command.slice(i, i + 2)
    if (two === "&&" || two === "||") {
      segments.push(current)
      current = ""
      i++
      continue
    }
    if (ch === ";" || ch === "|" || ch === "\n" || ch === "&") {
      segments.push(current)
      current = ""
      continue
    }
    current += ch
  }
  segments.push(current)
  return segments.map((s) => s.trim()).filter(Boolean)
}

/** Minimal quote-aware tokenizer — enough for git argument shapes. */
export function tokenize(segment) {
  const tokens = []
  let current = ""
  let quote = null
  let started = false
  for (const ch of segment) {
    if (quote) {
      if (ch === quote) quote = null
      else current += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      started = true
      continue
    }
    if (/\s/.test(ch)) {
      if (started || current) tokens.push(current)
      current = ""
      started = false
      continue
    }
    current += ch
  }
  if (started || current) tokens.push(current)
  return tokens
}

/**
 * Returns the branch name a command would CREATE, or null.
 *
 * Recognised: `git checkout -b|-B`, `git switch -c|-C|--create`, `git worktree add … -b|-B`, and
 * `git branch <name>` when no delete/list/move flag is present. `git worktree add <path> <branch>`
 * without a create flag checks out an EXISTING branch and is deliberately not a creation.
 */
export function detectBranchCreation(command) {
  if (typeof command !== "string" || !command.includes("git")) return null

  for (const segment of splitSegments(command)) {
    const tokens = tokenize(segment)
    // Skip leading `VAR=value` assignments and a bare `sudo`.
    let i = 0
    while (i < tokens.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i]) || tokens[i] === "sudo")) i++
    if (tokens[i] !== "git") continue

    const args = tokens.slice(i + 1)
    // Skip git's own global options (`-C <dir>`, `--no-pager`, …) to reach the subcommand.
    let j = 0
    while (j < args.length && args[j].startsWith("-")) {
      if (args[j] === "-C" || args[j] === "-c") j++
      j++
    }
    const sub = args[j]
    const rest = args.slice(j + 1)

    if (sub === "checkout" || sub === "switch") {
      const found = valueOfCreateFlag(rest)
      if (found) return found
      continue
    }

    if (sub === "worktree") {
      if (rest[0] !== "add") continue
      const found = valueOfCreateFlag(rest.slice(1))
      if (found) return found
      continue
    }

    if (sub === "branch") {
      if (rest.some((a) => BRANCH_NON_CREATING_FLAGS.has(a))) continue
      const positional = rest.find((a) => !a.startsWith("-"))
      if (positional) return positional
      continue
    }
  }
  return null
}

function valueOfCreateFlag(args) {
  for (let k = 0; k < args.length; k++) {
    if (!CREATE_FLAGS.has(args[k])) continue
    const value = args[k + 1]
    if (value && !value.startsWith("-")) return value
    return null
  }
  return null
}

/** Repo root derived from this file's own location — independent of cwd and of any env var. */
function repoRoot() {
  return resolve(dirname(dirname(dirname(fileURLToPath(import.meta.url)))))
}

function readStdin() {
  try {
    // fd 0 read synchronously: `require` is not available in an ESM module, and an earlier draft of
    // this function used it — which failed open, so the hook would have blocked nothing, silently.
    return readFileSync(0, "utf8")
  } catch {
    return ""
  }
}

function main() {
  if (process.env.BRANCH_COLLISION_GUARD === "off") return

  let command
  try {
    const payload = JSON.parse(readStdin() || "{}")
    command = payload?.tool_input?.command
  } catch {
    return // unparseable payload — say nothing, allow
  }

  const branch = detectBranchCreation(command)
  if (!branch) return

  const root = repoRoot()
  const guard = join(root, "scripts", "check-branch-collision", "index.ts")
  if (!existsSync(guard)) return // guard not in this checkout — allow

  const run = spawnSync("npx", ["tsx", guard, branch], {
    cwd: root,
    encoding: "utf8",
    timeout: 25_000,
  })

  // Only a definite "claimed" verdict (exit 1) stops anything. Exit 2 means the branch carries no
  // slice id; anything else means the guard could not answer.
  if (run.status !== 1) return

  const detail = String(run.stderr || "")
    .split("\n")
    .filter((l) => l.includes("::error::"))
    .map((l) => l.replace("::error::", "").trim())
    .join(" | ")

  process.stdout.write(JSON.stringify(buildRefusal(branch, detail)))
}

/**
 * The PreToolUse payload for a claimed slice.
 *
 * Exported so a test can pin `deny` — nothing else in the suite would notice a silent slide back to
 * `ask`, and `ask` is exactly the value this repo's allow list swallows.
 */
export function buildRefusal(branch, detail) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        `PROJ-150 branch-collision guard: "${branch}" belongs to a slice that already looks ` +
        `claimed. ${detail || "See npm run check:branch-collision."} ` +
        "Talk to the other lane before opening a second branch (PROJ-Y-45p, 2026-08-26). " +
        "If the claim is stale, say so and re-run deliberately.",
    },
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) main()
