# Decision Record — Skills Data Model & Authoring Format

**V3-original (no V2 heritage)** · Date: 2026-07-23 · Concerns: PROJ-76 (Skill-Framework Foundation), influences PROJ-77/78/82

**Input:** PROJ-76 spec · CIA review of dependency forks 2026-07-23 (GO Option B / GO Option B, zero new transitive surface).
**Status:** Accepted.

---

## Context

PROJ-76 introduces a tenant-managed catalog of "Skills" — Anthropic-Skill-shaped instruction documents (YAML frontmatter + Markdown body) that later drive AI behaviour (PROJ-82) and are auto-assigned to projects by method/type (PROJ-78). The spec left two dependency forks open:

1. **Authoring format:** raw Markdown-with-frontmatter parsed by `gray-matter`, vs. structured form fields serialised to a canonical `.md`.
2. **Editor:** `@uiw/react-md-editor`/a Markdown renderer, vs. a plain text area + tabs.

The repo has no Markdown parser, YAML parser (only a pinned `js-yaml` inside `overrides`), Markdown editor, or renderer. PROJ-140 just hardened the supply chain, so minimising transitive dependency surface is a live concern.

## Decision

**The structured metadata (JSON) is the source of truth. The `.md` string is generated, never parsed back.**

- Skill metadata (`name`, `description`, `category`, `method_tags`, `project_type_tags`, and behaviour keys `model_overrides`, `temperature`, `allowed_kinds`, `tone`) is authored via structured form fields (`react-hook-form` + Zod) and stored as structured columns + a `frontmatter` JSON column.
- The canonical `markdown_content` (`.md`: YAML frontmatter + `\n---\n` + body) is serialised **server-side, `js-yaml.dump()` only**, from that JSON. Nothing parses it back — PROJ-82 reads the JSON + body directly.
- The Markdown **body** is authored in a monospace text area (50,000-char cap). Preview = the raw serialised `.md` string via shadcn `Tabs`. No rendered-HTML preview in V1.
- **Tag vocabularies bind to the real code constants**, not the spec's aspirational lists: `method_tags ⊆ PROJECT_METHODS` (`scrum, kanban, safe, waterfall, pmi, prince2, vxt2`), `project_type_tags ⊆ ProjectType` (`erp, construction, software, general, ma`). Empty array = "applies to all". Validation is app-layer Zod against the imported constants (single source of truth) so the vocabulary cannot drift from the platform's actual methods/types.

### Rejected dependencies
| Dependency | Verdict | Reason |
|---|---|---|
| `gray-matter` | NO-GO | Re-introduces a parse path + its own YAML copy for data we never parse back. |
| `@uiw/react-md-editor` | NO-GO | Heavy remark/rehype tree for a rarely-used admin-only tool. |
| `react-markdown` / `marked` (+ DOMPurify) | NO-GO | Heavy tree or XSS-sanitising burden; PMs need no rendered body in V1. |
| `js-yaml` | ADJUST | Promote the already-pinned package from `overrides` to a declared direct dep; server-side `dump()` only. Zero new transitive surface. |

## Consequences

- **Positive:** Zero new transitive dependency surface. Additive extensibility for PROJ-77 (more fields → more Zod keys + JSON keys, no schema-in-YAML). PROJ-82 consumes JSON + body directly. Tag vocab cannot drift from real methods/types. Preview shows exactly what is stored/consumed.
- **Deviations from spec (recorded):** "parse with `gray-matter`" (AC 45–47) and "Frontmatter parsing fails → 422" (edge case) are dropped in favour of Zod field validation; the `@uiw/react-md-editor`-vs-custom choice resolves to custom; the tag value lists are replaced by the code-true vocabularies.
- **Requires:** a round-trip unit test proving JSON → `dump()` → `markdown_content` yields parseable YAML frontmatter (AC line 45 conformance).
- **Follow-ups (demand-gated PROJ-Y):** Skill import (paste a ready-made `.md` → parse — needs the parse path we avoided); rendered HTML preview.

See also: [skill-versioning.md](skill-versioning.md), [method-catalog.md](method-catalog.md), [project-type-catalog.md](project-type-catalog.md).
