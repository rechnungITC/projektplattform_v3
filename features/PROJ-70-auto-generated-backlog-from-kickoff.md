# PROJ-70: Auto-Generated Backlog from Project Kickoff

## Status: Planned
**Created:** 2026-05-31
**Last Updated:** 2026-05-31
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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
