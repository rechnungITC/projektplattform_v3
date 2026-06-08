# PROJ-80: RAG-Indexierung + Quintessenz

## Status: Planned
**Created:** 2026-06-06
**Last Updated:** 2026-06-07

## Summary
On top of the raw DMS (PROJ-79), this story adds the AI-side enrichment. When a document is uploaded or created, the system extracts its text, chunks it, embeds it into a per-tenant vector index, and a dedicated Summarizer Skill produces a **Quintessenz** — a structured short summary stored alongside the document. When an agent later retrieves context for a follow-up task that links to that document, the PM picks between **deep mode** (full text via retrieval) and **context mode** (Quintessenz only).

## Dependencies
- Requires: PROJ-79 (DMS Foundation)
- Requires: PROJ-76 (Skill-Framework) — Summarizer is a built-in cross-cutting Skill
- Requires: PROJ-12 (AI Proposal Layer) — Summarizer invocation reuses the agent infrastructure
- Influences: PROJ-81 (Skill-to-RAG-Scope) — retrieval is scoped through it
- Influences: PROJ-82, PROJ-83 — both consume retrieval output

## V2 Reference Material
- None.
- ADR to be created: `docs/decisions/rag-architecture.md`, `docs/decisions/quintessenz-schema.md`.

## User Stories
- **[V3 SK-19]** As the system, I want to extract, chunk, and embed every supported uploaded document, so that agents can retrieve relevant passages by semantic search.
- **[V3 SK-20]** As the system, I want a Summarizer Skill to produce a Quintessenz for every document right after indexing, so that agents have a compact context object available without reading the full text.
- **[V3 SK-21]** As a PM, when I am working on a task that references a related document, I want to choose between reading the full document (deep) or just its Quintessenz (context), so that I can balance precision and speed.
- **[V3 SK-22]** As a PM, I want the Quintessenz to be visible and editable on the document detail page, so that I can correct it if the auto-generation got something wrong.

## Acceptance Criteria

### Indexing pipeline
- [ ] On `document.uploaded` event (PROJ-79), an async job triggers extraction:
  - PDF → `pdfjs-dist` direct (same CIA-approved parser family as PROJ-70; do not reintroduce `pdf-parse`)
  - DOCX → `mammoth` (already available in the PROJ-70 artifact stack)
  - XLSX → `SheetJS`
  - MD/TXT/CSV → direct read
  - PPTX → text-only extract
- [ ] Failed extraction (e.g. scanned PDF without text layer) → document marked `text_extraction_status='failed'`; surfaced in DMS UI; no indexing attempted (OCR explicitly out of scope V1).
- [ ] Successful extraction → text is chunked (target 800 tokens, overlap 100; tunable) and embeddings stored in `document_chunks` table with vector column.

### Data model
- [ ] Table `document_chunks`: `id UUID PK, tenant_id UUID NOT NULL, document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE, chunk_index INT NOT NULL, content TEXT NOT NULL, embedding vector(1536), token_count INT, created_at`. Vector index via pgvector.
- [ ] Table `document_summaries`: `id UUID PK, tenant_id UUID NOT NULL, document_id UUID NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE, structured_summary JSONB NOT NULL, summary_markdown TEXT NOT NULL, generated_by_skill_version_id UUID REFERENCES skill_versions(id), generated_at TIMESTAMPTZ, edited_by_user_id UUID, edited_at TIMESTAMPTZ, status TEXT CHECK (status IN ('auto','user_edited','stale'))`.
- [ ] `structured_summary` JSONB schema (V1): `{ title, key_topics: [], entities: [{name, type}], summary_paragraphs: [], references: [], language }`.

