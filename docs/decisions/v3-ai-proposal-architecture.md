# Decision — V3 AI-Vorschlags-Architektur (Vorschlag-Layer-Schema)

Status: **accepted**
Datum: 2026-04-26
V3-Original (konkretisiert V2 ADR `architecture-principles.md` Punkt „AI as proposal layer")

## Kontext

V2 ADR [`architecture-principles.md`](architecture-principles.md) und [`data-privacy-classification.md`](data-privacy-classification.md) etablieren:
- AI ist eine **Vorschlagsschicht** — schreibt nicht direkt in Domain-Daten.
- Jeder AI-Output muss **traceable** sein (Quellkontext + Modell + Confidence).
- Klasse-3-Daten (PII) dürfen externe Modelle nicht verlassen.

Aktuell: V3 hat **kein einziges AI-Feature** und **keine Schema-Konvention** für AI-Outputs. PROJ-12 (KI-Assistenz) ist der designierte Implementer, aber bevor PROJ-9/PROJ-13/PROJ-15 ihre Tabellen anlegen, müssen sie wissen: kommen AI-Vorschläge als zusätzliche Spalten oder als separate Tabelle?

**Wenn wir das nicht jetzt entscheiden, müssen wir später jede Domain-Tabelle nachträglich um AI-Felder ergänzen — Retrofit über 5+ Tabellen.**

## Decision

V3 führt eine **zentrale `ai_proposals`-Tabelle** ein (statt pro-Domain-Spalten). Vorschläge werden **als separate Rows** dort abgelegt; bei Annahme („accept") wird der Inhalt in die Ziel-Domain-Tabelle übertragen, der Vorschlag bleibt als Audit-Spur stehen.

```
ai_proposals
├── id                    UUID PK
├── tenant_id             UUID NOT NULL FK tenants
├── target_table          TEXT NOT NULL ('tasks' | 'risks' | 'stakeholders' | 'decisions' | 'work_items' | 'projects' | ...)
├── target_row_id         UUID nullable (NULL = Vorschlag für eine NEUE Row)
├── proposed_payload      JSONB NOT NULL — die vorgeschlagenen Felder als Key-Value
├── source_kind           TEXT NOT NULL ('email' | 'document' | 'meeting_note' | 'manual' | 'rule_engine')
├── source_ref            JSONB nullable — z.B. { document_id: '...', span_start: 23, span_end: 412 }
├── model                 TEXT NOT NULL — z.B. 'claude-opus-4', 'local-llama-3.1-8b'
├── confidence            NUMERIC(4,3) — 0.000 bis 1.000
├── data_class            SMALLINT NOT NULL CHECK (data_class IN (1,2,3))
├── review_state          TEXT NOT NULL DEFAULT 'pending' CHECK (review_state IN ('pending','accepted','rejected','modified'))
├── reviewed_by           UUID nullable FK profiles
├── reviewed_at           TIMESTAMPTZ nullable
├── modified_payload      JSONB nullable — was der Reviewer effektiv übernommen hat (kann ≠ proposed_payload sein)
├── created_at, updated_at, is_deleted (soft-delete)
```

## Verhalten

1. **Erzeugung**: Eine Edge Function (oder ein Job) ruft Claude/local-LLM, validiert das Output-Schema, klassifiziert Datenklasse, schreibt eine Row mit `review_state='pending'`. Klasse-3-Daten **dürfen niemals an externe Modelle gegangen sein** — Funktionsroutung enforced das (siehe `data-privacy-classification.md`).
2. **Review-UI** (Teil von PROJ-12): listet `pending`-Vorschläge gefiltert nach `target_table`/`tenant_id`. Reviewer entscheidet:
   - **Accept**: kopiert `proposed_payload` (oder bei „Modified": `modified_payload`) in die Ziel-Tabelle, setzt `review_state`.
   - **Reject**: nur Status-Update.
3. **Audit**: `ai_proposals` ist **append-mostly** — Updates nur an `review_state`, `reviewed_by`, `reviewed_at`, `modified_payload`, `updated_at`. Keine Löschungen außer Soft-Delete. Klasse-3-Vorschläge können bei DSGVO-Anfrage redacted werden (PROJ-17).

## RLS

- **SELECT**: tenant member (jede Rolle) — Vorschläge sind transparent.
- **INSERT**: nur `service_role` (Edge Function) und `authenticated` für `source_kind='manual'` (Mensch schlägt Mensch was vor).
- **UPDATE**: `authenticated` mit Berechtigung auf das `target_table` — z.B. wer ein Projekt editieren darf, darf einen `target_table='projects'`-Vorschlag akzeptieren.
- **DELETE**: nie direkt; Soft-Delete via Update.

## Warum zentrale Tabelle (statt pro-Domain-Spalten)

| Argument | Zentrale Tabelle | Pro-Domain-Spalten |
|---|---|---|
| Schema-Stabilität bei neuen Domains | ✅ keine Änderung an Ziel-Tabellen | ❌ jede neue Tabelle → AI-Spalten ergänzen |
| Review-UI | ✅ ein Endpoint, ein Hook | ❌ pro Domain ein Endpoint |
| Reporting („wie viele Vorschläge angenommen") | ✅ ein simples GROUP BY | ❌ über N Tabellen joinen |
| Datenmodell-Diskussion pro Feature | ✅ trivial | ❌ jedes Feature klärt das neu |
| Direktes Filtern „zeig mir alle aktiven Risks" | ✅ unverändert (Risks sind weiterhin in `risks`) | ✅ aber gemischt mit Pending-Daten |
| Skalierung bei sehr vielen Vorschlägen | ⚠ Tabelle wächst — Indexe + Partitionierung später nötig | ✅ pro-Tabelle natürlicher Cap |

Trade-off: bei Hyperscale (>10M Vorschläge/Jahr) wird die zentrale Tabelle zum Hotspot. Damit lösen wir uns dann einen Tag — bis dahin ist die zentrale Variante DRYer und sicherer.

## Beziehung zu existierenden Tabellen

- **Beim Annehmen** wird ein Eintrag in `ai_proposals` zu einer Row in `tasks`, `risks`, etc. Diese hat dann eine optionale Spalte `created_from_proposal_id UUID FK ai_proposals` — so dass jede Domain-Row ihren AI-Ursprung nachschlagen kann.
- **Manuelle Erstellung** (Mensch tippt Task ein) → `created_from_proposal_id IS NULL`.

Das ist die **einzige** AI-bezogene Spalte in jeder Domain-Tabelle. Klein, opt-in, nicht-pflicht.

## Beispiel-Flow (Task aus Email)

1. Eingehende Email für Tenant T, Projekt P → Edge Function `ingest-email`
2. Claude analysiert, schlägt 2 Tasks vor → 2 Rows in `ai_proposals` mit `target_table='tasks'`, `target_row_id=NULL`, `proposed_payload={title, description, ...}`, `source_kind='email'`, `source_ref={message_id}`
3. PM öffnet Review-Inbox → sieht beide → akzeptiert eine, modifiziert die andere („title kürzer"), lehnt nichts ab
4. Bei Accept: `INSERT INTO tasks (...) VALUES (...) RETURNING id` + `ai_proposals.review_state='accepted'`, `task.created_from_proposal_id=<proposal_id>`

## Konsequenzen

**Vorteile:**
- Alle nachfolgenden Domain-Specs (PROJ-7, PROJ-8, PROJ-9, PROJ-13, PROJ-15) brauchen nur **eine** AI-Spalte (`created_from_proposal_id`) statt eines AI-Block — ihre Architektur-Phase ist 80% schneller.
- Review-UX ist konsistent: ein Mailbox-Pattern, egal ob Task, Risk oder Stakeholder vorgeschlagen wird.
- DSGVO-Redaction lebt zentral.

**Trade-offs:**
- Indizes auf `(tenant_id, target_table, review_state, created_at)` werden mit Wachstum wichtig.
- Vorschläge mit komplexer Mehrfach-Tabellen-Wirkung (z.B. „erstelle Phase + 5 Tasks atomar") brauchen einen Wrapper — entweder Composite-Vorschlag in `proposed_payload` oder ein Group-Konzept (`proposal_group_id`). Vorerst: nur einfache Single-Target-Vorschläge.

## Out of Scope (deferred)

- Vorschlags-Gruppen (atomare Mehrfach-Vorschläge)
- Vorschlags-Versionen (mehrere AI-Outputs für dieselbe Source — wer übernimmt, wer wirft weg)
- Auto-Accept-Schwellwert (Confidence ≥ 0.95 → automatisch akzeptiert) — bewusst manuell, bis Vertrauen aufgebaut

## Related

- [architecture-principles.md](architecture-principles.md) — Quelle des „AI as proposal layer"-Prinzips
- [data-privacy-classification.md](data-privacy-classification.md) — Klassifikation muss vor jeder Erzeugung geprüft werden
- [metadata-model-context-sources.md](metadata-model-context-sources.md) — Quellkontext-Format passt zu `source_ref`
- PROJ-12 (KI-Assistenz) — Implementer dieser ADR
