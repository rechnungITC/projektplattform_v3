# PROJ-75: Class-3-Re-Classification nach Parse

## Status: Deployed (2026-07-21, Tag `v2.15.0-PROJ-75`)
## Deployment Scope: mvp
**Zum Scope (klassifiziert 2026-08-13):** `mvp`, nicht `full`. Der **Ingestion-Pfad** ist vollstaendig und fail-closed ausgeliefert und schuetzt jeden neuen Upload (AC-75.1–75.5, 75.13/75.14). Der Block **„Backfill (Bestands-Rows)" (AC-75.6–75.10) ist deployed, aber gegen die realen Zeilen nie ausgefuehrt** — D-1 unten nennt genau das als nachzuholenden Deploy-Verify, und AC-75.10 verlangt eine Kennzahl *nach* dem Backfill, die es daher nicht gibt. Damit ist eine originaere Anforderung unerfuellt: kein `full`. Die Omission ist als **PROJ-Y-75a** registriert.
**Created:** 2026-07-21
**Last Updated:** 2026-07-21

> CIA-Followup **Y-5** aus PROJ-70-γ (2026-06-04). DSGVO-relevant. Schließt die
> Lücke, dass die Privacy-Klassifikation von Context-Sources nur auf einem
> gekappten Ausschnitt läuft und personenbezogene Daten im restlichen Dokument
> übersieht.

## Problem (live belegt im Code)

Beim Upload einer Context-Source (`POST /api/context-sources`, Multipart-Pfad)
läuft die Kette:

1. `parseFile(buffer, mimeHint)` liefert ein **auf 8000 Zeichen gekapptes**
   `content_excerpt` (`EXCERPT_MAX_CHARS = 8_000` in
   `src/lib/context-ingestion/file-parser.ts`) plus `raw_length` und ein
   `truncated`-Flag.
2. `classifyContextSourcePrivacy({ title, content_excerpt: excerpt })`
   (`src/lib/context-sources/classify-privacy.ts`) prüft die Class-3-/Class-2-
   Regex **ausschließlich auf diesem 8000-Zeichen-Excerpt** (+ Titel).
3. Die Zeile wird mit `privacy_class` aus dieser Klassifikation persistiert; die
   **vollständige Originaldatei** landet im Storage-Bucket `context-source-uploads`.

**Folge:** Enthält ein Dokument personenbezogene Daten (E-Mail, Telefonnummer,
IBAN, SSN) **erst jenseits von Zeichen 8000** — z. B. eine Unterschriftszeile,
ein Verteiler oder ein Anhang auf einer späteren Seite — sieht der Klassifizierer
diese PII nicht. Das Dokument wird fälschlich als Class-1/2 eingestuft und darf
damit an ein **externes Cloud-Modell** geschickt werden (Invariante #3 greift
nur für Class-3). Das ist ein DSGVO-Verstoß-Risiko. Betroffen sind
**ausschließlich `truncated`-Dokumente**; Dokumente unter 8000 Zeichen werden
bereits vollständig geprüft.

## Ziel / Lösungsrichtung (User-locked)

- Die Privacy-Klassifikation muss den **Volltext** des geparsten Dokuments
  widerspiegeln, nicht nur das gekappte Excerpt — **bevor** `privacy_class`
  persistiert wird und **bevor** irgendein externer KI-Aufruf möglich ist.
- **Fail-closed, kein Restrisiko:** Ein Dokument, das **nicht vollständig**
  gescreent werden kann (z. B. PDF ≤ 200 Seiten, dessen Text die 2-MB-Extraktion
  überschreitet und heute still abgeschnitten wird), wird **abgewiesen** — nie mit
  teilweise geprüftem Inhalt akzeptiert. „Fully screened or rejected."
