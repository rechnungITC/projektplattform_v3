/**
 * PROJ-79-α — DMS slug + dedup helpers (pure, no I/O).
 *
 * `document_tree_nodes.slug` is a URL-safe kebab identifier derived from the
 * user-facing `name`. It is unique among live siblings (same parent) and,
 * for root folders, unique per project (enforced by two partial unique
 * indexes in the migration). We compute the slug in code and dedup the
 * *name* (append " (2)", " (3)", …) so the UI stays friendly while the slug
 * stays collision-free.
 *
 * NOTE: the existing `slugifyKey` in `workstream-dialog.tsx` produces an
 * underscore identifier constrained to `^[a-z][a-z0-9_]{1,40}$` for a
 * different domain (workstream_key). DMS slugs are kebab-case URL segments
 * with no leading-letter constraint, so this is a deliberately separate,
 * dependency-free helper rather than a reuse.
 */

/**
 * Derive a kebab-case, lowercase, URL-safe slug from an arbitrary name.
 * Non-alphanumeric runs collapse to a single hyphen; leading/trailing
 * hyphens are stripped; the result is capped at 200 chars. Falls back to
 * `"untitled"` when the input reduces to empty (e.g. only punctuation).
 */
export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    // ß has no NFKD decomposition; transliterate for a nicer slug.
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    // Drop combining diacritic marks left over from NFKD decomposition.
    .replace(/[̀-ͯ]/g, "")
    // Anything that isn't a-z / 0-9 becomes a hyphen boundary.
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200)
    // A trailing hyphen could survive the 200-char cut.
    .replace(/-+$/g, "")
  return slug.length > 0 ? slug : "untitled"
}

export interface DedupedName {
  name: string
  slug: string
}

/**
 * Given a desired base name and the set of slugs already in use among the
 * target sibling group (root or a folder), return a `{ name, slug }` pair
 * whose slug does not collide. If the base slug is free it is returned
 * unchanged; otherwise the name is suffixed with " (2)", " (3)", … until a
 * free slug is found.
 *
 * `existingSlugs` MUST exclude the node's own current slug when renaming in
 * place (otherwise a no-op rename would needlessly bump to " (2)").
 */
export function dedupeName(
  baseName: string,
  existingSlugs: Iterable<string>,
): DedupedName {
  const taken = new Set(existingSlugs)
  const trimmed = baseName.trim()
  const baseSlug = slugify(trimmed)
  if (!taken.has(baseSlug)) {
    return { name: trimmed, slug: baseSlug }
  }
  // Bump ` (2)`, ` (3)`, … — cap the loop defensively.
  for (let n = 2; n < 10_000; n++) {
    const candidateName = `${trimmed} (${n})`
    const candidateSlug = slugify(candidateName)
    if (!taken.has(candidateSlug)) {
      return { name: candidateName, slug: candidateSlug }
    }
  }
  // Practically unreachable; fall back to a timestamp-suffixed slug.
  const fallback = `${trimmed} (${Date.now()})`
  return { name: fallback, slug: slugify(fallback) }
}

/**
 * Dedup an uploaded filename within a target folder. Unlike `dedupeName`,
 * the " (2)" suffix is inserted BEFORE the extension so `report.pdf`
 * collisions become `report (2).pdf` (not `report.pdf (2)`). Returns the
 * resolved display `name` plus its `slug`.
 */
export function dedupeFilename(
  filename: string,
  existingSlugs: Iterable<string>,
): DedupedName {
  const taken = new Set(existingSlugs)
  const trimmed = filename.trim()
  const dot = trimmed.lastIndexOf(".")
  const hasExt = dot > 0 && dot < trimmed.length - 1
  const stem = hasExt ? trimmed.slice(0, dot) : trimmed
  const ext = hasExt ? trimmed.slice(dot) : "" // includes leading "."

  const baseSlug = slugify(trimmed)
  if (!taken.has(baseSlug)) {
    return { name: trimmed, slug: baseSlug }
  }
  for (let n = 2; n < 10_000; n++) {
    const candidateName = `${stem} (${n})${ext}`
    const candidateSlug = slugify(candidateName)
    if (!taken.has(candidateSlug)) {
      return { name: candidateName, slug: candidateSlug }
    }
  }
  const fallbackName = `${stem} (${Date.now()})${ext}`
  return { name: fallbackName, slug: slugify(fallbackName) }
}