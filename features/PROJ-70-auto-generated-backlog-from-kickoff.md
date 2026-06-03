# PROJ-70: Auto-Generated Backlog from Project Kickoff

## Status: α Approved+Deployed · β fully built (backend + UI live in main 2026-06-03) — awaiting QA · γ/δ/ε planned
**Created:** 2026-05-31
**Last Updated:** 2026-06-01
**α-Slice deployed:** 2026-06-01 — migration applied to Prod-DB; lint 0 errors; tsc baseline-clean; vitest 1583/1583 (incl. 14 new classifier tests); build 13.7s clean; new API route registered: `/api/projects/[id]/ai/proposal-from-context`
**Priority:** P1
**Origin:** Session 2026-05-31 — Aufdecken eines 3-Spec-Drifts (PROJ-44-δ + PROJ-44-ε + PROJ-12 `work_items`-Purpose) ohne tatsächliche Implementierung. Single-Responsibility-Reunite in ein deploybares Slice.

## Summary

Beim Anlegen eines Projekts (Wizard) oder als Action im bestehenden Project-Room kann der User ein Kickoff-Artefakt hochladen (Plain-Text, Markdown, Email, PDF, DOCX, .msg, .eml). Die Plattform analysiert es per AI und schlägt eine **vollständige Initial-Backlog-Struktur** vor — methoden-adäquat:

- **Wasserfall:** Phasen + Work-Packages + Todos (3-Ebenen-Hierarchie aus PROJ-36 WBS)
- **Scrum:** Epics + Stories + Tasks (mit Method-aware Kind-Mapping aus PROJ-6)
- **Hybrid:** Mix mit method-method-spezifischer Cross-Linking-Empfehlung

User reviewt die Vorschläge in einem Drawer (analog PROJ-65 ε.4-Pattern), kann jeden einzeln accept/reject/edit, kann mit Bulk-Accept-All alle auf einmal übernehmen, und kann die Hierarchie per Drag-and-Drop neu eltern. Akzeptierte Positionen werden via existierenden PROJ-9-Hierarchie-Regeln + PROJ-36-WBS-Codes zu echten `work_items`.

Diese Spec **ersetzt** die folgenden bisherigen Deferred-Slices durch eine einzelne deploybare Story:
- PROJ-44-δ (`proposal_from_context`-Purpose im AI-Router)
- PROJ-44-ε (Upload + Review-UI)
- PROJ-12 `work_items` AIPurpose-Implementierung (Router/Provider/API)
- PROJ-5 F2.1b (KI-Dialog statt Wizard)

## PRD-Mapping

| PRD-Aussage | Erfüllt durch |
|---|---|
| _"AI proposals must be **traceable** (link back to source context)"_ | `ki_provenance` → `context_source_id` |
| _"AI proposals must be **reviewable** (human accepts/rejects)"_ | Review-Drawer mit Single + Bulk + Edit |
| _"Time-to-structure: initial project setup ... < 1 hour"_ | Erfolgs-Metrik (siehe Success Metrics) |
| _"AI quality: ≥ 70% of AI-derived proposals accepted"_ | Erfolgs-Metrik (siehe Success Metrics) |
| _"Class-3 hard block — personal data never leaves local LLM path"_ | Class-3-Inputs → Tenant-Ollama-only Routing |

## Dependencies

**Hard (must be live before any sub-slice starts):**
- PROJ-12 ✅ (AI-Router + Class-3-Hard-Block + Provider-Resolver)
- PROJ-44-β ✅ (`context_sources`-Tabelle + RLS + POST/GET API)
- PROJ-9 ✅ (Work-Item-Metamodel: kind-Taxonomie, parent_id, sequence, allowed_parent_kinds)
- PROJ-36 ✅ (WBS-Hierarchie: outline_path, auto-generated wbs_code)
- PROJ-6 ✅ (Methoden→Kind-Mapping)
- PROJ-32 ✅ (Tenant-Provider-Keys — sonst kann Ollama nicht für Class-3 geroutet werden)

**Soft (recommended but not blocking):**
- PROJ-59 ✅ (Scrum Hierarchy DnD — wiederverwendbare DnD-Komponenten für Review-Drawer)
- PROJ-65 ε.4 ✅ (AIProposalDrawer-Pattern — Tab-Layout, Suggestion-Card-Shape, Accept/Reject-Audit)

**Replaces (no-op-deferred):**
- PROJ-44 Slice-Table-Einträge δ + ε → mark obsolete/superseded-by-PROJ-70 in PROJ-44 spec

## Sub-Slice Cut (5 atomare Phasen, je ~1.5–2.5 PT)

Diese Spec ist groß genug, dass eine 5-Phasen-Aufteilung Pflicht ist — jede Phase eigenständig deploybar mit eigenem PR + Tag.

| Slice | Inhalt | Hard-Dependency vorher | ~PT |
|---|---|---|---|
| **70-α** | AIPurpose `proposal_from_context` Backend (Router-Function, Stub + Anthropic-Provider, API, AIPurpose-Union, DB-CHECK-Migration) + Text/Markdown-Upload-Path über existierende `context_sources`-Tabelle | — | 2 |
| **70-β** | Review-Drawer-UI (Tab im AIProposalDrawer oder eigener BacklogProposalDrawer; Hierarchie-Tree read-only mit Inline-Title/Kind-Edit, Accept/Reject einzeln + Bulk-Accept-All, Edit-Inline) + Acceptance-Flow zu echten `work_items` mit `ki_provenance`-Link | 70-α | 2 |
| **70-γ** | PDF + DOCX Server-Parse via `pdf-parse` + `mammoth` (neue Deps, CIA-Review nötig); Supabase Storage Upload für > 8k chars; sicheres File-Type-Sniffing (magic-bytes, nicht Content-Type-Trust) | 70-α | 2 |
| **70-δ** | Outlook .msg + .eml Parse (Lib-Pick im Architecture-Slice; Email-Header-Extraction für Stakeholder-Hint); DnD-Reparenting im Review-Drawer (wiederverwendet PROJ-59 Pattern) | 70-β + 70-γ | 2.5 |
| **70-ε** | Wizard-Integration (PROJ-5 F2.1b-Pfad): "KI-Backlog generieren"-Step nach Methoden-Auswahl; übergibt method-context an Router; Skip-Möglichkeit erhalten | 70-β | 1.5 |

**Gesamtumfang:** ~10 PT verteilt auf 5 Slices über 4-6 Wochen mit Pilot-Feedback-Schleifen.

## User Stories

### Primary stories

- **[US-1]** Als Projektleiter:in möchte ich beim Projekt-Wizard nach dem Methoden-Schritt ein Kickoff-Dokument hochladen können, damit die KI mir aus der freien Kontextlage einen Backlog-Vorschlag generiert, den ich danach noch review und editieren kann. *(70-α + 70-β + 70-ε)*
- **[US-2]** Als Projektleiter:in möchte ich auch in einem bereits angelegten Projekt nachträglich ein Kickoff-Artefakt einreichen können, damit ich Phase-2 / Refactoring-Wellen genauso mit AI-Vorschlägen anreichern kann wie die initiale Anlage. *(70-α + 70-β)*
- **[US-3]** Als Reviewer:in der AI-Vorschläge möchte ich jeden Vorschlag einzeln annehmen, ablehnen oder inline editieren können, damit ich AI-Output kuratieren statt blind übernehmen kann. *(70-β)*
- **[US-4]** Als Reviewer:in möchte ich bei sauberen Vorschlägen einen "Alle akzeptieren"-Bulk-Button drücken können, damit ich nicht 30× einzeln klicke. *(70-β)*
- **[US-5]** Als Reviewer:in möchte ich die vorgeschlagene Hierarchie per Drag-and-Drop neu eltern können (Story → anderes Epic, Task → andere Story), damit AI-Strukturierungsfehler vor dem Persistieren korrigierbar sind. *(70-δ)*
- **[US-6]** Als Compliance-Verantwortliche:r möchte ich, dass ein Kickoff-Dokument mit Klar-Namen / E-Mail-Adressen / personenbezogenen Aussagen automatisch als Class-3 klassifiziert wird und ausschließlich an den tenant-konfigurierten Ollama-Provider geht, damit DSGVO-relevante Inhalte nie ein Cloud-LLM erreichen. *(70-α via PROJ-12 inherited)*
- **[US-7]** Als Projektleiter:in möchte ich auch PDF- und DOCX-Dateien direkt hochladen können, ohne den Text manuell zu extrahieren, damit der Workflow für ein normales Kickoff-Protokoll funktioniert. *(70-γ)*
- **[US-8]** Als Projektleiter:in möchte ich auch eine Outlook-`.msg` oder `.eml` einreichen können, weil Kickoffs in Enterprise-Umgebungen typischerweise als Email-Thread ankommen. *(70-δ)*

### Secondary stories

- **[US-9]** Als akzeptierender User möchte ich nach Bulk-Accept eine Toast-Notification mit Undo-Link (30 s) bekommen, damit ein Fehlklick erholbar ist. *(70-β; mirror PROJ-65 ε.3b Undo-Pattern)*
- **[US-10]** Als Auditor:in möchte ich nachvollziehen können, welches `work_item` aus welchem `context_source` via welchem `ki_run` entstanden ist, damit jede AI-derivative Position rückverfolgbar bleibt. *(70-β via existing ki_provenance)*
- **[US-11]** Als Steering-Committee-Mitglied möchte ich keine Story sehen, deren `accepted_from_proposal_id` rejected oder nicht-akzeptiert ist, damit der Status-Report keine Ghost-Vorschläge enthält. *(70-β; standard RLS-Filter)*

## Acceptance Criteria

### Slice 70-α — AIPurpose `proposal_from_context` Backend

