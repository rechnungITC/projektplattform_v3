# PROJ-83: Task-driven Content Generation

## Status: Planned (geschnitten in α + β)
**Created:** 2026-06-06
**Last Updated:** 2026-09-01

> **Halb vorweggenommen.** Drei Bausteine, die diese Story neu bauen wollte, existieren:
> `generate_document` steht im ausgelieferten `allowed_actions`-Enum, `documents.ai_generated`
> **und** `ai_generated_metadata` legt PROJ-79-α an, und die Konversationsebene samt
> Skill-Steuerung, Kostendeckel und Class-3-Gate ist PROJ-151. Was fehlt, ist der **schreibende**
> Weg. Retrieval-Abhängiges wartet auf PROJ-80-β. Siehe Erdung 2026-09-01.

## Summary
Inside a task (work item), the PM can launch a "generate document" action that opens a chat-like dialog with the agent of the matching Skill (e.g. Datenschützer for a DSGVO assessment, IT-Security for a Betriebsrat-safety review, Controlling for a cost-structure draft). The agent produces a document that is stored back into the project DMS, linked to the originating task, and flagged AI-generated. Alternatively, the PM can choose "Export Prompt" → the same prompt assembly (skill + RAG context + task input) is rendered as a copy-out for use in an external LLM, with no agent invocation in our system.

## Dependencies
- Requires: PROJ-76, PROJ-77, PROJ-78 (skills exist and are assigned)
- Requires: PROJ-79 (DMS — destination for generated documents)
- Requires (**nur β**): **PROJ-80-β** (Retrieval) — PROJ-80-α liefert keinen Vektorindex
- Requires (**nur β**): PROJ-81 (scope enforcement) — selbst blockiert
- Requires: **PROJ-82-α** (Mandatsdurchsetzung — `generate_document` ist genau so ein Mandat)
- Requires: **PROJ-151** (Projekt-Chat) — die Konversationsebene wird **wiederverwendet**, nicht
  neu gebaut; sie ist dort per Lock rein lesend, diese Story ergänzt den schreibenden Weg
- Requires: PROJ-12 (proposal layer if generated doc is treated as proposal until accepted)
- Influences: PROJ-84 (KI-Kennzeichnung — generated docs are tagged)

## V2 Reference Material
- None.

## User Stories
- **[V3 SK-30]** As a PM, I want to start a "generate document" action from inside a task, so that I can produce required artifacts (Betriebsrat safety assessment, DSGVO check, cost structure, mapping) without leaving the task.
- **[V3 SK-31]** As a PM, I want a chat-like dialog with the agent during document generation, so that I can refine the output iteratively before it is saved.
- **[V3 SK-32]** As a PM, I want the finished document to be saved into the project DMS at a sensible default location, linked to the originating task, and flagged AI-generated, so that traceability is automatic.
- **[V3 SK-33]** As a PM, I want a "Prompt exportieren" alternative that gives me the assembled prompt as copy-out, so that I can run it in an external LLM when our in-system agent is not the right tool.

## Acceptance Criteria

### Task action surface
- [ ] On any work item detail page (PROJ-9), a button "Dokument erzeugen …" is visible when the project has at least one assigned Skill with `allowed_actions` containing `generate_document`.
- [ ] Clicking opens a dialog with: target Skill (auto-selected by best match, overridable), document title, optional template (V2), and an input field for free-text instructions.

### Chat-like generation dialog
- [ ] Two-pane UI: left = conversation transcript, right = live document preview (Markdown rendered).
- [ ] PM may send follow-up messages: "kürzer", "Tonalität formeller", "Abschnitt X umschreiben".
- [ ] Each agent turn updates the document preview; transcript stored client-side until save.
- [ ] PM can click "Speichern" → finalizes document, OR "Verwerfen" → no document persisted.

### Document persistence
- [ ] On save: new `documents` row with `ai_generated=true` und `ai_generated_metadata={skill_id,
      skill_version_id, task_id, conversation_transcript_ref, generated_at}`. **Beide Spalten
      existieren bereits** — `20260721120000_proj79_dms_foundation_alpha.sql:132`. Diese Story legt
      also keine Spalte an, sie **füllt** eine vorhandene. Der Aufnahmeweg ist ebenfalls gelöst:
      PROJ-Y-45q hat für Baufotos eine enge `SECURITY DEFINER`-Funktion gebaut, die einen Knoten
      nur unter einem gesetzten Zielordner anlegt — dasselbe Muster trägt hier, statt die
      `document_tree_nodes`-Schreibregel aufzuweichen.
- [ ] Default tree node: a project folder `KI-Dokumente/<Task-Kürzel>/` (auto-created if missing). PM can override target before save.
- [ ] Verknüpfung Aufgabe↔Dokument mit Beziehungsart `generated_from_task`. **Achtung, Fallstrick:**
      `work_item_documents` existiert, ist aber **trotz seines Namens keine DMS-Verknüpfung** —
      PROJ-45-γ hat gemessen, dass die Tabelle `kind/title/body/checklist` trägt. Vorbild ist
      `skill_knowledge_links` (PROJ-77-γ) bzw. `construction_photos` (PROJ-45-ε). `task_document_links`
      hat heute 0 Treffer, muss also neu entstehen.
- [ ] Das Dokument läuft durch die PROJ-80-α-Kette wie jedes andere (Extraktion,
      Volltext-Klassifikation, Quintessenz). **Nicht** zu übersehen: PROJ-45-ε hat dort einen Riegel
      eingebaut — Bilder werden per `mime_unsupported_for_rag` ausgenommen; ein KI-erzeugtes
      Markdown-Dokument fällt nicht darunter und wird zusammengefasst, also erzeugt eine
      Generierung eine zweite KI-Ausgabe über der ersten. Das ist zu entscheiden, nicht
      nebenbei mitzunehmen.

