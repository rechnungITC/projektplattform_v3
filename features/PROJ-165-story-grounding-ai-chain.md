# PROJ-165 — Portfolio-Erdung Tranche 1: die KI-/Skill-Kette PROJ-81–84

## Status: In Review
## Deployment Scope: —

**Created:** 2026-09-01

## Problem

Vier Stories der Skill-/KI-Kette standen seit dem **2026-06-07** unverändert, während seither rund
90 Slices ausgeliefert wurden — darunter PROJ-77 (Skill-Customizing, komplett), PROJ-78
(Skill-Projektzuordnung), PROJ-79-α (DMS), PROJ-80-α (Extraktion und Quintessenz), PROJ-130 (Audit-Trail
über fünf Sub-Slices), PROJ-137 (Reason-Codes), PROJ-151 (Projekt-Chat) und PROJ-153 (Arbeitspakete
aus dem Vorhaben).

Die Erfahrung dieses Repos ist bei genau dieser Konstellation ausnahmslos dieselbe: PROJ-45-α fand
„L3s Begründung ist zur Hälfte überholt", PROJ-80 „fünf Spec-Annahmen halten nicht mehr",
PROJ-Y-114a „der externe Dokumentenverweis ist seit PROJ-115 bereits erfüllt". Eine Spec, die drei
Monate ungelesen liegt, verspricht Arbeit, die teils schon getan und teils nicht mehr baubar ist.
Wer sie ungeprüft in `/architecture` gibt, baut Doppelarbeit oder läuft in eine gesperrte
Abhängigkeit.

## Was gemessen wurde, und wie

Gegen **Code und Migrationsdateien** am 2026-09-01, nicht gegen Prod. Für „existiert das Primitiv"
trägt das; für Zeilenzahlen bräuchte es eine Live-Abfrage, und keine wird behauptet.

## Die vier Urteile

### PROJ-81 — hält fachlich, ist nicht baubar

`document_chunks`, der wörtliche Durchsetzungspunkt der Story, hat **0 Treffer** in
`supabase/migrations/` **und** in `src/`. PROJ-80-β (Vektorindex, Chunking, Retrieval) ist
zurückgestellt; das ausgelieferte PROJ-80-α ist ausdrücklich „Quintessenz **ohne** Vektor". Zwei der
drei Bausteine sind da (`project_skills` aus PROJ-78, `skill_knowledge_links` aus PROJ-77-γ).

**Geändert:** nur die Abhängigkeitsangabe (`PROJ-80` → **`PROJ-80-β`**) und ein Sperrhinweis im Kopf.
Kein Akzeptanzkriterium angefasst — die Story ist nicht überholt, sie ist gesperrt.

### PROJ-82 — Kern dringender, Umfang überholt → α + β

Der Kern (`allowed_actions` **durchsetzen**) ist offen und wurde am 2026-08-28 von PROJ-153s
CIA-Pass ausdrücklich hierher verwiesen. Dort ist auch gemessen, dass die Zusage „Skill ist
Ergänzung, kein Ersatz" heute eine **Positionskonvention statt eines Mechanismus** ist und nur trägt,
solange es kein Tool-Calling gibt (0 Stellen, unabhängig nachgemessen).

Überholt ist der Umfang: **PROJ-77-α hat das Action-Enum am 2026-07-24 ausgeliefert** und anders
geschnitten — `src/lib/skills/allowed-actions.ts` trägt **acht** Werte, die Spec nannte sieben,
darunter zwei nicht existierende (`propose_acceptance_criteria`, `propose_dependency`), und drei
ausgelieferte kannte sie nicht. Dazu ist ihr Action-Vokabular ein **paralleles Register** zu den
heute 17 `AIPurpose`-Werten, und die Abbildung ist nicht eins-zu-eins.

**Geändert:** Enum-Kriterium durchgestrichen mit Begründung und auf die ausgelieferte Autorität
verwiesen; α (Mandatsdurchsetzung ohne Retrieval) von β (RAG-gestützt) getrennt; `rag_scope_size`
nach β verschoben, weil eine konstant leere Spalte von „nicht gemessen" nicht zu unterscheiden ist;
drei Fragen ausdrücklich für `/architecture` offen gelassen.

### PROJ-83 — halb vorweggenommen → α + β

Drei Bausteine existieren: `generate_document` im ausgelieferten Enum; `documents.ai_generated`
**und** `ai_generated_metadata` seit PROJ-79-α (`…proj79_dms_foundation_alpha.sql:132`); die
Konversationsebene als PROJ-151 (dort per Lock rein lesend). Auch der DMS-Schreibweg ist gelöst —
PROJ-Y-45q hat die enge `SECURITY DEFINER`-Aufnahme gebaut, weil PROJ-79s Policy nur `lead`/`editor`
einfügen lässt.

**Ein Fallstrick benannt, der Arbeit gekostet hätte:** `work_item_documents` ist **trotz seines
Namens keine DMS-Verknüpfung** (PROJ-45-γ hat gemessen: `kind/title/body/checklist`).

**Geändert:** Persistenz-Kriterium auf „vorhandene Spalte füllen" statt „Spalte anlegen"; Chat auf
PROJ-151-Wiederverwendung; Verknüpfungs-Kriterium um den Fallstrick und das richtige Vorbild
ergänzt; α (inkl. Prompt-Export ganz ohne Modellaufruf) von β getrennt.

### PROJ-84 — überwiegend erfüllt, ein Kriterium widerlegt

