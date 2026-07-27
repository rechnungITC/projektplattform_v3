/**
 * PROJ-77-α — dependency-free line-level diff for the rollback confirm panel.
 *
 * Read-only display only (no patch-apply), so a compact LCS line diff is
 * proportional — we deliberately avoid a `diff-match-patch` dependency
 * (CIA NO-GO; supply-chain hygiene per PROJ-140).
 */

export type DiffOp = "added" | "removed" | "unchanged"

export interface DiffLine {
  op: DiffOp
  value: string
}

/**
 * Longest-common-subsequence line diff. Returns an ordered list of lines,
 * each tagged added (only in `next`), removed (only in `prev`), or unchanged.
 */
export function lineDiff(prev: string, next: string): DiffLine[] {
  const a = prev.length === 0 ? [] : prev.split("\n")
  const b = next.length === 0 ? [] : next.split("\n")
  const n = a.length
  const m = b.length

  // LCS length table.
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0)
  )
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  // Backtrack into an ordered diff.
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: "unchanged", value: a[i] })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ op: "removed", value: a[i] })
      i++
    } else {
      out.push({ op: "added", value: b[j] })
      j++
    }
  }
  while (i < n) out.push({ op: "removed", value: a[i++] })
  while (j < m) out.push({ op: "added", value: b[j++] })
  return out
}

/** Convenience counts for a summary line ("+3 −1"). */
export function diffStats(lines: DiffLine[]): {
  added: number
  removed: number
  unchanged: number
} {
  return {
    added: lines.filter((l) => l.op === "added").length,
    removed: lines.filter((l) => l.op === "removed").length,
    unchanged: lines.filter((l) => l.op === "unchanged").length,
  }
}
