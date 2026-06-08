# PROJ-83: Task-driven Content Generation

## Status: Planned
**Created:** 2026-06-06
**Last Updated:** 2026-06-07

## Summary
Inside a task (work item), the PM can launch a "generate document" action that opens a chat-like dialog with the agent of the matching Skill (e.g. Datenschützer for a DSGVO assessment, IT-Security for a Betriebsrat-safety review, Controlling for a cost-structure draft). The agent produces a document that is stored back into the project DMS, linked to the originating task, and flagged AI-generated. Alternatively, the PM can choose "Export Prompt" → the same prompt assembly (skill + RAG context + task input) is rendered as a copy-out for use in an external LLM, with no agent invocation in our system.

## Dependencies
- Requires: PROJ-76, PROJ-77, PROJ-78 (skills exist and are assigned)
- Requires: PROJ-79 (DMS — destination for generated documents)
- Requires: PROJ-80 (RAG retrieval for context)
- Requires: PROJ-81 (scope enforcement)
- Requires: PROJ-82 (shares invocation core)
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
- [ ] On save: new `documents` row created with `ai_generated=true`, `ai_generated_metadata={skill_id, skill_version_id, task_id, conversation_transcript_ref, generated_at}`.
- [ ] Default tree node: a project folder `KI-Dokumente/<Task-Kürzel>/` (auto-created if missing). PM can override target before save.
- [ ] Link entry written to `task_document_links` (defined in PROJ-9 or here) with relationship type `generated_from_task`.
- [ ] Document goes through PROJ-80 indexing + Quintessenz pipeline like any other.

### Copy-Out / Prompt Export
- [ ] Alternative button "Prompt exportieren" in the same starting dialog.
- [ ] Generates the same prompt assembly (skill markdown + RAG context for chosen scope + task input + free-text) and renders it in a modal with "Kopieren"-button.
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

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be filled by /architecture._

## Implementation Notes
_To be added by /frontend and /backend._

## QA Test Results
_To be added by /qa._

## Deployment
_To be added by /deploy._