- `ki_runs` trägt **11 der 14** Felder des geforderten `ai_action_logs`; `reason_code` (PROJ-137) ist
  zusätzlich und schärfer als das gedachte `payload`. Eine neue Tabelle wäre eine zweite Wahrheit.
- `ki_provenance.was_modified` **ist** der geforderte „von Nutzer überarbeitet"-Indikator.
- `documents.ai_generated`/`ai_generated_metadata` **sind** die Herkunftsachse; ein `ai_origin`
  daneben wäre eine zweite Spalte gleicher Bedeutung — die Klasse PROJ-Y-130s.
- Der Export existiert mit Redaktion, Admin-Vorbehalt für `redaction_off` und Revisorenzugang
  (PROJ-130-γ4/γ2); es fehlt ein KI-Filter.
- Das Badge existiert **funktional, aber dreifach kopiert** (`work-item-detail-drawer.tsx:440`,
  `audit/history-tab.tsx:60`, `participant-pills-strip.tsx:56`).
- **Widerlegt, nicht bloß überholt:** „Retention 24 Monate" widerspricht PROJ-130s PO-Lock
  „unbegrenzt, kein Purge" — `/api/cron/apply-retention` antwortet nachweislich
  `audit_purge: "disabled"`. Ein KI-Protokoll mit Frist hätte die Zusage „der Trail hat keinen
  Löschpfad" an einer Nebentür aufgehoben.

**Geändert:** vier Kriterien durchgestrichen und ersetzt, jeweils mit der Messung, die sie widerlegt;
Restumfang benannt (vier Felder an `ki_runs`, ein KI-Filter, **ein** Badge statt drei); offen
gelassen, ob `budgets`/`phases`/`milestones` überhaupt einen Marker brauchen, weil es für sie keinen
KI-Erzeugungspfad gibt.

## Akzeptanzkriterien

- **AC-165.1** — Jede der vier Specs trägt einen datierten Abschnitt „Geerdet am 2026-09-01" mit den
  Messungen als Tabelle und einem ausgesprochenen Urteil.
- **AC-165.2** — Jedes geänderte Akzeptanzkriterium ist **durchgestrichen und begründet**, nicht
  stillschweigend ersetzt; der ursprüngliche Wortlaut bleibt lesbar (Hausform, vgl. PROJ-155-β).
- **AC-165.3** — Keine Spec erfindet ein Register neu, das ausgeliefert existiert: PROJ-82 verweist
  auf `src/lib/skills/allowed-actions.ts` als Autorität, PROJ-84 auf `ki_runs` und
  `ai_generated_metadata`.
- **AC-165.4** — Jede blockierte Abhängigkeit nennt die **Sub-Slice**, nicht nur das Feature
  (`PROJ-80-β`, nicht `PROJ-80`).
- **AC-165.5** — Die vier INDEX-Zeilen tragen das Urteil, damit es ohne Spec-Öffnen sichtbar ist.
- **AC-165.6** — Was **nicht** entschieden wurde, ist je Story ausdrücklich benannt statt implizit
  offengelassen.
- **AC-165.7** — Kein `src/`-Diff, keine Migration, kein Paket; alle fünf Datei-Wächter grün.

## Bewusste Abweichungen und Grenzen

- **D-165.1:** gemessen an Code und Migrationsdateien, **nicht** gegen Prod. Begründet: die Urteile
  hängen an Existenz von Primitiven, nicht an Datenmengen. Wo eine Aussage eine Live-Zahl bräuchte,
  ist sie nicht getroffen.
- **D-165.2:** die Erdung **löst keine** der offenen Architekturfragen. Sie stellt sie sichtbar —
  drei bei PROJ-82, zwei bei PROJ-83, eine bei PROJ-84. Eine Erdung, die nebenbei Architektur
  entscheidet, nimmt `/architecture` seine Aufgabe und dem Nutzer seine Entscheidung.
- **D-165.3:** `PROJ-153` und `PROJ-160` sind **nicht** angefasst — beide `In Progress` bei anderen
  Spuren.
- **D-165.4:** kein CIA-Pass. Keine Technologie, keine Migration, kein `src/`-Diff. Die Neuschnitte
  α/β **könnten** bei `/architecture` einen Pass auslösen (PROJ-82-α berührt die
  Mandatsdurchsetzung, für die PROJ-153s Pass eine Auflage formuliert hat) — das ist dort zu
  entscheiden, nicht hier.
- **D-165.5:** Tranchen 2–4 (spec-lose Followups 71/72/73 · PROJ-133 · PROJ-Y-148b-Entscheidung ·
  M&A 121/123–127 · PROJ-46) sind **nicht** Teil dieser Slice.

## Nachweise

- Vier Specs geändert, jede mit Anker-Prüfung `count == 1` vor jeder Ersetzung — eine mehrfach
  passende Ersetzung hätte sonst still die falsche Stelle getroffen (die Klasse, an der PROJ-Y-115c
  in Prod traf und im Fresh-Apply brach).
- Messungen einzeln reproduzierbar: `document_chunks` 0 Treffer · `SKILL_ALLOWED_ACTIONS` 8 Werte ·
  `AIPurpose` 17 Werte · `originating_skill_id`/`conflict_group_id`/`rag_scope_size`/
  `skill_conflict_mode`/`ai_action_logs`/`ai_origin`/`task_document_links` je 0 Treffer ·
  `ai_generated_metadata` 3 Treffer (Migration + Typ + Select) · `audit_purge: "disabled"` in
  `src/app/api/cron/apply-retention/route.ts:45`.
- Umfang: `src/` 0 Dateien, `supabase/migrations/` 0, `package.json` 0, `package-lock.json` 0.