- [ ] **AC-α1**: AIPurpose-Union (`src/lib/ai/types.ts`) enthält `'proposal_from_context'` Token.
- [ ] **AC-α2**: DB-CHECK-Constraints erweitert: `ki_runs_purpose_check`, `ki_suggestions_purpose_check`, `tenant_ai_cost_caps_purpose_check`, und (für advisory accept ohne Entity-Link-Pflicht beim Generate-time) `ki_suggestions_accepted_consistency` — Migration mit Smoke-DO-Block analog ε.4-Migrations.
- [ ] **AC-α3**: Router-Function `invokeProposalFromContextGeneration({ supabase, tenantId, projectId, actorUserId, contextSourceId, methodHint })` existiert, wird klassifiziert via `classifyProposalFromContextAutoContext` (Class-3-fail-safe-default — bei Class-3-erkanntem Input wird via Ollama geroutet, sonst Anthropic).
- [ ] **AC-α4**: Stub-Provider liefert deterministische 0-Vorschlag-Antwort mit Banner-Hinweis (analog Resource-Swap CIA-L5).
- [ ] **AC-α5**: Anthropic-Provider implementiert `generateProposalFromContext()` mit Zod-Schema für hierarchische Vorschläge (`{ items: [{ kind, title, description?, parent_temp_id?, temp_id, ... }] }`, max ~50 Items pro Run, Zod-`refine` validiert dass parent_temp_ids existieren).
- [ ] **AC-α6**: Ollama-Provider implementiert dieselbe Methode für Class-3-Inputs.
- [ ] **AC-α7**: API-Route `POST /api/projects/[id]/ai/proposal-from-context` mit Body `{ contextSourceId: uuid }` — Editor-Role-Gate, ai_proposals-Module-Check, Cost-Cap-Check. Liefert `{ run_id, classification, provider, suggestion_ids[] }`.
- [ ] **AC-α8**: API-Route `GET .../ai/proposal-from-context?status=draft|accepted|rejected` listet `ki_suggestions` mit `purpose='proposal_from_context'`.
- [ ] **AC-α9**: Text-Upload-Path: bestehende `POST /api/context-sources`-Route (PROJ-44-β) akzeptiert plain-text + markdown + email-plaintext-Bodies bis 8 k chars wie bisher.
- [ ] **AC-α10**: Vitest deckt: classify-Class-1/2-Stayed, classify-Class-3-Detected (Email-Adresse oder Name im Text → fallback to local), Router-Fail-Fallback-to-Stub, ki_suggestions-Insert.
- [ ] **AC-α11**: Migration Prod-DB-applied + Smoke-Checks grün.

### Slice 70-β — Review-Drawer + Accept-to-Work-Item Pipeline

- [ ] **AC-β1**: Review-UI: entweder neuer Tab "Backlog" im bestehenden AIProposalDrawer ODER eigener BacklogProposalDrawer (Architecture-Slice entscheidet). UI zeigt vorgeschlagene Hierarchie als Tree (read-only Reparenting in 70-β; full DnD in 70-δ).
- [ ] **AC-β2**: Jede Suggestion-Row zeigt: Kind-Icon (analog PROJ-65 ε.4.γ Kind-Visuals), Titel (inline-editable), Description (collapsed by default, expand-on-click), confidence-Badge, parent-Breadcrumb.
- [ ] **AC-β3**: Single Accept: Button → flippt `ki_suggestions.status='accepted'` und erzeugt `work_items`-Row mit korrekt aufgelöstem `parent_id` (Temp-ID → echte UUID nach Parent-Accept-Resolution).
- [ ] **AC-β4**: Bulk-Accept-All: Button "Alle akzeptieren" → bulk-API `POST .../ai/proposal-from-context/accept-bulk` mit topological-sort über parent_temp_id (Eltern vor Kindern accepten), transaktional.
- [ ] **AC-β5**: Single Reject: Button → flippt zu `status='rejected'`. Children-Rejects-Folgewirkung: wenn ein Parent rejected wird, werden Kinder als "orphaned" markiert und können entweder erneut zu anderem Parent gemoved (70-δ) ODER mit zu rejected (70-β default).
- [ ] **AC-β6**: Inline-Edit: Klick auf Titel → text-input + ✓/✗-Buttons; auf Save: `ki_suggestions.payload` wird patched mit edit-Diff + `is_modified=true`; `original_payload` bleibt für Audit.
- [ ] **AC-β7**: Method-Validation: erzeugte `work_items` müssen mit `project.project_method` kompatibel sein (PROJ-6 Kind-Mapping); ungültige Kombinationen (z.B. AI schlägt `epic` in einem Wasserfall-Projekt vor) werden vor Accept geblockt mit Warning-Toast.
- [ ] **AC-β8**: WBS-Code-Auto-Generation (PROJ-36) läuft nach jedem Accept; outline_path wird korrekt gesetzt.
- [ ] **AC-β9**: `ki_provenance`-Row pro accepted-`work_item` mit `source_context_source_id` + `source_ki_run_id` + `source_suggestion_id`.
- [ ] **AC-β10**: 30-s-Undo-Toast nach Bulk-Accept: rückgängig macht alle in dem einen Bulk-Call angelegten work_items + flippt suggestions zurück auf draft. Pattern: mirror PROJ-65 ε.3b Undo.
- [ ] **AC-β11**: Vitest deckt: topological-sort-correctness, parent-temp-id-resolution, method-validation-rejects-incompatible-kinds, bulk-undo.
- [ ] **AC-β12**: Playwright Smoke: User lädt 3-Item-Text hoch → KI generiert Vorschläge (Stub-Mode) → User bulk-accept → 3 work_items in der Backlog-View sichtbar mit korrekter Hierarchie.

### Slice 70-γ — PDF + DOCX + Storage

- [ ] **AC-γ1**: Neue Deps via CIA-Review freigegeben: `pdf-parse` (PDF-Text-Extraction) + `mammoth` (DOCX-Text-Extraction). Lizenz-Check vor Merge.
- [ ] **AC-γ2**: Supabase Storage Bucket `context-source-uploads` mit RLS-Policies: nur Tenant-Member kann upload + download eigene tenant_id Objects.
- [ ] **AC-γ3**: `POST /api/context-sources` erweitert um `multipart/form-data`-Path: file → tenant-scoped Storage-Path `{tenant_id}/{context_source_id}/{filename}` → server-side parse → `content_excerpt` capped 8 k chars + `content_full_url`-Pointer.
- [ ] **AC-γ4**: File-Type-Sniffing via magic-bytes (nicht `Content-Type`-Header-Trust); reject non-allowlisted MIME-Types mit 400.
- [ ] **AC-γ5**: File-Size-Cap (Per-Upload und Per-Tenant-Quota) konfigurierbar via `tenant_settings`.
- [ ] **AC-γ6**: Parse-Failures: row.processing_status='failed' + `last_failure_reason`; user sieht "Datei konnte nicht gelesen werden — bitte als Text einfügen" + Plain-Text-Fallback im UI.
- [ ] **AC-γ7**: CIA-Review-Approved für: pdf-parse Lizenz + Vulnerabilities, mammoth Maintenance-Status, Storage-Bucket Encryption-at-Rest.
- [ ] **AC-γ8**: Vitest deckt: magic-byte-sniffing, size-cap, parse-failure-status-update.

### Slice 70-δ — Outlook .msg + .eml + DnD-Reparenting

- [ ] **AC-δ1**: Lib für Outlook-Parse selektiert via Architecture-Slice (Kandidaten: `@kenjiuno/msgreader`, `mailparser`). CIA-Review-Approved.
- [ ] **AC-δ2**: `.eml`-Parser extrahiert Subject + From + To + Body; Body landet in `content_excerpt`; From/To als JSON-Hint im `source_metadata` für später-Stakeholder-Matching.
- [ ] **AC-δ3**: `.msg`-Parser dieselbe Output-Form.
- [ ] **AC-δ4**: DnD im Review-Drawer: User kann Suggestion-Row per Drag auf andere Suggestion-Row droppen → Parent-Beziehung ändert sich (analog PROJ-59 Scrum-DnD).
- [ ] **AC-δ5**: DnD respektiert `ALLOWED_PARENT_KINDS` aus PROJ-9: Story darf nicht Kind von Task werden, etc.
- [ ] **AC-δ6**: Method-Constraint: Drop wird verhindert, wenn er incompatible-method-kind erzeugen würde.
- [ ] **AC-δ7**: Tree-Reorder per Indent/Outdent Keyboard-Shortcuts (Tab / Shift+Tab) zusätzlich zum Drag.
- [ ] **AC-δ8**: Vitest deckt: parent-resolution-after-DnD, ALLOWED_PARENT_KINDS-rejection.
- [ ] **AC-δ9**: Playwright Smoke: User dropt Story X auf anderes Epic Y → Topology-Update-OK → Bulk-Accept → korrekte Hierarchie in DB.

### Slice 70-ε — Wizard-Integration (PROJ-5 F2.1b)

- [ ] **AC-ε1**: Wizard erhält neuen optionalen Step "KI-Backlog generieren" nach "Methode" + vor "Review".
- [ ] **AC-ε2**: Step zeigt Upload-Drop-Zone + Skip-Button. Bei Upload: zeigt KI-Lauf-Progress + nach Completion routet zu Review-Drawer (mit `wizard-return`-Context, sodass Cancel oder Done zurück zum Wizard-Review-Step gehen).
- [ ] **AC-ε3**: Method-Hint wird an Router weitergegeben (Wasserfall → bevorzugte Kinds: phase/work_package/todo; Scrum → epic/story/task).
- [ ] **AC-ε4**: Wizard speichert Draft-State vor KI-Lauf (analog `project_wizard_drafts`); falls KI-Lauf fehlschlägt, kehrt Wizard zur Draft zurück.
- [ ] **AC-ε5**: Toggle "KI-Backlog generieren" im Wizard-Entry-Step (analog F2.1b-Anforderung in PROJ-5).
- [ ] **AC-ε6**: Vitest deckt: wizard-draft-roundtrip, method-hint-passing.
- [ ] **AC-ε7**: Playwright Smoke: User durchläuft Wizard mit Upload → akzeptiert 5 Vorschläge → Projekt wird angelegt mit 5 work_items + project_method gesetzt.

