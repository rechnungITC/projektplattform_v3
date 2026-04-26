# Claude Code — Project Skills

Project-local skill templates for recurring Claude tasks in this repository.

| Skill | Use when |
|---|---|
| [architecture-review.md](architecture-review.md) | reviewing a proposed architectural change against target-picture & principles |
| [software-architect.md](software-architect.md) | *designing* architecture (recommend, trade-offs, next steps) — the active counterpart to `architecture-review.md` |
| [bug-analysis.md](bug-analysis.md) | structured triage of a bug report |
| [code-review.md](code-review.md) | reviewing a pull request or diff |
| [coding-standards.md](coding-standards.md) | active coding guard: rules I must hold myself to while writing code |
| [documentation-writer.md](documentation-writer.md) | writing or updating project documentation |
| [prompt-templates.md](prompt-templates.md) | reusable prompt patterns for recurring tasks |
| [story-writing.md](story-writing.md) | authoring a user story with acceptance criteria |

## Scope

These skills are **project-local** (live with the repo). Personal or global skills go into `~/.claude/skills/`.

## Verhältnis zu `references/coding-standards/`

`coding-standards.md` ist die **Instruktion**, wie Claude arbeitet.
`references/coding-standards/*.md` ist die **inhaltliche Referenz** (Prinzipien, Teststrategie, Refactoring-Ziel). Neue Standards werden in `references/coding-standards/` gepflegt; das Skill verweist per Link, damit es nicht divergiert.

## Verhältnis zu Compliance-Automatik

`software-architect.md` und `coding-standards.md` verlangen beide, dass bei neuen Stories / Arbeitspaketen geprüft wird, ob Compliance- oder Prozess-Tags (`iso-9001`, `dsgvo`, `microsoft-365-intro`, `vendor-evaluation`, `change-management`, …) anhängen. Wenn ja, greift der `ComplianceTrigger`-Pfad aus [`EP-16`](../../planning/epics/ep-16-compliance-automatik.md) und die zugehörigen Folgeinkremente entstehen *mit* dem Feature, nicht erst am Projektende.
