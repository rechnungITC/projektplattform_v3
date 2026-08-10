---
id: PROJ-Y-142c
title: "Route-Level-Abdeckung für den Kickoff-Upload (POST /api/context-sources)"
issue_type: Chore
epic_code: HYGIENE
epic_title: "Hygiene & Supply-Chain"
priority: Medium
priority_source: "Should"
labels: ["hygiene", "testing"]
dependencies: ["PROJ-Y-142b"]
roles: ["Platform"]
summary_for_jira: "[HYGIENE] Route-Level-Abdeckung für den Multipart-Kickoff-Upload"
---

# PROJ-Y-142c: Route-Level-Abdeckung für den Kickoff-Upload

## Status: Deployed (2026-08-10)
**Deployed:** 2026-08-10 — PR #308 → main (`cf277ab`), Tag `v2.38.0-PROJ-Y-142c`. Alle 6 Required-Checks grün. Test-only, daher kein Runtime-Verhalten geändert; Vercel-Auto-Deploy von main lief mit. Post-Deploy-Smoke `/api/context-sources` → 307 Auth-Gate. Kein Env/Secret, keine Migration.
**Created:** 2026-08-10
**Origin:** Followup aus PROJ-Y-142b. Der dortige Sniff-Fix (`sniffMagic` übergibt `file-type` den vollen Buffer statt eines 4100-Byte-Kopfs) war auf **Bibliotheks-Ebene** bewiesen und red-green gepinnt. Was fehlte: die Bestätigung, dass sich das auch am **Endpunkt** so verhält — denn dort ist das Symptom ein sichtbarer HTTP-Status.

> **Hygiene-Slice.** Reine Testabdeckung. Keine Produktivcode-Änderung, keine Migration, kein Schema-Change, keine neue Dependency.

## Warum die Route-Ebene eigenen Wert hat

`unsupported_mime` wird in `route.ts` auf **415** gemappt. Genau diesen Status hätte ein Pilot gemeldet („mein Word-Dokument wird nicht akzeptiert") — nicht den Lib-internen Fehlercode. Ein Test auf Lib-Ebene beweist die Erkennung; erst der Route-Test beweist, dass Erkennung, Status-Mapping und Persistenz zusammen das richtige Ergebnis liefern.

Erschwerend: für `src/app/api/context-sources/route.ts` existierte **überhaupt kein** Test (nur für die Sub-Route `reclassify-backfill`). Der zentrale Ingestion-Endpunkt der Kickoff-Pipeline war ungetestet.

## Was gemockt ist — und was bewusst nicht

| Bestandteil | Status | Begründung |
|---|---|---|
| Auth (`getAuthenticatedUserId`), Tenant-Auflösung | gemockt | bräuchte lebendes Backend |
| Supabase-Client, `uploadContextSourceFile` | gemockt | dito; die eingefügte Zeile wird abgegriffen und assertiert |
| `parseFile`, `sniffMagic`, `file-type`, `mammoth` | **echt** | das ist der Prüfgegenstand |
| Privacy-Klassifizierer | **echt** | läuft im selben Pfad mit |

Die Bytes reisen damit real durch Sniff → Parser → Persistenz-Payload.

## Acceptance Criteria

- **AC-Y142c.1** Ein gewöhnliches `.docx` liefert **201**, und der persistierte `content_excerpt` enthält den extrahierten Text, `mime_type` den erkannten DOCX-Typ.
- **AC-Y142c.2** Ein `.docx`, dessen erster ZIP-Eintrag das alte 4100-Byte-Fenster überschreitet, liefert **201 statt 415** — die Route-Level-Bestätigung des PROJ-Y-142b-Fixes.
- **AC-Y142c.3** Negativkontrolle: ein echtes, nicht-allowlistetes Format (GIF, als `.docx` deklariert) liefert weiterhin **415** und persistiert **nichts** — der Full-Buffer-Wechsel hat das Allowlist-Tor nicht aufgeweicht.
- **AC-Y142c.4** Nicht erkennbare Bytes liefern **415** und persistieren nichts.
- **AC-Y142c.5** Red-Green nachgewiesen: gegen den Vorher-Stand schlägt AC-Y142c.2 mit `expected 415 to be 201` fehl, die übrigen Fälle bleiben grün.

## Umsetzung

| Datei | Art | Inhalt |
|---|---|---|
| `src/app/api/context-sources/route.upload.real.test.ts` | neu | 4 Fälle über den echten Multipart-Pfad; `@vitest-environment node` (Server-Route + serverseitige Parser) |

Wiederverwendet `buildDocx` aus `real-document-fixtures.ts` (PROJ-Y-142b); die adversariale ZIP-Anordnung wird lokal gebaut, weil sie nur hier gebraucht wird.

## Quality Gates

| Gate | Ergebnis |
|---|---|
| vitest | **2631/2631** (343 Files, +4 gegenüber 2627) |
| Route-Suite isoliert | 4/4 |
| ESLint | **0**, Exit 0 |
| tsc | **13 vorbestehend, 0 neu** |
| Build | ✓ Compiled successfully |
| Red-Green (AC-Y142c.5) | gegen Vorher-Stand `expected 415 to be 201`, 3 Kontrollfälle grün |

## Deviations

- **D-Y142c.1** — Kein Live-Smoke gegen die deployte Route mit echtem Login. Der Endpunkt ist auth-gegated (307), ein echter Upload bräuchte eine Session plus Aufräumen realer `context_sources`-Zeilen und Storage-Objekte in Prod. Der Route-Handler wird stattdessen in-process mit echten Bytes und echten Parsern gefahren, was denselben Codepfad abdeckt, ohne Prod-Daten zu hinterlassen.
- **D-Y142c.2** — Supabase und Storage bleiben gemockt; diese Slice prüft Sniff/Parse/Status-Mapping, nicht RLS oder Bucket-Policies (die decken PROJ-70-γ und der DMS-Pentest ab).