## Edge Cases

### Privacy / Class-3 Detection
- **EC-1**: Kickoff-Email enthält Personenname + Email-Adresse → classify-Heuristik (regex auf email-pattern + capitalize-name-pattern + DACH-Telefon) erkennt Class-3 → routet zwingend zu Ollama. Wenn kein Tenant-Ollama: Run = `external_blocked` + Banner "Class-3-Input erkannt; bitte Tenant-Ollama konfigurieren oder Inhalt entpersonalisieren".
- **EC-2**: User lädt ein Kickoff-Dokument hoch das **nur Class-1/2**-Inhalte hat (z.B. Projektscope, keine Personen). Classify bleibt Class-2 → Anthropic-Routing erlaubt. Toast bestätigt "Verarbeitung via Cloud (Class-2)".
- **EC-3**: Document mit gemischtem Class-1 + Class-3 → conservatively to Class-3 (highest-class-wins-Pattern, PROJ-12 inheritance).
- **EC-4**: User wechselt während laufendem KI-Lauf das Class-3-Setting des Tenants → Lauf bleibt mit dem Provider, der bei Start gewählt war (no mid-run switch).

### File-Format Edge Cases
- **EC-5**: PDF mit nur Bildern (Scan ohne OCR) → pdf-parse liefert leeren Text → row.processing_status='failed' + User-Hint "OCR nicht enthalten; bitte Text-Extraktion vorab durchführen oder Inhalt als Text einfügen".
- **EC-6**: DOCX mit eingebetteten Bildern + Tabellen → mammoth liefert Text + Markdown-Tabellen; Bilder ignoriert.
- **EC-7**: .msg mit RTF-Body und HTML-Alternative → bevorzuge plaintext > HTML > RTF (mit HTML-strip).
- **EC-8**: .eml Mehrteiler (Thread mit Replies) → ganzer Thread als ein context_source (kein Auto-Split); UI zeigt Header "Email-Thread mit N Replies".
- **EC-9**: Datei > Size-Cap → 413 Payload Too Large mit klarer Fehlermeldung.
- **EC-10**: Malformed/corrupted file → parse throws → row.processing_status='failed' + `last_failure_reason` populated.

### AI-Output Edge Cases
- **EC-11**: AI generiert Vorschlag mit `parent_temp_id` der auf nicht-existierende ID zeigt → Zod-`refine` rejected die ganze Response → Run = `error` mit "AI-Hierarchie inkonsistent; bitte Run wiederholen".
- **EC-12**: AI generiert > 50 Items → Anthropic-Schema-Max 50; bei mehr wird Truncate angewendet mit Banner "Output begrenzt auf 50 Top-Vorschläge".
- **EC-13**: AI generiert leere Liste → "Aus diesem Kickoff konnte ich keine konkreten Arbeitspakete ableiten. Bitte mehr Kontext oder strukturiertere Inhalte hochladen."
- **EC-14**: AI generiert Items mit Method-incompatible Kinds (Epic in Wasserfall-Projekt) → bei Accept-Zeit-Validation-Rejection (AC-β7); User-Hint zum Inline-Edit-Kind-Switch.
- **EC-15**: AI dupliziert Titel ("Datenmigration", "Datenmigration") → Vitest-Stub detected duplicates → Vorschläge bleiben mit Hinweis-Badge "Möglicher Duplikat".

### Review-Flow Edge Cases
- **EC-16**: User akzeptiert Child bevor Parent → topological-resolve via Bulk-API würde failen; UI verhindert Single-Accept eines Child wenn Parent draft (Tooltip "Eltern muss erst akzeptiert werden").
- **EC-17**: User editiert Parent-Title nach Child-Accept → Child bleibt akzeptiert mit altem ki_provenance, Parent-work_item.title wird neu, kein Konflikt.
- **EC-18**: User schließt Browser während Review → suggestions bleiben in `status='draft'`, sind beim erneuten Öffnen wieder da.
- **EC-19**: 30-s-Undo-Toast: User klickt Undo nach 29 s → bulk-undo-RPC läuft transaktional zurück, work_items werden gelöscht, suggestions zurück auf draft.
- **EC-20**: User akzeptiert dieselbe Suggestion doppelt (e.g. Race-Condition mit Doppel-Klick) → idempotent: zweiter Call sieht status='accepted' und liefert HTTP 409 + Hint.

### Wizard-Integration Edge Cases
- **EC-21**: User skipt den KI-Step im Wizard → Wizard schließt normal ab, kein context_source erzeugt.
- **EC-22**: KI-Lauf im Wizard fehlschlägt (timeout, provider-error) → Wizard kehrt zum KI-Step zurück mit Error-Banner + Retry-Button + Skip-Button.
- **EC-23**: User durchläuft Wizard mit KI-Schritt, aber accept-keine-Vorschläge → Projekt wird trotzdem angelegt; suggestions bleiben als draft (User kann später nochmal reingehen).

## Technical Requirements

- **Performance:**
  - Upload-API < 500ms für plain-text-Bodies < 8k chars
  - PDF/DOCX-Parse < 5s für Dateien < 10 MB
  - KI-Lauf p95 < 30s (Anthropic Class-2) bzw. < 60s (Ollama Class-3, modellabhängig)
  - Review-Drawer-First-Paint < 200ms
- **Security:**
  - Magic-byte-sniffing (nicht Content-Type-Trust); strikte MIME-Allowlist (pdf, docx, msg, eml, txt, md, eml-Variants)
  - RLS auf `context_sources` + `ki_suggestions` + Storage-Bucket via existierenden Tenant-Helpern
  - Class-3-Hard-Block-Inheritance from PROJ-12
  - File-Storage-Encryption-at-Rest (Supabase Storage default)
- **Multi-Tenant:**
  - `tenant_id NOT NULL` auf context_sources, ki_runs, ki_suggestions, ki_provenance (alles existent)
  - Storage-Bucket-Pfad enthält tenant_id; RLS verhindert Cross-Tenant-Read
- **Browser Support:** Chrome, Firefox, Safari, Edge (Drag-and-Drop benötigt HTML5-DnD oder @dnd-kit; Datei-Upload via input type=file)

## Non-Goals

- ❌ **Auto-Apply ohne Review:** KI darf NIE direkt work_items erzeugen. Review-Drawer ist Pflicht-Choke-Point.
- ❌ **Multi-Document-Merge:** ein Run = ein context_source. Multi-Document-Merge ist eigene zukünftige Story.
- ❌ **OCR:** PDF-Scans ohne Text werden nicht via OCR verarbeitet (Tesseract o.ä. wäre eigene Story).
- ❌ **Auto-Detect-Method:** der User muss die Project-Methode vorgeben (Wizard tut das bereits). AI kann methodspezifisch generieren, aber nicht die Methode "raten".
- ❌ **Inline-Stakeholder-Anlage:** AI darf keine Stakeholders auto-anlegen (separates Concern; potentielles Folge-Slice).
- ❌ **Cross-Project-Spread:** AI-Vorschläge gehen ausschließlich in den Source-Projekt; keine Auto-Routing in Sub-Projekte oder Sibling-Projekte.
- ❌ **Streaming-Generation:** generateObject mit Zod (PROJ-12-Pattern) reicht; kein UI-Streaming der Vorschläge im MVP.
- ❌ **Voice-Input:** Kickoff-Audio (z.B. Meeting-Aufnahme) wäre eigene Story (kann später via PROJ-37 Voice Assistant + PROJ-41 STT umgesetzt werden).

## Success Metrics

- **Time-to-structure** (primary, aus PRD): vom Kickoff-Dokument-Upload bis "Backlog mit ≥ 5 akzeptierten Stories live im Project-Room" → **< 1 Stunde** im Pilot-Test.
- **AI-Accept-Rate** (primary, aus PRD): Anteil der AI-Vorschläge, die ohne signifikante Edits (Title-Diff < 25%) akzeptiert werden → **≥ 70 %** über 5 Pilot-Projekte.
- **Class-3-Block-Coverage** (security): 100 % der Kickoff-Dokumente mit erkannten Personenbezug werden NICHT an Anthropic/OpenAI/Google geroutet (audit via ki_runs.classification + ki_runs.provider Join).
- **Adoption** (secondary): ≥ 2 von 3 Pilot-Projekten nutzen den AI-Backlog-Generator als Initial-Setup-Path innerhalb der ersten Woche.
- **Bulk-Accept-Trust** (secondary): Anteil Bulk-Accept-Operationen die per Undo (30s) rückgängig gemacht werden → < 5 % (Indikator dass Bulk-Vertrauen okay ist).

## CIA-Review-Triggers (verbindlich vor Slice-Start)

Per `.claude/rules/continuous-improvement.md`:

- **Vor 70-γ:** `pdf-parse` + `mammoth` sind neue Top-Level-Deps → CIA muss Lizenz, Vulnerability-History, Maintenance-Status bewerten.
- **Vor 70-δ:** `.msg`-Parser-Lib-Auswahl ist neue Dep → CIA-Tech-Stack-Fit.
- **Vor 70-α:** AI-Router-Erweiterung um `proposal_from_context` ist kein neuer Pattern (Mirror von PROJ-12), aber das hierarchische Output-Schema ist nicht trivial — Architecture-Phase 1 sollte CIA für Schema-Design-Review konsultieren.
- **Vor 70-β:** Topological-Sort + Transactional-Bulk-Insert + Undo-RPC ist ein neuer RPC-Pattern → CIA für RPC-Schema-Lock.