### Copy-Out / Prompt Export
- [ ] Alternative button "Prompt exportieren" in the same starting dialog.
- [ ] Generates the same prompt assembly (skill markdown + **(β)** RAG context for chosen scope +
      task input + free-text) and renders it in a modal with „Kopieren"-button. In **α** ohne
      RAG-Anteil — und das ist der Teil, der **ohne** jeden Modellaufruf funktioniert, also der
      billigste Nutzen der ganzen Story.
- [ ] No LLM invocation in our system in this path; audit logs `ai.prompt_exported` for traceability.
- [ ] An informational note advises the PM to keep tenant-sensitive RAG content in mind when pasting to an external system; PROJ-84 data-class tagging shows up here.

### Allowed actions enforcement
- [ ] Skill must have `generate_document` in `allowed_actions`; otherwise the button is hidden and the API endpoint returns 403.

### Audit
- [ ] Events: `ai.document_generation_started`, `ai.document_generation_canceled`, `ai.document_generated`, `ai.prompt_exported`, `ai.document_saved_to_dms`.

## Edge Cases
- **Agent fails mid-conversation** → transcript persists in dialog; user can retry without losing context.
- **User saves without ever sending a message** → uses the initial input + skill defaults; still produces a document.
- **Document type cannot be expressed in Markdown** (e.g. complex Excel table) → V1 saves as `.md`; user can post-export to DOCX/XLSX manually. Native non-Markdown output deferred to V2.
- **PM closes the browser tab mid-generation** → transcript loss; document is not saved (no auto-save in V1). UI warns on unload.
- **Token limits exceeded** → agent returns "Truncated due to length"; PM can split the request.
- **RAG context produces zero documents** (empty scope) → agent runs prompt-only; transparent notice in UI.
- **PII handling for Betriebsrat docs** → the generated document inherits the project's `data_class`; PROJ-84 audit captures classification.
- **Two PMs run the same generation in parallel on the same task** → two separate documents created, named with `(2)` suffix in same target folder.

## Technical Requirements
- **Stack:** Next.js 16 + Supabase, shadcn/ui (`Dialog`, `Tabs`, `ScrollArea`, `Button`); streaming LLM responses via Server-Sent Events or fetch streaming.
- **Markdown rendering:** `react-markdown` with sanitization.
- **Multi-tenant:** `ai_generated_metadata` includes `tenant_id`; DMS write goes through PROJ-79 RLS.
- **Validation:** Zod for the generation request payload.
- **Auth:** project_lead or editor role on the task.
- **Performance:** streaming responses to keep perceived latency low; target first token ≤ 5 s, total ≤ 60 s for typical document.
- **Audit hook:** PROJ-10.

## Out of Scope
- Direct creation of DOCX / XLSX / PDF formats (V2).
- Templates library for common document types (Betriebsrat-Vorlage, DSGVO-Vorlage) — V2.
- Multi-agent collaboration during generation (e.g. legal + technical agents back-and-forth) — V2.
- Versioned document history (V2; current persistence is single-version per save).
- Real-time co-editing of the generated document.

## Geerdet am 2026-09-01 (PROJ-165) — und in α + β geschnitten

### Messungen

| Annahme der Erstfassung | Gemessener Stand 2026-09-01 |
|---|---|
| `generate_document` muss als Mandat eingeführt werden | **steht im ausgelieferten Enum** (`src/lib/skills/allowed-actions.ts`, PROJ-77-α) |
| `documents.ai_generated` / `ai_generated_metadata` sind neu | **existieren seit PROJ-79-α** (Migration Z. 132) |
| Chat-Dialog mit dem Skill-Agenten ist neu zu bauen | **PROJ-151 hat die Konversationsebene** samt Skill-Steuerung, Kostendeckel, Class-3-Gate — dort per Lock **rein lesend** |
| `task_document_links` „defined in PROJ-9 or here" | **0 Treffer**; und `work_item_documents` ist trotz Namens **keine** DMS-Verknüpfung (PROJ-45-γ) |
| DMS-Schreibweg ist offen | **gelöst** — PROJ-Y-45q hat den engen DEFINER-Aufnahmeweg gebaut, weil PROJ-79s Policy nur `lead`/`editor` einfügen lässt |
| RAG-Kontext steht bereit | PROJ-80-**α** ohne Vektor; `document_chunks` 0 Treffer |

### Der Schnitt

- **α (baubar):** „Prompt exportieren" ohne jeden Modellaufruf · Generierung über die PROJ-151-Ebene
  mit Skill-Kontext · Ablage ins DMS über den PROJ-Y-45q-Weg · Verknüpfung zur Aufgabe ·
  `generate_document`-Mandat über PROJ-82-α durchgesetzt.
- **β (gesperrt):** RAG-Kontext im Prompt und die Scope-Anzeige „Skill greift auf X Dokumente zu".

### Zwei Dinge, die diese Erdung nicht entschieden hat

Ob eine KI-Generierung anschließend **automatisch zusammengefasst** werden soll (PROJ-80-α würde das
tun — eine KI-Ausgabe über einer KI-Ausgabe), und ob der Zwei-Fenster-Dialog eine eigene Fläche wird
oder im PROJ-151-Chat lebt. Beides gehört in `/architecture`, nicht in eine Erdung.

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be filled by /architecture._

## Implementation Notes
_To be added by /frontend and /backend._

## QA Test Results
_To be added by /qa._

## Deployment
_To be added by /deploy._