### Summarizer Skill (built-in)
- [ ] Ships with seeded built-in Skill `summarizer` (category `cross_cutting`, active by default in every tenant).
- [ ] Admin can override the markdown but cannot delete it (V1).
- [ ] Invocation pattern: when indexing completes, the orchestrator calls Summarizer with the extracted text + frontmatter instructions; result written to `document_summaries`.
- [ ] On Summarizer failure → `document_summaries` row created with `status='stale'` and empty summary; surfaced in UI with "Quintessenz nicht erzeugt" + retry button.

### Re-summarization on re-upload
- [ ] If a document with the same `tree_node_id` is re-uploaded (overwrite), chunks and summary are invalidated and re-generated; `status='stale'` during regeneration.

### Deep vs Quintessenz toggle
- [ ] In a task UI that links to one or more documents (link table specified in PROJ-9 or here as `task_document_links`), a per-link toggle "Vollständig / Quintessenz" is shown.
- [ ] Default: Quintessenz. Per-tenant default configurable in admin settings (cross-batch open question).
- [ ] When an agent acts on this task (via PROJ-82 or PROJ-83), the chosen mode determines whether the retrieval call returns top-k matched chunks or just the Quintessenz markdown.

### Document detail page
- [ ] Shows document metadata + tabbed view: Vorschau / Quintessenz / Verlinkungen.
- [ ] Quintessenz tab shows the auto-generated markdown editable inline; save promotes status to `user_edited` and stops further auto-regeneration unless admin force-re-runs.

### Audit
- [ ] Events: `document.indexed`, `document.indexing_failed`, `document.summary_generated`, `document.summary_edited`, `task.retrieval_invoked` (with mode `deep|context`).

## Edge Cases
- **Scanned PDF with no text layer** → indexing skipped; document still browsable, no Quintessenz; PM sees explicit note.
- **Document larger than 50 MB** → blocked at upload (PROJ-79).
- **Embedding model unavailable / API outage** → job retries with exponential backoff up to 24 h; persistent failure surfaces in admin alert.
- **User edits Quintessenz then re-uploads document** → previous user edit is preserved unless PM explicitly opts into regeneration.
- **PII appears in chunks** → tagged via PROJ-84 data-class metadata; affects retrieval permissioning (out of scope of this story but contract honored).
- **Summarizer skill is deactivated by admin** → indexing still runs; summary row created with `status='stale'` and a clear "Summarizer Skill nicht aktiv" notice.
- **Two PMs simultaneously edit Quintessenz** → optimistic concurrency via `If-Match: <edited_at>`; one of them gets 409.

## Technical Requirements
- **Stack:** Next.js 16 + Supabase (DB with pgvector extension); background job runner (Supabase Edge Functions or queue, decide in /architecture).
- **Embedding provider:** decide in /architecture per ADR `data-privacy-classification` — local model for `internal`-classified data, Anthropic/OpenAI for `general`.
- **Text extraction libraries:** reuse the PROJ-70 hardening baseline where possible (`pdfjs-dist`, `mammoth`, magic-byte sniffing, parser timeouts, no raw parser-output logs); decide XLSX/PPTX libraries in /architecture.
- **Multi-tenant:** every table carries `tenant_id`; pgvector index per tenant or single index with `tenant_id` filter (decide in /architecture).
- **Validation:** Zod for summary JSONB schema; structured summary must conform before write.
- **Auth:** read-summary follows document RLS; edit requires project_lead or editor role.
- **Performance:** target indexing job latency ≤ 5 min for 50 MB document; summary latency ≤ 90 s typical.
- **Audit hook:** PROJ-10.

## Out of Scope
- OCR for scanned PDFs (V2).
- Multi-modal indexing (images, audio) — V2.
- Cross-document summarization ("summarize all risk reports") — V2.
- Per-skill summary variants (one Quintessenz per document, not per consumer) — V2.
- User-facing chunk-level browsing.
- Summarizer evaluation harness (precision/recall metrics) — V2.

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be filled by /architecture._

## Implementation Notes
_To be added by /frontend and /backend._

## QA Test Results
_To be added by /qa._

## Deployment
_To be added by /deploy._