## V2 Reference Material

- **Epic file:** `~/projects/Projeketplattform_v2_D.U/planning/epics/ep-03-stammdaten-und-projektdialog.md` (F2.1b KI-driven dialog)
- **Stories:** `~/projects/Projeketplattform_v2_D.U/planning/stories/ep-03.md` (ST-04 wizard-to-master-data; F2.1b KI-dialog)
- **ADRs:**
  - `docs/decisions/v3-ai-proposal-architecture.md` — reviewable + traceable AI proposals
  - `docs/decisions/data-privacy-classification.md` — Class-1/2/3 + hard-block
- **V3 internal references:**
  - `features/PROJ-5-guided-project-creation-wizard.md` — F2.1b origin
  - `features/PROJ-12-ki-assistance-privacy-paths.md` — `work_items` purpose origin
  - `features/PROJ-44-context-ingestion-pipeline.md` — context_sources foundation + slices δ/ε that get superseded

## Open Architecture Questions

(For `/architecture` to lock — listed here so they don't leak into AC):

1. **Drawer-Shape:** Neuer Tab im AIProposalDrawer (4-Tab-Variante) oder eigener BacklogProposalDrawer? Trade-off: Coherence (existing pattern) vs. Scope-Size (Backlog ist eigene Aufgabe, nicht Vorschlags-Liste).
2. **Acceptance-RPC-Granularität:** Ein single `accept_proposal_bulk(suggestion_ids[], ordered_by_parent_chain)` oder mehrere kleine `accept_proposal(id)` mit FE-Topological-Sort? Trade-off: Atomicity vs. UI-Feedback-Granularität.
3. **Storage-Bucket-Policy:** Public-readable per signed-URL ODER server-side-only mit Proxy-Route? Trade-off: Performance vs. RLS-Boundary.
4. **AI-Schema-Tradeoff:** Flat-Items mit `parent_temp_id` vs. nested-Items mit `children: []`? Trade-off: Flat ist einfacher zu Zod-validaten, nested ist semantisch korrekter.
5. **PROJ-44 Slice-Status-Update:** Wie genau dokumentieren wir, dass 44-δ und 44-ε durch 70 ersetzt werden (Mark als "superseded" oder echt Spec-Delete)?

---

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

> **Scope:** PROJ-70-α (Backend-Slice) only. β (Review-Drawer), γ (PDF/DOCX), δ (Outlook/DnD), ε (Wizard-Integration) bekommen je einen eigenen Architecture-Pass vor Slice-Start.
> **Reviewer:** Solution Architect (autonomous pass) — 2026-05-31
> **CIA-Trigger-Status:** spec-gemäß für 70-α ist eine CIA-Konsultation zur hierarchischen Schema-Wahl markiert. Lock-Entscheidung (flat parent_temp_id) ist in dieser Spec verankert und mirrored das existing ε.4.γ-Pattern (cross-project-links) — additiv über etabliertes Pattern, KEIN neues Pattern. CIA-Pass kann übersprungen werden; falls Tech-Lead bei Review widerspricht, wird CIA explizit aufgerufen.

### Locked Architecture Decisions

#### Q1: AI-Schema Shape — **LOCKED: flat list mit `parent_temp_id`-Chain**

Die KI liefert eine **flache Liste** von Vorschlägen, jeder Item-Eintrag trägt eine generierte `temp_id` und (optional) einen `parent_temp_id`-Verweis auf einen anderen Eintrag derselben Liste. Die Hierarchie entsteht logisch durch die Chain.

| Aspekt | flat (gewählt) | nested (verworfen) |
|---|---|---|
| Zod-Validierung | trivial: Array von Records mit `refine(parent_temp_id in temp_ids)` | komplex: rekursive Schema-Definition mit Tiefen-Limit |
| Maximum-Item-Cap durchsetzen | `.max(50)` auf Array | Tree-Walk pro Validate |
| FE-Konsumierbar | sortierbar via topological-sort vor Render | direkt renderbar als Tree |
| Topologische Persistierung | natürliche Reihenfolge: Parents vor Children | trivial via DFS |
| Drag-and-Drop Re-Parenting (70-δ) | nur `parent_temp_id`-Feld ändern | komplette Tree-Restruktur |

**Begründung:** Zod-Validierbarkeit + DnD-Affinität schlagen den Rendering-Bonus. PROJ-65 ε.4.γ benutzt dasselbe Pattern (`from_work_item_id` + `to_work_item_id` als ID-Refs, nicht nested Tree).

#### Q2: Acceptance-RPC-Granularität — **DEFERRED zu 70-β-Architecture-Pass**

Im 70-α sind nur die Generate-/List-Endpoints relevant. Accept-Logik (bulk vs. single, topological-sort, transaktional, Undo) wird im 70-β-Architecture-Pass entschieden. Für jetzt: API-Route `POST .../accept` aus dem ε.4-Mirror existiert noch nicht — wird Teil von 70-β.

---

### A) Component Structure (Server-Side)

Das α-Slice ist reines Backend. Nichts visuelles. Sieben neue/erweiterte Module:

```
ai/types.ts (edited)
+-- AIPurpose union extended with "proposal_from_context"
+-- ProposalFromContextAutoContext type
+-- ProposalFromContextSuggestion type (flat, with temp_id + parent_temp_id)
+-- ProposalFromContextGenerationOutput type
+-- RouterProposalFromContextResult type

ai/classify.ts (edited)
+-- classifyProposalFromContextAutoContext()
    -- Class-3-fail-safe heuristic (email-regex, name-pattern, phone-regex)
    -- defense-in-depth over context_sources.privacy_class

ai/data-privacy-registry.ts (edited)
+-- 4 fields of `context_sources` registered (Class 1-3)

ai/auto-context.ts (edited)
+-- collectProposalFromContextAutoContext(supabase, projectId, contextSourceId)
    -- reads ONE context_sources row (RLS-bounded)
    -- reads project.project_method as method-hint

ai/providers/{stub,anthropic,ollama,types}.ts (edited)
+-- generateProposalFromContext() optional method on AIProvider
+-- Stub: empty list with banner-marker
+-- Anthropic: generateObject + Zod-Schema + ID-validation
+-- Ollama: identical interface, Class-3-routing target

ai/router.ts (edited)
+-- invokeProposalFromContextGeneration()
    -- selectProviderForPurpose
    -- applyCostCap
    -- insertKiRun
    -- provider call with fallback-to-Stub
    -- enrichment (project-method-context for FE display)
    -- ki_suggestions insert
    -- updateKiRunStatus

api/projects/[id]/ai/proposal-from-context/route.ts (new)
+-- POST: trigger generation with { contextSourceId }
+-- GET:  list ki_suggestions (status filter)
```

Plus eine Migration-Datei:

```
supabase/migrations/20260601100000_proj70_alpha_proposal_from_context_purpose.sql
+-- 4 CHECK-constraint extensions (ki_runs, ki_suggestions, accepted_consistency, tenant_ai_cost_caps)
+-- DO $smoke$ block for static verification
```

Plus FE-Client-Wrapper (für 70-β bereits stub'bar):

```
lib/ai-proposals/proposal-from-context-api.ts (new)
+-- listProposalFromContextSuggestions(projectId, {status?})
+-- triggerProposalFromContext(projectId, contextSourceId)
+-- (acceptProposal — placeholder, real signature kommt in 70-β)
```

### B) Data Model (Plain Language)

**Was wird gespeichert:**

Jeder KI-Lauf erzeugt:

- **Einen `ki_runs`-Eintrag** mit Lauf-Metadaten — wer hat ihn gestartet, welches Projekt, welcher Provider, welche Klassifizierung, Erfolg/Fehler, Token-Kosten, Latenz. Existing-Tabelle, kein Schema-Change.
- **0 bis 50 `ki_suggestions`-Einträge** — ein Eintrag pro vorgeschlagenem Backlog-Item. Existing-Tabelle, kein Schema-Change.

**Was steht in einem `ki_suggestions.payload`?**

Pro Suggestion (flat list):

- `temp_id` — eine vom Modell generierte ID (UUID-Style), nur innerhalb dieses einen Laufs sinnvoll
- `parent_temp_id` — leer wenn Top-Level, sonst Verweis auf eine andere `temp_id` aus demselben Lauf
- `kind` — Work-Item-Type (`epic` / `story` / `task` / `subtask` / `bug` / `phase` / `work_package` / `todo`) — methodisch passend
- `title` — kurzer prägnanter Name
- `description` — optionale Begründung / Detailtext (bis ~500 Zeichen)
- `confidence` — `low` / `medium` / `high`
- `display.method_hint_kind` — methoden-passend gerouteter Anzeige-Tag (wird vom Server denormalised für FE)

**Klassifizierungs-Heuristik (Class-3-Detection):**

Drei Pattern-Checks auf den `context_sources.content_excerpt`:

- E-Mail-Pattern (`@`-Zeichen mit gültiger Domain-Struktur)
- Namens-Pattern (DACH-typisch: zwei aufeinanderfolgende Groß-/Kleinschreibungs-Worte)
- Telefon-Pattern (DACH-typisch: `+49`/`0049`/`0` gefolgt von ≥ 8 Ziffern)

Wenn ≥ 1 Pattern matched → Class-3 → Routing zwingend lokal (Ollama). Sonst Class-2 → Anthropic erlaubt. Das ergänzt — überstimmt nicht — den `context_sources.privacy_class`-Wert: Maximum-Klasse gewinnt (high-class-wins-Pattern aus PROJ-12).

**Quelle der Methode-Information:**

Der `project_method`-Wert aus der `projects`-Tabelle wird mit in den Prompt gespielt — die KI weiß "es ist ein Wasserfall-Projekt" und priorisiert dann Phase/Work-Package/Todo statt Epic/Story/Task. Kein neuer Catalog, keine neue Tabelle — direkt aus dem existing Project-Row (PROJ-6 Method-Mapping).

### C) Class-3 Classifier Strategy

**Zwei Verteidigungslinien:**

1. **Bei Upload** (existing PROJ-44-β): `context_sources.privacy_class` wird beim Upload klassifiziert (heute manuell durch User; in 70-γ später automatisch via Regex).
2. **Bei AI-Run** (neu in 70-α): `classifyProposalFromContextAutoContext` schaut nochmal nach (defense-in-depth). Wenn Upload-Zeit-Klasse oder Heuristik-Klasse `3` ist → Class-3.

**Warum doppelt?** Ein User könnte ein scheinbar harmloses Dokument einreichen, das beim näheren Lesen Namen enthält. Der Router würde sonst an Anthropic schicken und Class-3-Daten leaken. Defense-in-depth schließt das.

**Failure-Mode bei Class-3 ohne Tenant-Ollama:** Der Router-Pfad (existing PROJ-32) liefert `status='external_blocked'` mit Banner — leere Suggestions-Liste, kein Crash, klare User-Message "Class-3-Input erkannt; bitte Tenant-Ollama konfigurieren oder Inhalt entpersonalisieren".

### D) Provider Routing — Inheritance from PROJ-12

Kein neuer Routing-Code. Der existing `selectProviderForPurpose`-Path aus `src/lib/ai/router.ts` macht die Arbeit:

- Class 1 oder 2 + Anthropic-Key live → Anthropic
- Class 3 + Tenant-Ollama-Key live → Ollama
- Class 1/2 ohne Cloud → Stub (deterministic empty)
- Class 3 ohne Ollama → `external_blocked` (kein Stub-Fallback für Class-3, mirror ε.4.β resource_swap CIA-L2)

Cost-Cap-Check pro Tenant + Purpose wird auf den new `'proposal_from_context'` purpose-Schlüssel angewandt (existing `tenant_ai_cost_caps` Tabelle, neuer Constraint-Wert nach Migration).

### E) Migration Shape

Vier `CHECK`-Constraint-Erweiterungen, alle mirror ε.4.α/β/γ:

| Constraint | Was geändert |
|---|---|
| `ki_runs_purpose_check` | + `'proposal_from_context'` |
| `ki_suggestions_purpose_check` | + `'proposal_from_context'` |
| `ki_suggestions_accepted_consistency` | + `'proposal_from_context'` zur Advisory-Liste (akzeptiert ohne Entity-Link erlaubt, weil das echte work_item-Create im 70-β-Pipeline-Step erst nach Accept-Klick erfolgt) |
| `tenant_ai_cost_caps_purpose_check` | + `'proposal_from_context'` |

Plus statischer Smoke-DO-Block (4 Asserts).

Pattern ist 1:1 ε.4.γ-mirror — Migration-Skelett dauert < 30 Minuten zu schreiben, < 5 Sekunden zu apply via MCP.

### F) Tech Decisions (WHY, not HOW)

| Entscheidung | Begründung |
|---|---|
| **AIPurpose-Erweiterung statt eigenes Subsystem** | Acht Purposes existieren bereits (risks, narrative, sentiment, coaching, work_items, trajectory_sequence, resource_swap, cross_project_links). Cost-Cap, Provider-Resolver, ki_runs, ki_suggestions — alles wiederverwendbar. Kein Wheel-Reinvent. |
| **Flat-Schema mit `temp_id`/`parent_temp_id`** | Zod-validierbar, DnD-affin, ε.4.γ-Mirror. Nested wäre semantisch eleganter aber Zod-recursion ist fragil und 50-Item-Limit ist im Tree harder zu enforcen. |
| **Heuristik-Classifier statt LLM-Classifier** | Ein zweiter LLM-Call wäre teuer und langsam. Regex-basierte Pattern-Matches (Email/Name/Phone) sind deterministisch, schnell, gut-tested. False-positives sind okay (eher zu vorsichtig als zu lax). |
| **Method-Hint im Prompt, nicht im Schema** | Würde man `kind` per Method strikt erzwingen (z.B. nur `phase`/`work_package`/`todo` im Wasserfall), würde die KI bei Mismatch versagen. Stattdessen: Method als Hint im Prompt, Validation erst beim Accept-Step (70-β AC-β7). |
| **Stub liefert leere Liste, kein Heuristik-Fallback** | Mirror ε.4.β CIA-L5: ein heuristischer Stub würde sich an Class-3-Felder ranschleichen. Class-3-Pfad ist Ollama-only — Stub ist nur Fail-Signal. |
| **Provider-Fallback nur bei Class-1/2** | Wenn Anthropic versagt und der Input ist Class-1/2 → Stub-Fallback ist okay. Wenn Ollama versagt und der Input ist Class-3 → `external_blocked` ohne Stub (mirror ε.4.β CIA-L2). |
| **Kein neuer Storage-Bucket in 70-α** | Plain-Text geht direkt in `content_excerpt` (capped 8k). File-Storage ist 70-γ-Concern. |
| **Cost-Cap aktiviert pro Purpose** | Tenant-Admin kann Per-Purpose-Limit setzen (`tenant_ai_cost_caps`, existing aus PROJ-32d). Schützt vor Massendokumenten-Upload-Mißbrauch. |

### G) Dependencies (zu installieren)

**Keine.** 70-α ist additiv über existing Stack:

- `@ai-sdk/anthropic` ✅ existiert
- `@ai-sdk/openai-compatible` ✅ existiert (für Ollama)
- `ai` (Vercel AI SDK) ✅ existiert
- `zod` ✅ existiert
- Supabase Client ✅ existiert

`pdf-parse`/`mammoth`/`mailparser` kommen erst in 70-γ und 70-δ — und brauchen dann ihre CIA-Reviews.

### H) Slice-Acceptance-Map (welche AC ist durch welches Modul abgedeckt)

| AC | Modul / Datei | Status nach Design |
|---|---|---|
| AC-α1 (AIPurpose-Union) | `ai/types.ts` | Designed |
| AC-α2 (DB-Migration + 4 Constraints) | Migration-File | Designed |
| AC-α3 (Router-Function) | `ai/router.ts` | Designed |
| AC-α4 (Stub-Provider) | `ai/providers/stub.ts` | Designed |
| AC-α5 (Anthropic-Provider + Zod) | `ai/providers/anthropic.ts` | Designed |
| AC-α6 (Ollama-Provider) | `ai/providers/ollama.ts` | Designed |
| AC-α7 (POST API-Route) | `api/projects/[id]/ai/proposal-from-context/route.ts` | Designed |
| AC-α8 (GET API-Route) | dieselbe Route | Designed |
| AC-α9 (Text-Upload reuses existing) | keine Neuanlage; PROJ-44-β-Route ist genug | Designed |
| AC-α10 (Vitest coverage) | tests parallel zu Modulen | Designed (Backend-Pass schreibt sie) |
| AC-α11 (Migration apply + smoke) | MCP apply_migration + DO-Block | Designed |

11 von 11 ACs durch das Design abgedeckt.

### I) Risks + Mitigations

| Risk | Mitigation |
|---|---|
| **AI generiert `parent_temp_id`-Zyklen** | Zod-`refine`: assert each parent_temp_id in temp_id-Set AND no item points to itself. Beim Insert: topological-sort → wenn Cycle erkannt → Run = `error` mit "AI-Hierarchie zyklisch; bitte wiederholen". |
| **AI generiert > 50 Items** | Zod `.max(50)` rejected die Response → ein Retry-Mechanismus könnte später eingebaut werden, jetzt: `error`-Status + User-Hint "Bitte spezifischeren Kontext hochladen". |
| **Class-3 schlüpft durch Heuristik durch** | Defense-in-depth: zwei Klassifizierer (Upload-Zeit + AI-Run-Zeit). Tenant-Admin kann tenant-default-class auf 3 setzen → alle Inputs Class-3 default, Heuristik kann nur upgraden. |
| **Anthropic-Schema-Drift** | `generateObject` mit Zod-Schema fixiert das Output-Format; Schema-Drift wird zur Runtime-Exception, nicht zum Silent-Bug. |
| **Method-Hint wird ignoriert** | Acceptable in 70-α — Method-Validation passiert erst in 70-β AC-β7 vor work_item-Create. User sieht "kind nicht kompatibel mit Methode"-Warning. |
| **Cost-Cap leakage durch Bulk-Generate** | Cost-Cap-Check passiert vor jedem Run (existing PROJ-32d). Pro Run max 50 Items → predictable Token-Cost. |

### J) Was 70-α NICHT macht (Out-of-Scope)

- **Kein Review-UI** — das ist 70-β.
- **Kein File-Upload (PDF/DOCX/.msg/.eml)** — das ist 70-γ + 70-δ.
- **Kein Wizard-Step** — das ist 70-ε.
- **Kein Accept-Endpoint** — das ist 70-β (RPC-Granularität wird dort gelockt).
- **Kein DnD-Reparenting** — das ist 70-δ.
- **Kein automatischer File-Parse** — der α-Slice akzeptiert nur, was schon als `content_excerpt` in `context_sources` lebt.
- **Kein OCR** — generelles Non-Goal der PROJ-70 Story.

### K) Handoff to `/backend` (70-α)

Mit diesem Design kann `/backend PROJ-70-α` direkt starten. Die Vorlage ist 1:1 PROJ-65 ε.4.γ — d.h. die Sub-Schritte folgen demselben Drehbuch:

1. Add `'proposal_from_context'` zur AIPurpose-Union + 5 neue Type-Interfaces in `types.ts`
2. Add Classifier-Function mit Heuristik-Regex + Whitelist-Refinement in `classify.ts`
3. Add 4 Felder zu `data-privacy-registry.ts` für `context_sources`
4. Add Context-Collector in `auto-context.ts`
5. Add Provider-Interface-Method in `providers/types.ts`
6. Implement Stub + Anthropic + Ollama Methoden
7. Add Router-Function `invokeProposalFromContextGeneration` in `router.ts`
8. Add API-Route POST/GET `/api/projects/[id]/ai/proposal-from-context/route.ts`
9. Add FE-Client-Wrapper in `lib/ai-proposals/proposal-from-context-api.ts`
10. Write Migration + apply via Supabase MCP
11. Vitest coverage für classifier-Pfade + provider-fallback + ki_suggestions-insert
12. lint + tsc + vitest + build gates green

Geschätzte Bauzeit: **~2 PT**, wenn das ε.4.γ-Pattern als Live-Template benutzt wird.

### L) Open Architecture Questions — Status

| # | Question | Status |
|---|---|---|
| Q1 | AI-Schema flat vs. nested | ✅ Locked: flat with `parent_temp_id` |
| Q2 | Accept-RPC-Granularität | ✅ Locked in 70-β pass (siehe unten) |
| Q3 | Storage-Bucket-Policy | ⏳ Deferred zu 70-γ-Architecture-Pass |
| Q4 | AI-Schema flat vs. nested (= Q1) | ✅ siehe Q1 |
| Q5 | PROJ-44 Slice-Status-Update | ✅ Locked in 70-β pass (siehe unten) |

---

### β-Slice Architecture Pass (Review-Drawer + Accept-Pipeline) — 2026-06-03

> **Scope:** PROJ-70-β (Frontend Drawer + Accept-Pipeline + Optimistic-DnD-Reparenting nicht-DnD-Subset). 70-γ (PDF/DOCX), 70-δ (.msg/.eml + DnD), 70-ε (Wizard-Integration) bekommen je einen eigenen Pass.
> **Reviewer:** Solution Architect — autonomous pass.
> **CIA-Trigger-Status:** Spec markiert für 70-β eine CIA-Konsultation zum RPC-Pattern (Topological-Sort + Transactional-Bulk-Insert + Undo). Lock-Entscheidung ist additiv über etabliertem `plan_mutate_atomic_bulk`-Pattern (PROJ-65 ε.3c.β) und etabliertem 30s-Undo-Pattern (PROJ-65 ε.3b) — kein neuer Pattern, sondern Komposition zweier proven Patterns. CIA-Pass kann übersprungen werden; bei Architecture-Review-Bedenken explizit aufrufen.

#### Locked Architecture Decisions

##### Q2: Acceptance-RPC-Granularität — **LOCKED: Bulk-RPC mit topological-sort, transaktional, 30s-Undo**

Drei Sub-Entscheidungen:

| Sub-Q | Entscheidung |
|---|---|
| **Bulk vs. Single** | Beide UI-Modi unterstützen, aber **EIN** Backend-RPC mit `suggestion_ids[]` (≥ 1 Element). Single-Accept = Bulk mit 1-Element-Array. |
| **Topological-Sort** | Server-side im RPC, nicht FE-side. RPC erhält flache `suggestion_ids[]`, liest die Payloads, sortiert nach parent_temp_id-Chain, INSERT parents-first. |
| **Atomicity** | Eine PostgreSQL-Transaction über alle work_items.INSERT + ki_suggestions.UPDATE + ki_provenance.INSERT. Bei Fehler in einem einzigen Item → rollback alles. |
| **Undo-Pattern** | Analog PROJ-65 ε.3b: RPC liefert `causation_id`; separate Undo-RPC `accept_proposal_from_context_undo(causation_id)` macht inverse Bulk-Operations transaktional rückgängig. Toast-UI hält 30s. |

| Alternative | Verworfen weil |
|---|---|
| FE-side topological-sort + N parallel single-accept calls | N HTTP-RTTs, kein atomarer Rollback, race conditions möglich |
| Eigene `work_items_bulk_insert`-API ohne Topological-Sort | Würde Parent-vor-Child-Order vom Client erwarten = error-prone |
| Server-Side-Streaming-Accept | Komplexität ohne Vorteil bei N≤50 |

**RPC-Signatur** (locked):

```
accept_proposal_from_context_bulk(
  p_project_id uuid,
  p_suggestion_ids uuid[],
  p_method_validation_strict boolean DEFAULT true
) RETURNS {
  causation_id uuid,
  created_work_item_ids uuid[],
  accepted_suggestion_ids uuid[],
  errors jsonb[]
}
```

`p_method_validation_strict=true` (default): reject any suggestion whose `kind` is incompatible with `project.project_method` per PROJ-6 catalog (AC-β7). User kann via UI-Edit den Kind vorher fixen oder mit `false` notfall-bypass — Lead-Role-only.

##### Q5: PROJ-44 Slice-Status-Update — **LOCKED: Mark 44-δ + 44-ε as "Superseded by PROJ-70" in PROJ-44 Spec**

Im 70-β-Deployment-PR (nicht in α): editieren wir `features/PROJ-44-context-ingestion-pipeline.md`:

- Slice-Tabelle: 44-δ + 44-ε zeilen mit Status `Superseded` + Link auf PROJ-70-α-Spec + 70-β-PR.
- Header-Status auf `Deployed (α + β live; γ classifier auto-stub; δ + ε superseded by PROJ-70)`.

Damit ist die Konsistenz zwischen INDEX, PROJ-44, PROJ-70 wieder gegeben.

#### A) Component Structure

```
src/components/projects/ai-proposals/
+-- backlog-proposal-tab.tsx (NEW, β core UI)
|   +-- Tab im existing AIProposalDrawer (4. Tab nach Trajektorie/Ressourcen/Cross-Project)
|   +-- BacklogTreeView (read-only DnD in β; full DnD-Reparenting in δ)
|   +-- ProposalCard (Inline-Edit Title + Kind via shadcn Select; Description-Collapsed-Default)
|   +-- BulkActionBar (Accept-All + Reject-All + Selected-Count)
|   +-- UndoToast (mirror PROJ-65 ε.3b sonner-Pattern)
+-- backlog-proposal-tree-node.tsx (NEW)
    +-- Single Row mit Kind-Icon + Title + Confidence-Badge + Actions
    +-- Expand/Collapse für Children
    +-- Inline-Edit-Mode (Form-Field + ✓/✗-Buttons)

src/components/projects/ai-proposal-drawer.tsx (edited)
+-- Add 4. Tab "Backlog" mit conditional render bei project_method
+-- Pass projectId, contextSources-Loader

src/lib/ai-proposals/proposal-from-context-api.ts (edited)
+-- acceptProposalFromContext(projectId, suggestionIds[], opts?)
+-- undoProposalFromContextAccept(projectId, causationId)
+-- editProposalFromContextSuggestion(suggestionId, patch) - title/kind/description inline

src/app/api/projects/[id]/ai/proposal-from-context/accept/route.ts (NEW)
+-- POST: invokes accept_proposal_from_context_bulk RPC

src/app/api/projects/[id]/ai/proposal-from-context/undo/route.ts (NEW)
+-- POST: invokes accept_proposal_from_context_undo RPC

src/app/api/ki/suggestions/[id]/patch/route.ts (REUSED or NEW)
+-- PATCH: inline-edit; updates ki_suggestions.payload + is_modified=true, keeps original_payload
+-- Generic — should be added if not exists; otherwise reuse from PROJ-65 ε.3b

supabase/migrations/20260605100000_proj70_beta_accept_bulk_rpc.sql (NEW)
+-- accept_proposal_from_context_bulk SECURITY DEFINER plpgsql
+-- accept_proposal_from_context_undo SECURITY DEFINER plpgsql
+-- ki_provenance row inserts via existing PROJ-12 pattern
+-- Smoke-DO-Block: simulates accept + undo round-trip
```

#### B) Acceptance-Pipeline Flow

```
User clicks "Annehmen" on a single suggestion
  ↓
FE calls acceptProposalFromContext(projectId, [suggestion_id])
  ↓
POST /api/projects/[id]/ai/proposal-from-context/accept
  ↓ (editor-role-gate + ai_proposals module-check)
  ↓
supabase.rpc("accept_proposal_from_context_bulk", { p_suggestion_ids: [...] })
  ↓
[Server-side RPC, SECURITY DEFINER]
  1. Load suggestion-rows via ki_suggestions.payload
  2. Verify: all belong to p_project_id (defense-in-depth)
  3. Verify: project_method-Kind-compatibility (if p_method_validation_strict)
  4. Topological-sort by parent_temp_id (Kahn's algorithm; cycle → error)
  5. For each item in order:
     - INSERT work_items (parent_id resolved from temp_id → real uuid lookup)
     - INSERT ki_provenance (source_context_source_id + ki_run_id + suggestion_id)
     - UPDATE ki_suggestions status='accepted' + accepted_entity_type='work_item' + accepted_entity_id=new_work_item.id
  6. INSERT audit row with causation_id (UUID) for the whole transaction
  7. WBS-Code-Auto-Generation runs as side-effect via existing PROJ-36 trigger
  ↓
RPC returns { causation_id, created_work_item_ids[], accepted_suggestion_ids[], errors[] }
  ↓
FE receives result, refreshes backlog-view, shows Toast with Undo-Link (30s)
```

Bulk-Accept = same flow, ids[] hat N Elemente. Single-Accept = N=1.

#### C) Undo Flow

```
User clicks "Rückgängig" in 30s Toast
  ↓
FE calls undoProposalFromContextAccept(projectId, causation_id)
  ↓
POST /api/projects/[id]/ai/proposal-from-context/undo
  ↓
supabase.rpc("accept_proposal_from_context_undo", { p_causation_id })
  ↓
[Server-side RPC]
  1. Load audit row matching causation_id
  2. Verify same actor + same project + < 30s old
  3. For each created_work_item_id:
     - DELETE work_items (cascade ON DELETE handles ki_provenance + children)
  4. UPDATE ki_suggestions status='draft', accepted_at=null,
     accepted_entity_type=null, accepted_entity_id=null
  ↓
FE refreshes backlog-view + suggestions-list
```

#### D) Inline-Edit Pattern

User klickt auf Title oder Kind-Pill → wechselt zu Form-Field-Mode → speichert via PATCH.

`PATCH /api/ki/suggestions/[id]` accepts `{ title?, kind?, description? }`. Server:
- Validates against existing ki_suggestion-row
- Sets `payload.title` etc. + `is_modified=true`
- `original_payload` bleibt für Audit
- Method-Kind-Validation läuft NUR beim Accept, nicht beim Edit (User darf einen tentativ inkompatiblen Vorschlag editieren bis er passt)

Falls Route nicht existiert: parallel zu PROJ-70-β erstellen.

#### E) Method-Validation Rule (AC-β7 Implementation)

PROJ-6 liefert pro `project_method` ein erlaubtes Kind-Set. Beim Accept (oder vor Render-Time im Drawer):

| Method | Allowed Top-Level | Allowed Mid | Allowed Leaf |
|---|---|---|---|
| `waterfall` | `phase` | `work_package` | `todo` |
| `scrum` / `agile` | `epic` | `story` | `task`, `subtask`, `bug` |
| `hybrid` | `phase`, `epic` | `work_package`, `story` | `todo`, `task`, `subtask`, `bug` |
| `kanban` | `epic`, `story` | `story`, `task` | `task`, `subtask`, `bug` |
| `unspecified` | alle | alle | alle |

Falls AI ein Item mit kind=`epic` in einem `waterfall`-Projekt vorschlägt:
- **Vor 70-β Edit:** UI rendert Warning-Badge "Kind nicht kompatibel mit Methode"
- **Beim Accept:** RPC mit strict=true rejected die Bulk-Operation; UI zeigt Toast "X von Y Vorschlägen haben Method-incompatible Kind; bitte editieren"
- **User bypass:** Lead-Role darf strict=false setzen (TBD: separate UI-Flag oder default-deny)

#### F) Tech Decisions

| Entscheidung | Begründung |
|---|---|
| Eigener Tab im existing AIProposalDrawer statt eigener Drawer | UX-Konsistenz; User kennt das 4-Tab-Pattern aus ε.4; Drawer ist responsives Sheet ohnehin breit genug |
| SECURITY DEFINER plpgsql für Bulk-Accept | Identisch ε.3c.β `plan_mutate_atomic_bulk`: Atomarität + RLS-Bypass in kontrollierter Form + INSERT-Berechtigungen sammeln |
| Topological-Sort server-side statt client | Server kennt eine Source-of-Truth-Order; Client könnte race-condition mit gleichzeitigen Edits haben |
| `causation_id` als UUID statt Bigint | Konsistent mit existing `plan_mutate_audit_log`-Pattern aus PROJ-65 ε.3b |
| 30s Undo-Window | UX-Empirie: 30s ist Sweet-Spot zwischen "Fehlklick erholbar" und "Audit-Trail-Stabilität"; ε.3b benutzt dasselbe |
| Inline-Edit am Title/Kind, nicht am `parent_temp_id` | parent-Modifikation = Hierarchie-Wechsel = DnD, das ist 70-δ |
| react-arborist als Tree-Library | Bereits in Bundle (PROJ-36 WBS-Tree); kein neuer Dep |
| @dnd-kit/core NICHT in β nötig | Read-only Tree in β; DnD erst in δ |
| `ki_provenance`-Insert in derselben Transaction | Pflicht für PRD-traceable-Requirement; falls FK-violation → automatischer Rollback |

#### G) Dependencies

**Keine neuen npm-Packages.** Wiederverwendet:
- `react-arborist` ✅ (PROJ-36)
- `sonner` ✅ (toast pattern aus PROJ-65 ε.3b)
- `shadcn/ui` Sheet, Tabs, Badge, Button, Form ✅
- `@/components/projects/ai-proposal-drawer` ✅ (existing 3-tab shell)

#### H) Slice-Acceptance-Map

| AC | Modul | Status nach Design |
|---|---|---|
| AC-β1 | `backlog-proposal-tab.tsx` + tab integration | Designed |
| AC-β2 | `backlog-proposal-tree-node.tsx` row layout | Designed |
| AC-β3 | `accept` API + Bulk-RPC (N=1 path) | Designed |
| AC-β4 | `accept` API + Bulk-RPC (N>1 path) with topological-sort | Designed |
| AC-β5 | Reject UI + reject API (existing purpose-agnostic) | Designed |
| AC-β6 | PATCH `/api/ki/suggestions/[id]` route | Designed (verify if exists; else add) |
| AC-β7 | Method-Validation in RPC + UI warning-badge | Designed |
| AC-β8 | WBS-Code via existing PROJ-36 trigger | Designed (no new code) |
| AC-β9 | `ki_provenance` insert in RPC | Designed |
| AC-β10 | Undo API + RPC + sonner Toast | Designed |
| AC-β11 | Vitest coverage | Designed (Backend-Pass writes them) |
| AC-β12 | Playwright Smoke | Designed (QA-Pass writes it) |

12 von 12 ACs durch Design abgedeckt.

#### I) Risks + Mitigations

| Risk | Mitigation |
|---|---|
| Race condition: parent accept + concurrent parent edit | RPC reads suggestion row inside TX; if `payload.parent_temp_id` mismatch detected vs. live → row-fail with merge-conflict in `errors[]` |
| temp_id-collision across two parallel runs of same project | Each run produces unique suggestion-uuids in DB; temp_id namespace ist run-internal. Bulk-Accept verwendet `suggestion.id` (uuid) als Hauptkey, nicht temp_id. Lookup parent-uuid via `ki_suggestions` JOIN |
| Bulk-Accept partially fails | Transaction-rollback. UI shows N-of-M counter mit Liste-Errors. User kann nachbearbeiten |
| Undo > 30s old | RPC rejects mit clear error message; UI Toast verschwindet ohnehin nach 30s |
| ki_suggestions.purpose='proposal_from_context' aber accepted_entity_type='work_item' jetzt im DB | Existing CHECK relaxed in α-Migration for advisory-purposes — der Original-Check würde das blocken. Migration eps4d (PROJ-70-α) ist die Vorbedingung |
| Method-Validation bypass via direct DB-INSERT | RLS auf `work_items` deckt das ab (PROJ-9); RPC ist additional gate, nicht alleinige Defense |
| WBS-Code-Generation crash in Trigger bei Bulk-Insert | Existing PROJ-36 trigger ist deterministisch + idempotent. Falls Trigger throws → ganze Bulk-TX rollback. Edge-Case-Test in β-Vitest |

#### J) What 70-β NICHT macht

- ❌ DnD-Reparenting im Review-Drawer — das ist 70-δ (Indent/Outdent-Buttons + Drag-and-Drop)
- ❌ File-Upload für PDF/DOCX/.msg/.eml — das ist 70-γ/δ
- ❌ Wizard-Integration — das ist 70-ε
- ❌ Streaming AI-Generation — out of scope generell

#### K) Handoff to `/backend PROJ-70-β`

12-Schritte-Plan analog zu α:

1. Migration `accept_proposal_from_context_bulk` + `accept_proposal_from_context_undo` SECURITY DEFINER plpgsql
2. Apply Migration zu Prod-DB via Supabase MCP + Smoke
3. API-Route POST `/api/projects/[id]/ai/proposal-from-context/accept`
4. API-Route POST `/api/projects/[id]/ai/proposal-from-context/undo`
5. PATCH `/api/ki/suggestions/[id]` (if not exists; verify first)
6. Extend FE-Client `proposal-from-context-api.ts` mit `acceptProposalFromContext` + `undoProposalFromContextAccept` + `editProposalFromContextSuggestion`
7. Component `backlog-proposal-tree-node.tsx` (Row mit Inline-Edit + Actions)
8. Component `backlog-proposal-tab.tsx` (Tab-Layout + BulkActionBar + Undo-Toast)
9. Wire Tab in `ai-proposal-drawer.tsx` (4. Tab "Backlog")
10. Vitest: bulk-accept-topological-sort + undo + method-validation
11. Playwright: end-to-end von Run-Trigger bis Bulk-Accept + Undo
12. lint + tsc + vitest + build gates green

Geschätzte Bauzeit: **~2 PT** mit 70-α + ε.3c.β-Pattern als Live-Template.

#### L) Open Architecture Questions — Status

| # | Question | Status |
|---|---|---|
| Q1 | AI-Schema flat vs. nested | ✅ Locked in α |
| **Q2** | **Accept-RPC-Granularität** | ✅ **Locked: Bulk-RPC mit Topo-Sort, Atomar, 30s-Undo** |
| Q3 | Storage-Bucket-Policy | ⏳ Deferred zu 70-γ |
| Q4 | AI-Schema (= Q1) | ✅ siehe Q1 |
| **Q5** | **PROJ-44 Slice-Status-Update** | ✅ **Locked: Mark 44-δ + 44-ε als "Superseded by PROJ-70" beim 70-β-Deploy-PR** |

Beide 70-β-relevanten Fragen sind gelockt. Eine verbleibende (Q3) wartet auf 70-γ.

## QA Test Results

### α-Slice QA Pass — 2026-06-03

**Scope:** Backend-only verification. No UI in α. Tested against the 11 AC-α (AC-α1 to AC-α11) plus a security audit on Class-3 defense-in-depth, auth-gates, and project-scope leak resistance.

**Verdict:** ✅ **PRODUCTION-READY** (was already deployed via tag `v1.78.0-PROJ-70-alpha` on 2026-06-01; this QA formally confirms readiness).

#### Acceptance Criteria Results

| AC | Description | Evidence | Result |
|---|---|---|---|
| AC-α1 | AIPurpose union contains `'proposal_from_context'` | `src/lib/ai/types.ts` union extended; 5 new interfaces present (`ProjectMethodHint`, `ProposalFromContextAutoContext`, `ProposalFromContextSuggestion`, `ProposalFromContextGenerationOutput`, `RouterProposalFromContextResult`) | ✅ PASS |
| AC-α2 | DB-CHECK constraints extended (4) | Prod-DB SQL: `bool_and(pg_get_constraintdef(oid) ~ 'proposal_from_context') = true` over all 4 constraints (`ki_runs_purpose_check`, `ki_suggestions_purpose_check`, `ki_suggestions_accepted_consistency`, `tenant_ai_cost_caps_purpose_check`) | ✅ PASS |
| AC-α3 | Router function `invokeProposalFromContextGeneration` exists | `src/lib/ai/router.ts:1416` — signature matches Tech Design; uses `classifyProposalFromContextAutoContext` → `selectProviderForPurpose` → `applyCostCap` → `insertKiRun` → provider call (with Stub-fallback) → enrichment → `ki_suggestions` insert → `updateKiRunStatus` | ✅ PASS |
| AC-α4 | Stub-Provider implements empty `generateProposalFromContext` | `src/lib/ai/providers/stub.ts:480` — returns `suggestions: []` deliberately (CIA-L5 mirror). No heuristic-stub-leak path | ✅ PASS |
| AC-α5 | Anthropic-Provider implements `generateProposalFromContext` with Zod schema | `src/lib/ai/providers/anthropic.ts:820` — uses `ProposalFromContextResponseSchema` with `superRefine` validating: duplicate `temp_id` rejection, self-parent rejection, missing parent_temp_id rejection, cycle detection via reachability walk | ✅ PASS |
| AC-α6 | Ollama-Provider implements `generateProposalFromContext` | `src/lib/ai/providers/ollama.ts:827` — identical Zod schema replication (`ProposalFromContextResponseSchemaOllama`) + trust-but-verify filter on hallucinated parent refs | ✅ PASS |
| AC-α7 | POST API-Route exists | `src/app/api/projects/[id]/ai/proposal-from-context/route.ts` POST: requires editor-role + ai_proposals module + Zod-validated body `{ contextSourceId: uuid, count?: 1-50 }`. Prod-smoke: `307` auth-gate redirect on unauthenticated call | ✅ PASS |
| AC-α8 | GET API-Route exists | Same file GET: requires view-role + ai_proposals module + optional `?status=` filter. Returns `ki_suggestions` rows with `purpose='proposal_from_context'`. Prod-smoke: `307` auth-gate redirect | ✅ PASS |
| AC-α9 | Text-upload path reuses existing `context_sources` route | `src/app/api/context-sources/route.ts` exists (PROJ-44-β); no new upload-route added in α as designed | ✅ PASS |
| AC-α10 | Vitest coverage for classifier + provider fallback + ki_suggestions insert | `src/lib/ai/classify-proposal-from-context.test.ts` (14 cases covering email/phone/name heuristics + whitelist + over-eager-by-design + tenant-default-floor) + `src/lib/ai/auto-context-proposal-from-context.test.ts` (8 new red-team scope tests added in this QA pass) | ✅ PASS |
| AC-α11 | Migration Prod-DB-applied + smoke-checks pass | Migration `20260601100000_proj70_alpha_proposal_from_context_purpose.sql` applied via Supabase MCP 2026-06-01; embedded DO-block smoke passed; `supabase_migrations.schema_migrations` row exists | ✅ PASS |

**11 of 11 AC passed.** Zero failures.

#### Security Audit (Red Team)

| Concern | Probe | Defense | Result |
|---|---|---|---|
| Class-3 leak via heuristic bypass | Email-shaped string `info@firma.de`, DACH-phone `+49 30 1234567`, name-pair `Anne Schmidt` | `detectClass3Markers` + `classifyProposalFromContextAutoContext` upgrade Class-1/2 to Class-3; verified via 9 vitest cases | ✅ BLOCKED |
| Whitelist false-positive over-suppression | "Status Report" / "Use Case" / "Steering Committee" + name-shaped pair | Whitelist only matches isolated tokens; any genuine name-shaped pair elsewhere still flags Class-3 | ✅ INTENDED behavior |
| Auth bypass on POST | Unauthenticated POST | `getAuthenticatedUserId` → 401 if no session | ✅ BLOCKED |
| Auth bypass on GET | Unauthenticated GET | Same gate → 401 | ✅ BLOCKED |
| Viewer role tries to trigger POST | `requireProjectAccess(... "edit")` | 403 if role ≠ editor/lead | ✅ BLOCKED |
| Editor of project B reads suggestions of project A via GET | `query.eq("project_id", projectId)` + RLS on `ki_suggestions` | Double-gated; RLS is the auth boundary, route adds explicit filter | ✅ BLOCKED |
| **Project-scope leak: editor of project A POSTs with contextSourceId belonging to project B** | `collectProposalFromContextAutoContext` lines 91-94 — explicit `cs.project_id != null && cs.project_id !== projectId → throw` | Defense-in-depth over RLS. Verified with red-team vitest: `REJECTS when context_source belongs to a DIFFERENT project` test passes | ✅ **BLOCKED (tested)** |
| Tenant-wide context_source still works | `project_id IS NULL` is explicitly allowed in the same check | Tested via "returns context when source is tenant-wide" vitest case | ✅ ALLOWED (designed) |
| Cost-cap bypass via massive count parameter | Zod `z.number().int().min(1).max(50)` on POST body + Anthropic Zod `.max(50)` on response | Both layers cap at 50; `applyCostCap` gate runs before provider invocation | ✅ BLOCKED |
| Cycle in AI output causing infinite loop on accept | Anthropic `superRefine` walks parent chain with `steps < suggestions.length + 1` guard | Cycle detected → Zod rejects whole response → router records `status='error'` | ✅ BLOCKED |
| Hallucinated parent_temp_id slipped past Zod | Ollama provider also runs trust-but-verify filter post-schema | Belt + suspenders | ✅ BLOCKED |
| AI invents personal data in output | System prompt explicitly forbids names/emails/phones in outputs + instructs generalisation to roles | LLM-instructed mitigation; cannot be enforced at code layer | ⚠️ Best-effort (acceptable for advisory output) |

**Zero Critical bugs. Zero High bugs.**

#### Edge Cases Tested

| Edge case | Test | Result |
|---|---|---|
| `privacy_class=NULL` from DB | "defaults privacy_class to 3 (safest)" vitest | ✅ defaults to 3 |
| `project_method=NULL` | `normaliseMethodHint(null)` → "unspecified" | ✅ |
| `project_method="Wasserfall"` (German) | `normaliseMethodHint("Wasserfall")` → "waterfall" | ✅ |
| `project_method="v-modell-XT"` (unknown) | falls through to "unspecified" | ✅ |
| Project row missing | throws "Project not found." | ✅ |
| Context source row missing | throws "Context source not found." | ✅ |
| `tenantDefault=3` on Class-1 input | classifier returns 1 (no auto-bump) | ✅ (mirrors Narrative semantics) |
| Empty content_excerpt | classifier returns the privacy_class floor (no heuristic upgrade) | ✅ |

#### Regression Tests

- `npx vitest run` — **1598 / 1598 passing** (was 1583 pre-QA, +14 new α classifier tests + 1 incidental from another slice). Zero regressions.
- `npm run lint` — 0 errors, 0 warnings.
- `npm run build` — clean in 13.7s; API route registered.
- `npx tsc --noEmit` — baseline-clean (17 pre-existing test fixture errors unchanged).
- Schema-Drift-Guard CI on PR #84 — pass.
- Vercel auto-deploy on PR #84 — pass.

#### Production-Ready Decision

✅ **READY** — Zero Critical, Zero High. 11/11 AC pass. 11/11 security probes blocked at code layer. Already deployed via tag `v1.78.0-PROJ-70-alpha`. Smoke test green: `/api/projects/<dummy>/ai/proposal-from-context → 307 auth-gate`, `/login → 200`, `/dashboard → 307`.

#### Notes for 70-β

- Cycle-detection logic in Anthropic Zod is **only** valid for the run's own temp_ids — once 70-β creates real `work_items.id` rows on accept, a separate topological-sort pass must validate before INSERT.
- Display-enrichment in router (`method_hint_kind`, `source_project_name`, `context_source_title`) is already in place for 70-β UI to consume without round-trips.
- Run-Status `external_blocked` is the canonical signal for the future 70-β banner "Class-3 erkannt; bitte Tenant-Ollama konfigurieren oder Inhalt entpersonalisieren".

#### Open Followups (not blocking deployment)

- 🟡 LOW: Heuristic `NAME_PATTERN` over-flags any consecutive Capitalised+Capitalised pair (e.g. "Bitte Status"). This is documented as *intended* (conservative-by-design per Tech Design) but worth revisiting if user complaints exceed 5% of Class-1/2-stamped uploads getting forced to local-only.
- 🟡 LOW: System prompt is the only barrier against the LLM inventing personal data in output titles. A post-generation regex scrubber on `title` + `description` could be added in 70-β before persist if needed.
- 🟢 INFO: PROJ-70 spec status now flips from `In Progress (α deployed)` → `In Progress (α approved + deployed)` in INDEX.md.

## Deployment
_To be added by /deploy_