- **Datei behalten, kein Hard-Delete:** Wird Class-3 erkannt, bleibt die Datei
  im Bucket; das KI-Routing erzwingt Ollama-only (Invariante #3). Kompatibel mit
  DMS/RAG (PROJ-79/80), die das Original brauchen.
- **Backfill:** Bereits ingestierte Rows, die auf dem Excerpt klassifiziert
  wurden und `truncated` sind, werden über den Volltext nachgeprüft.
- **Fail-safe = Bestand belassen + markieren:** Kann der Volltext für eine
  Bestands-Zeile nicht sicher abgeleitet werden (Re-Parse-Fehler, fehlende
  Datei), bleibt die bestehende Klasse unverändert und die Zeile wird als
  **`classification_unverified`** markiert für spätere manuelle Prüfung — kein
  stiller Fehler, keine Massen-Falsch-Positive.

## Dependencies
- Requires: **PROJ-70** (Context-Ingestion-Pipeline: `file-parser`, Storage,
  Upload-Route) — der Pfad, der nachgebessert wird.
- Requires: **PROJ-44** (`classify-privacy.ts` — der regex-basierte Klassifizierer).
- Requires: **PROJ-12** (KI-Privacy-Pfade / Class-3-Hardblock, Invariante #3) —
  bleibt unverändert; diese Slice erweitert nur die Klassifikations-*Eingabe*.
- Related: **PROJ-71** (OCR für Scan-PDFs) und **PROJ-72** (Streaming-Parse) —
  behandeln die verbleibenden Grenzen (bildbasierte PII, sehr große Dateien),
  die hier bewusst *out of scope* bleiben.

## User Stories
- Als **Datenschutzbeauftragte:r / Tenant-Admin** möchte ich, dass ein Dokument
  mit personenbezogenen Daten irgendwo im Text als Class-3 erkannt wird — nicht
  nur wenn die PII in den ersten 8000 Zeichen steht —, damit keine
  personenbezogenen Daten versehentlich an ein externes Cloud-Modell gelangen.
- Als **Projektleiter:in**, die ein Kickoff-Dokument hochlädt, möchte ich, dass
  die Privacy-Einstufung dem gesamten Dokument entspricht, damit ich mich auf das
  „Class-3 → Ollama-only"-Verhalten verlassen kann, ohne das Dokument selbst zu
  prüfen.
- Als **Datenschutzbeauftragte:r** möchte ich, dass bereits hochgeladene
  Dokumente rückwirkend über ihren Volltext nachgeprüft werden, damit die im
  Bestand bereits entstandene Fehlklassifikation korrigiert und sichtbar wird.
- Als **Security-Reviewer** möchte ich, dass die Re-Klassifikation selbst
  regex-basiert und ohne LLM läuft, damit der Vorgang keine neue Class-3-
  Exfiltration einführt.
- Als **Betreiber** möchte ich nach dem Backfill eine Kennzahl sehen, wie viele
  Zeilen hochgestuft bzw. als unverifiziert markiert wurden, damit die
  DSGVO-Exposure quantifiziert ist.

## Acceptance Criteria

### Ingestion-Zeit (neue Uploads)
- [ ] **AC-75.1** Beim Multipart-Upload läuft `classifyContextSourcePrivacy`
      über den **vollständig geparsten Text** des Dokuments (bis zu den bereits
      bestehenden Parse-Grenzen), nicht nur über das 8000-Zeichen-Excerpt. Die
      Klassifikation ist abgeschlossen und persistiert, **bevor** die Zeile für
      irgendeinen externen KI-Aufruf verfügbar ist.
- [ ] **AC-75.2** Ein Dokument, dessen einziger PII-Marker (z. B. eine E-Mail)
      **jenseits von Zeichen 8000** liegt, wird als `privacy_class = 3`
      eingestuft. (Regressions-Fixture: ~8000 Zeichen unbedenklicher Text +
      E-Mail bei ~Zeichen 9000.)
- [ ] **AC-75.3** `content_excerpt` bleibt unverändert auf 8000 Zeichen gekappt —
      was gespeichert und angezeigt wird, ändert sich nicht; **nur die
      Klassifikations-Eingabe** wird auf den Volltext erweitert.
- [ ] **AC-75.4** `privacy_class` wird **nur monoton hochgestuft** (defense-in-
      depth): Die Volltext-Klassifikation darf die Klasse gegenüber dem
      Excerpt-Ergebnis, dem DB-Default (3) und einem manuellen Stempel **nur
      erhöhen, nie senken** (`GREATEST`-Semantik).
- [ ] **AC-75.5** Ein Dokument **unter 8000 Zeichen** (`truncated = false`)
      liefert ein identisches Ergebnis wie bisher (Volltext == Excerpt) und wird
      **nicht** als unverifiziert markiert.

### Backfill (Bestands-Rows)
- [ ] **AC-75.6** Ein re-runnbarer, tenant-sicherer Backfill prüft bestehende
      `context_sources`-Zeilen, die als `truncated` markiert sind, über ihren
      Volltext (aus der Storage-Datei) nach.
- [ ] **AC-75.7** Zeilen, deren Volltext Class-3-Marker enthält, werden auf
      `privacy_class = 3` hochgestuft; die **Storage-Datei bleibt erhalten**
      (kein Hard-Delete), und das KI-Routing erzwingt fortan Ollama-only.
- [ ] **AC-75.8** Kann der Volltext einer **Bestands-Zeile** nicht sicher
      abgeleitet werden (Re-Parse-Fehler, fehlende/gelöschte Storage-Datei),
      bleibt die bestehende `privacy_class` **unverändert** und die Zeile wird als
      **`classification_unverified`** markiert; der Fehlschlag wird protokolliert
      (nicht still verschluckt). **Dies ist ein bewusst sichtbar gemachtes,
      manuell zu prüfendes Residual im Bestand** — kein *stilles* Restrisiko: die
      markierten Zeilen müssen für die DSGV-Prüfung (AC-75.10) abfragbar sein.
      (Der **Ingestion-Pfad** ist durch AC-75.13/14 fail-closed und trägt kein
      Residual.)
- [ ] **AC-75.9** Der Backfill ist **idempotent**: bereits erfolgreich
      re-klassifizierte Zeilen werden bei erneutem Lauf übersprungen; ein zweiter
      Lauf erzeugt keine abweichenden Ergebnisse.
- [ ] **AC-75.10** Nach dem Backfill wird eine Kennzahl ausgegeben:
      Anzahl geprüfter / hochgestufter / als unverifiziert markierter Zeilen.

### Fail-closed: kein unvollständig gescreentes Dokument (KEIN Restrisiko)
- [ ] **AC-75.13** Ein Dokument, dessen Inhalt **nicht vollständig** auf PII
      gescreent werden konnte, wird **abgewiesen** (HTTP 422) — es wird **nie mit
      teilweise geprüftem Inhalt ingestiert**. Insbesondere: der bisherige stille
      `break` in der PDF-Textextraktion bei Überschreiten von
      `MAX_PLAINTEXT_RAW_BYTES` (2 MB) — der aktuell partiellen Text mit
      `truncated: true` zurückgibt und die Zeile trotzdem anlegt — wird zu einem
      harten Reject (`raw_text_cap_exceeded`), **einheitlich** mit dem bestehenden
      Verhalten für DOCX/TXT > 2 MB und PDF > 200 Seiten.
- [ ] **AC-75.14** „Fully screened or rejected": Nach Abschluss von AC-75.13 gilt
      für **jede** erfolgreich ingestierte Zeile, dass ihr **vollständiger**
      geparster Text (nicht nur ein Präfix) den Klassifizierer durchlaufen hat.
      Es gibt auf dem Ingestion-Pfad **kein** akzeptiertes Dokument mit
      ungescreentem Textanteil. (Regressions-Fixture: PDF ≤ 200 Seiten mit > 2 MB
      extrahierbarem Text → 422, keine `context_sources`-Zeile, keine Storage-Datei.)

### Sicherheit / Invarianten
- [ ] **AC-75.11** Die Re-Klassifikation (Ingestion **und** Backfill) läuft
      **regex-only, ohne jeden LLM-Aufruf** — konsistent mit `classify-privacy.ts`.
      Es wird kein Dokumentinhalt an ein externes Modell gesendet.
- [ ] **AC-75.12** Der Class-3-Hardblock (Invariante #3) und der `privacy_class`-
      DB-Default (3) bleiben unverändert; diese Slice **schwächt keine** bestehende
      Schutzschicht ab, sie verbreitert nur die Prüf-Eingabe.

## Edge Cases
- **Grenzfall genau 8000 Zeichen:** Dokument mit Länge == Cap → `truncated`
  false → Volltext == Excerpt → keine Änderung, keine Unverifiziert-Markierung.
- **Volltext über bestehende Parse-Grenzen** (DOCX/TXT-Rohtext-Cap 2 MB, PDF
  Seiten-Cap 200, PDF-Extraktion > 2 MB): Solche Dokumente werden **abgewiesen**
  (422, AC-75.13) statt mit partiellem Text akzeptiert → **kein ungescreenter
  Textanteil gelangt je in die Persistenz**. Damit ist die frühere „PII jenseits
  der Parse-Caps"-Grenze **kein Restrisiko mehr** auf dem Ingestion-Pfad. Der
  Support für sehr große Dokumente (ohne Reject, via Streaming/Chunked-Parse) ist
  ein separater Ausbau → PROJ-72.
- **Manuell gestempelte `privacy_class`:** Volltext-Ergebnis darf nur erhöhen,
  nie senken — ein manuell auf 3 gesetztes Dokument bleibt 3, auch wenn der
  Volltext „nur" Class-1 ergäbe.
- **Class-2-Fund im Volltext, Excerpt war Class-1:** Hochstufung auf 2
  (business-confidential) nach derselben monotonen Regel.
- **Scan-PDF / bildbasiertes Dokument** (leerer geparster Text): Der
  Klassifizierer kann PII in Bildern nicht sehen → bekannte Grenze, verweist auf
  PROJ-71 (OCR). Ein leeres Parse-Ergebnis bei einem **neuen** Upload gilt nicht
  als „Fehlschlag" im Sinne von AC-75.8.
- **Bestands-Zeile ohne Storage-Datei** (Orphan, `content_full_url` null oder
  Datei entfernt): Fail-safe → `classification_unverified`, Klasse unverändert.
- **Race:** Backfill läuft, während dieselbe Zeile parallel gelesen/genutzt wird
  → Hochstufung ist ein reines UPDATE der `privacy_class`; nachfolgende
  KI-Aufrufe lesen den neuen Wert (fail-closed Richtung Ollama-only).

## Technical Requirements
- **Regex-only:** kein neuer Dep, kein LLM. Wiederverwendung von
  `classifyContextSourcePrivacy`; erweitert wird nur die *Eingabe* (Volltext statt
  Excerpt) und der Ort, an dem der Volltext verfügbar ist.
- **Monotone Hochstufung** (`GREATEST(bestehend, neu, default 3-Floor)`) — nie
  Downgrade.
- **Tenant-Sicherheit:** Backfill respektiert RLS / Tenant-Grenzen; kein
  Cross-Tenant-Zugriff, keine Content-Exfiltration in Logs (PII-Log-Block wie
  PROJ-70-γ AC-γH-7-Linie).
- **Performance:** Regex über bis zu ~2 MB Volltext ist günstig; der
  Ingestion-Latenz-Zuwachs ist vernachlässigbar. Backfill als bounded,
  wiederaufnehmbarer Batch (Mechanismus — Inline-bei-Ingestion vs.
  Hintergrund-Job für den Bestand — ist eine `/architecture`-Entscheidung).
- **Beobachtbarkeit:** Backfill-Ergebniszähler (geprüft / hochgestuft /
  unverifiziert).

## Out of Scope
- **OCR für bildbasierte Scan-PDFs** → PROJ-71. (Kein PII-Leak-Residual auf dem
  KI-Text-Pfad: ein Scan-PDF liefert leeren geparsten Text → es wird kein Inhalt
  an ein Modell gesendet; es ist eine Extraktions-Qualitätslücke, kein Leak.)
- **Streaming/Chunked-Parse zur Aufnahme sehr großer Dokumente OHNE Reject**
  → PROJ-72. (Bis dahin gilt AC-75.13: nicht-vollständig-screenbar ⇒ Reject.)
- **Zusätzliche Parser-Formate (PPTX/XLSX)** → PROJ-73.
- **Hard-Delete von Storage-Dateien bei Class-3** — bewusst verworfen (Datei
  behalten, Ollama-only).

> **Kein Restrisiko auf dem Ingestion-Pfad:** Jede akzeptierte Zeile ist
> vollständig gescreent (AC-75.14) oder wurde abgewiesen (AC-75.13). Das einzige
> verbleibende Bestands-Residual (unverifizierbare Alt-Zeilen, AC-75.8) ist
> **explizit markiert und abfragbar**, also sichtbar und manuell steuerbar —
> nicht still.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

**Architected 2026-07-21.** Backend-only Slice — **keine UI**. Kein neuer
Dependency. Additive Migration (2 Spalten), keine RLS-/RPC-Umschreibung. CIA
nicht zwingend (spec-following + eine gebundene Backend-Entscheidung, ~3 Dateien,
kein neues Pattern) — bewusst ohne CIA-Pass.

### Kernidee
„Was wir **speichern**" (das 8000-Zeichen-Excerpt) wird von „was wir
**screenen**" (der vollständige geparste Text) getrennt. Der Parser hält den
Volltext bereits im Speicher; er reicht ihn an die Klassifikation weiter, statt
nur das gekappte Excerpt zu prüfen. Ergänzt um die Fail-closed-Regel „fully
screened or rejected", entsteht daraus **kein Restrisiko auf dem Ingestion-Pfad**.

### Ablauf A — Ingestion (neue Uploads)
```
Upload (Multipart)
 └─ Parser (PDF/DOCX/TXT/EML/MSG)
     ├─ extrahiert vollständigen Text (im Speicher)
     ├─ FAIL-CLOSED: Text überschreitet 2-MB-Screen-Grenze
     │    → Reject 422 (kein partieller Text mehr, kein „break")   [AC-75.13/14]
     ├─ gibt zurück: (a) Excerpt 8000-gekappt  → wird gespeichert  [AC-75.3]
     │               (b) vollständiger Text     → nur zum Screenen
     └─ Route
         ├─ klassifiziert über Titel + VOLLTEXT (regex-only, kein LLM) [AC-75.1/11]
         ├─ privacy_class = max(Volltext, DB-Floor 3, manueller Stempel) [AC-75.4]
         ├─ setzt full_text_classified_at = jetzt                    [verifiziert]
         └─ INSERT + Storage-Upload (unveränderte Reihenfolge)
```

### Ablauf B — Backfill (Bestands-Korrektur, einmaliger re-runnbarer Sweep)
```
Wartungslauf (service-role, tenant-scoped, bounded batches)   [User-locked]
 └─ für jede context_sources-Row mit truncated=true UND full_text_classified_at IS NULL:
     ├─ lädt Storage-Datei → Re-Parse → Volltext
     ├─ Erfolg: klassifiziert über Volltext
     │    ├─ Class-3 gefunden → privacy_class hochstufen (monoton)   [AC-75.7]
     │    │                     Datei BEHALTEN, Ollama-only (kein Delete)
     │    └─ full_text_classified_at = jetzt   (→ Idempotenz-Skip)   [AC-75.9]
     └─ Fehlschlag (Datei fehlt / Re-Parse-Fehler):
          ├─ privacy_class UNVERÄNDERT
          ├─ classification_unverified = true                        [AC-75.8]
          └─ protokollieren (kein PII im Log)
 └─ Abschluss: Zähler geprüft / hochgestuft / unverifiziert          [AC-75.10]
```
Der Sweep ist **idempotent** (Skip über `full_text_classified_at IS NULL`),
**re-runnbar** und braucht **keinen wiederkehrenden Cron** — es ist eine endliche
Korrektur des vorhandenen Backlogs.

### Datenmodell — 2 neue Spalten auf `context_sources` (additiv)
- **`full_text_classified_at`** (Zeitstempel, nullable): gesetzt, sobald der
  **vollständige** Text erfolgreich gescreent wurde — bei neuen Uploads immer,
  beim Backfill bei Erfolg. `null` = noch nicht volltext-gescreent. Treibt die
  Backfill-Idempotenz und trennt „vollständig geprüft" von „noch offen".
- **`classification_unverified`** (Ja/Nein, Standard: Nein): wird beim Backfill
  auf Ja gesetzt, wenn der Volltext nicht ableitbar war. Macht das **einzige
  verbleibende Bestands-Residual sichtbar und abfragbar** (DSGVO-Prüfliste).

Beide Spalten sind additiv/defaultet → gefahrlose Migration, keine Datenmigration
der Spalten selbst nötig.

### Tech-Entscheidungen (begründet)
- **Volltext statt Excerpt als Screening-Eingabe** — schließt die eigentliche
  Lücke (PII jenseits Zeichen 8000). Der Klassifizierer selbst bleibt unverändert
  (regex-only); nur seine Eingabe verbreitert sich. Kein LLM-Kontakt, Class-3-
  Hardblock unberührt.
- **Fail-closed Reject statt stiller Truncation** — garantiert „fully screened or
  rejected" und vereinheitlicht das PDF-Verhalten mit dem bereits bestehenden
  DOCX/TXT-Reject. Preis: sehr große PDFs (≤200 S., >2 MB Text) werden abgewiesen;
  Reject-freier Large-Doc-Support ist als **PROJ-72** ausgelagert.
- **Datei behalten + Ollama-only** statt Hard-Delete — kompatibel mit DMS/RAG
  (PROJ-79/80), die das Original brauchen; Schutz kommt aus dem Routing, nicht aus
  Löschung.
- **Einmaliger Sweep statt Cron/Lazy** — die Bestands-Korrektur ist endlich; ein
  wiederkehrender Cron fände nach dem ersten Lauf nichts, Lazy ließe nie-berührte
  Alt-Rows unbegrenzt ungescreent (schwächere DSGVO-Posture).
- **`full_text_classified_at` als Marker statt JSON-Feld** — abfragbar und
  idempotenz-tauglich; ein reiner `source_metadata`-Eintrag wäre schwerer zu
  filtern.

### Betroffene Bausteine
- `src/lib/context-ingestion/file-parser.ts` — Volltext ausgeben; PDF-`break` →
  Reject; (DOCX/TXT rejecten bereits korrekt).
- `src/app/api/context-sources/route.ts` — Klassifikation über Volltext,
  `full_text_classified_at` setzen.
- `src/lib/context-sources/classify-privacy.ts` — **unverändert** (nur andere
  Eingabe).
- Neu: Backfill-Wartungsroutine (service-role, tenant-batched, idempotent).
- Neu: additive Migration (2 Spalten).

### Dependencies (Pakete)
- **Keine.** Reine Lib-/Route-/Migrations-Änderung.

### Implementation Notes — Backend (2026-07-21)
**Gebaut auf `proj-75/requirements` im Worktree; kein neuer Dep.**

- **Migration `20260721162717_proj75_class3_reclassification`** in Prod (Repo-Dateiname == Prod-Version, PROJ-134-konform): additive Spalten
  `context_sources.full_text_classified_at` (timestamptz null) +
  `classification_unverified` (bool default false) + partieller Index
  `idx_context_sources_fulltext_pending (tenant_id) WHERE full_text_classified_at IS NULL`.
- **Parser** (`file-parser.ts`): `ParseResult.full_text` (kompletter Rohtext,
  getrennt vom 8000-Excerpt); alle 5 Parser (pdf/docx/text/eml/msg) füllen es.
  **PDF-`break` bei >2 MB → `throw raw_text_cap_exceeded`** (AC-75.13, fail-closed,
  einheitlich mit DOCX/TXT); `truncated` reflektiert danach nur noch den
  Excerpt-Cut, nie eine Quell-Abschneidung.
- **Ingestion-Route** (`context-sources/route.ts`): klassifiziert über
  `full_text` statt Excerpt (AC-75.1/2); `content_excerpt` bleibt 8000-gekappt
  (AC-75.3); `full_text_classified_at` auf BEIDEN Insert-Pfaden (Multipart +
  JSON) gesetzt → neue Rows brauchen keinen Backfill.
- **Backfill** `POST /api/context-sources/reclassify-backfill` (Bearer
  `CRON_SECRET`, service-role, **kein** vercel.json-Cron → manuell/one-shot):
  bounded Batch über `full_text_classified_at IS NULL`; re-parst Storage-Datei
  (neuer `downloadContextSourceFile`/`parseStoragePointer` in `storage.ts`),
  klassifiziert Volltext, **monotone** Hochstufung (`Math.max`, nie Downgrade,
  AC-75.4), Datei behalten (AC-75.7); Fail-safe → `classification_unverified=true`,
  Klasse unverändert, nicht als screened markiert → Retry auf Folgelauf (AC-75.8);
  non-truncated/JSON-Rows ohne Datei → als screened markiert ohne Re-Parse;
  Response-Zähler checked/upgraded/unverified/screened_unchanged/remaining (AC-75.10).
  Regex-only, kein LLM (AC-75.11); Invariante #3 + DB-Default 3 unberührt (AC-75.12).
- **Tests:** +2 `file-parser.test` (full_text-Separation, PDF->2MB-Reject) + 6
  `reclassify-backfill/route.test` (auth 500/401×2, Upgrade→Class-3, No-Downgrade,
  Fail-safe-Flag, non-truncated-mark, FileParseError→unverified).
- **Quality-Gates:** ESLint 0, tsc 14 baseline/**0 neu**, vitest **2302/2302**,
  build clean (Route registriert).
- **Live-DB-Smoke (read-only, 0 Residue):** neue Spalte+Index+JSON-Filter-Query
  läuft live gegen Prod; quantifiziert Exposure: **13/15** context_sources sind
  `truncated` UND < Class-3 → genau der Bestand, den der Sweep re-screent.
- **Offen für /qa:** echter End-to-End-Live-Smoke — (a) Ingestion mit PII jenseits
  Zeichen 8000 → Class-3; (b) Backfill-Route gegen die 13 realen truncated-Rows
  (seed→run→verify→rollback); (c) PDF->2 MB → 422.

## QA Test Results

**QA PASS 2026-07-21 — 0 Critical / 0 High → PRODUCTION-READY.** 1 High-Finding
(H-1) in-QA gefunden und gefixt; 14/14 ACs belegt.

### AC-Abdeckung (14/14 ✅)
| AC | Beweis |
|----|--------|
| 75.1 Volltext-Klassifikation vor Persist/AI | Route klassifiziert `parseResult.result.full_text` (Code) + unit (full_text-Separation) |
| 75.2 PII jenseits 8000 → Class-3 | unit `file-parser.test` (E-Mail bei ~9000 nur in full_text) + backfill-route-test (Klassifizierer auf full_text mit E-Mail@8100 → class 3) |
| 75.3 Excerpt bleibt 8000-gekappt | unit `file-parser.test` (excerpt.length==8000, full_text komplett) |
| 75.4 Monotone Hochstufung, nie Downgrade | unit backfill „no-downgrade" + **Live-Smoke A3** (`GREATEST(3,1)=3`) |
| 75.5 <8000-Doc unverändert, nicht geflaggt | unit (kurzer Text → truncated=false); Backfill markiert non-truncated als screened, nie unverified |
| 75.6 Re-runnbarer, tenant-sicherer Backfill | Route + **Live-Smoke A1/A5** (Pending-Query) + row-by-row-Isolation |
| 75.7 Class-3 → hochstufen, Datei behalten | backfill-route-test (Upgrade, kein Delete-Call) + **Live-Smoke A2** |
| 75.8 Fail-safe: Klasse belassen + `classification_unverified` | backfill-route-test (fail-safe/FileParseError) + **Live-Smoke A4/A6** |
| 75.9 Idempotent (skip re-klassifiziert) | Query `.is(full_text_classified_at,null)` + **Live-Smoke A5** (marker-set ausgeschlossen) |
| 75.10 Ergebniszähler | Route-Response checked/upgraded/unverified/screened_unchanged/remaining + unit-Asserts |
| 75.11 Regex-only, kein LLM | Klassifizierer unverändert regex-only; kein LLM-Import im Pfad (Code-Review) |
| 75.12 Class-3-Hardblock + DB-Default 3 unberührt | additive Migration; `privacy_class` default 3 (Schema-Query); kein Routing-Change |
| 75.13 Fail-closed Reject bei unvollständigem Screening | unit `file-parser.test` (PDF >2 MB → `raw_text_cap_exceeded`) |
| 75.14 „Fully screened or rejected" | PDF-Reject + bestehende DOCX/TXT-Rejects + full_text=komplett → jede akzeptierte Row voll gescreent |

### Live-DB-Smoke gegen Prod (Pflicht, 0 Residue)
DO-Block mit Rollback-Sentinel, tenant `329f25e5…`: **A1–A6 alle PASS** —
A1 3 truncated-Rows pending; A2 Upgrade `GREATEST(1,3)=3` + marker + unverified=false;
A3 no-downgrade `GREATEST(3,1)=3`; A4 fail-safe (Klasse unverändert, marker NULL, unverified=true, retrybar);
A5 Idempotenz (marker-set aus Pending ausgeschlossen); A6 `classification_unverified` abfragbar.
Rollback → 0 Residue (`smoke_residue=0` verifiziert). Zusätzlich read-only Exposure-Query:
**13/15 Prod-context_sources sind `truncated` UND < Class-3** (der reale Backlog).

### Security-Audit (Red-Team)
- **Bearer-Guard:** POST ohne/mit falschem `CRON_SECRET` → 401 (unit + Playwright). Nie ok:true/200 ohne Secret.
- **Kein LLM / keine Exfiltration:** regex-only; Logs enthalten nur IDs + grobe Reason-Codes, nie Dokumentinhalt.
- **Tenant-Isolation:** Backfill arbeitet row-by-row per id; jede Row trägt eigene `tenant_id`; kein Cross-Tenant-Mix (service-role by design, wie Crons).
- **Invariante #3:** Class-3 → Ollama-only-Routing unberührt; nur Klassifikations-*Eingabe* verbreitert.
- **Input:** Backfill-`limit` auf [1,500] geklammert.

### Playwright (chromium) — `tests/PROJ-75-reclassify-backfill.spec.ts` 3/3 ✅
Auth-Gate: POST ohne Auth / falsches Bearer / GET → erreicht Handler (kein 307), nie 200/ok:true. Beweist H-1-Fix.

### Findings
- **H-1 (High, in-QA GEFIXT):** Backfill-Route wird per `CRON_SECRET`-Bearer (keine Session) aufgerufen, stand aber **nicht** in `PUBLIC_ROUTES` → Middleware hätte Bearer-only-Aufrufe zu `/login` (307) umgeleitet, bevor der Guard greift → Route über ihren Auth-Pfad unerreichbar. **Fix:** exakter Pfad `/api/context-sources/reclassify-backfill` zu `PUBLIC_ROUTES` ergänzt (Präzedenz `/api/mcp`). Verifiziert via Playwright 3/3 (kein 307). Kein weiterer Pfad public gemacht.

### Deviations / Env-Limitierungen
- **D-1 (Env):** Der Ingestion-Live-Test (echter Upload mit PII jenseits 8000 → Class-3) und der echte End-to-End-Backfill-Route-Lauf gegen die 13 realen Rows laufen erst **post-deploy** (Code noch nicht deployed; kein prod-`CRON_SECRET` im Worktree). Kompensiert durch: identische Klassifizierer-Logik in Ingestion & Backfill (unit-getestet), Live-DB-Smoke A1–A6 der DB-Semantik, vitest-Route-Wiring. **Als Deploy-Verify nachzuholen.**
- **D-2 (Env):** Mobile-Safari-E2E übersprungen (WebKit-Host-Libs, PROJ-67/F2).

### Gates
ESLint 0 · tsc 14 baseline/0 neu · vitest **2302/2302** (+10) · build clean · Playwright 3/3 chromium · Advisor: keine neuen (additive Spalten + Index).

## Deployment

**Deployed 2026-07-21 — Tag `v2.15.0-PROJ-75`** (PR #244 → main `f843dbb`; Vercel auto-deploy from main).
Migration `20260721162717` seit /backend in Prod (DDL-only, kein Runtime-Migrationsschritt). Kein neuer Env/Secret.

**Post-Deploy-Smoke (live gegen Prod):** Backfill-Route `POST /api/context-sources/reclassify-backfill` → 401 ohne Auth **und** mit falschem Bearer (kein 307 → H-1-Fix live bestätigt, kein Secret-Leak); `GET` → 405 (POST-only); Home → 307 (Session-Gate intakt). Required-Checks alle grün (schema-drift, migration-naming, npm-audit, Snyk).

### Ist-Zustand am 2026-08-13 gemessen — der Backfill ist nach wie vor nicht gelaufen

Drei Wochen nach dem Deploy gegen die Prod-Datenbank nachgezaehlt:

| Kennzahl | Wert |
|---|---|
| Context-Sources gesamt | 15 |
| davon je volltext-geprueft (`full_text_classified_at`) | **0** |
| offene Backfill-Kandidaten | **15** |
| davon im Kundenmandanten `IT-Couch GmbH` | **13**, alle `privacy_class = 2` |
| deren `content_excerpt`-Laenge | **alle exakt 8000** — also alle abgeschnitten |
| als `classification_unverified` markiert | 0 |

Die 13 echten Kundendokumente tragen also weiterhin ein Datenschutz-Label, das nur aus den ersten 8000 Zeichen abgeleitet wurde — exakt der Zustand, fuer den diese Slice gebaut wurde.

**Einordnung, kalibriert:** unmittelbar abgeflossen ist nichts. Die KI-Pfade senden das `content_excerpt` (8000 Zeichen) an einen Provider, nicht die Volldatei; PII jenseits 8000 hat das System also nie verlassen. Falsch ist das **Label**, und daran haengen die Routing-Entscheidung (Class-3 → nur tenant-eigenes Ollama bzw. attestiertes Azure) und jeder kuenftige Volltext-Konsument (PROJ-80/RAG). Ob ueberhaupt eines der 13 Dokumente PII jenseits 8000 traegt, ist **unbekannt** — genau das stellt der Backfill fest. Die Dokumentinhalte wurden dafuer nicht gelesen.

**Warum es liegengeblieben ist:** D-1 war als Deploy-Verify notiert, aber der `Deployed`-Stempel im INDEX verdeckte, dass noch etwas aussteht — das Followup-Register sagte „Planned — still open" und lag damit **naeher an der Wahrheit** als das INDEX-Label. Der Widerspruch ist jetzt auf beiden Seiten aufgeloest (Scope `mvp` + PROJ-Y-75a).

**Offener Post-Deploy-Handoff (D-1) — braucht Prod-`CRON_SECRET`:**
1. Backfill einmal gegen die **13 realen `truncated` & < Class-3**-Rows laufen:
   `curl -X POST https://projektplattform-v3.vercel.app/api/context-sources/reclassify-backfill -H "Authorization: Bearer $CRON_SECRET" -H "content-type: application/json" -d '{"limit":500}'`
   → Response-Zähler prüfen (upgraded/unverified/remaining); schließt die reale DSGVO-Exposure.
2. Optional-Gegenprobe: neuen Upload mit PII jenseits Zeichen 8000 → `privacy_class=3` verifizieren.
