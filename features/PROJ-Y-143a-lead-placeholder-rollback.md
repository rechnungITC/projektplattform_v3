---
id: PROJ-Y-143a
title: "LEAD_PLACEHOLDER_UUID auf E2E_USER_ID zurückführen"
issue_type: Chore
epic_code: HYGIENE
epic_title: "Hygiene & Supply-Chain"
priority: Low
priority_source: "Could"
labels: ["hygiene", "testing"]
dependencies: ["PROJ-143", "PROJ-Y-78f"]
roles: ["Platform"]
summary_for_jira: "[HYGIENE] E2E: Platzhalter-UUID für den Projektleiter zurückbauen"
---

# PROJ-Y-143a: LEAD_PLACEHOLDER_UUID zurückführen

## Status: Deployed (2026-08-11)
**Deployed:** 2026-08-11 — Tag `v2.46.0-PROJ-Y-143a`. Test-only, kein Runtime-Verhalten, keine Migration.
**Created:** 2026-08-11
**Origin:** Followup aus PROJ-143 (dort als Followup notiert, hier als eigene Spec registriert).

> **Hygiene-Slice.** Reine Testbereinigung. Kein Produktivcode, keine Migration, keine Dependency.

## Problem

`tests/PROJ-135-clarifying-questions.spec.ts:68` führt eine eigene Platzhalter-UUID:

```ts
const LEAD_PLACEHOLDER_UUID = "3f1c9d64-5b7a-4a1e-9c2f-8d6e5b4a3c21"
```

Der begleitende Kommentar (Z. 221–227) nennt den Grund: der Wizard validiert `responsible_user_id` mit `z.string().uuid()`, und die damalige synthetische Fixture-ID (`…-000000000e2e`) war **nicht RFC-4122-konform** — zod 4 wies sie ab, der Basics-Step validierte nie, die Navigation blieb auf Step 1 stehen. Der Kommentar verweist selbst auf die spätere echte Lösung.

**Diese Ursache ist mit PROJ-143 entfallen:** `E2E_USER_ID` ist jetzt `e2e00000-0000-4e2e-8e2e-000000000001` — Versions-Nibble `4`, Variant-Nibble `8`, also RFC-4122-konform und von `z.string().uuid()` akzeptiert.

Der Platzhalter ist damit toter Workaround-Ballast. Er ist zudem irreführend: er suggeriert, der Projektleiter sei für diesen Test bewusst ein Fremder, obwohl es nur ein Formatproblem war.

## Acceptance Criteria

- **AC-Y143a.1** — `LEAD_PLACEHOLDER_UUID` ist entfernt; die betroffene Stelle (Z. 228) nutzt `E2E_USER_ID`.
- **AC-Y143a.2** — Der erklärende Kommentar ist entfernt oder auf den neuen Sachverhalt reduziert (kein Verweis mehr auf ein gelöstes Problem).
- **AC-Y143a.3** — `tests/PROJ-135-clarifying-questions.spec.ts` läuft grün (chromium), inklusive der Fälle, die den Wizard über Step 1 hinaus fahren — das ist der eigentliche Nachweis, dass die Konformität reicht.
- **AC-Y143a.4** — Keine weitere Datei referenziert den Platzhalter (`grep`).

## Warum es klein ist, aber nicht trivial

Der Test ist der einzige, der die Wizard-Validierung an dieser Stelle real durchläuft. Ein „sieht harmlos aus"-Rückbau ohne Lauf würde genau die Klasse Fehler wieder einführen, die PROJ-143 aufgeräumt hat. Deshalb ist AC-Y143a.3 die eigentliche Arbeit, nicht der Zeilenlöschvorgang.

## Voraussetzung

Erfüllt — PROJ-143 ist auf main (`812832a`), und der Inhalt von PROJ-Y-78f ist über #301 (`61943e6`) ebenfalls dort. Die Slice ist unblockiert.

---

## Implementation Notes

**Umgesetzt:** 2026-08-11 · test-only · kein Produktivcode, keine Migration, keine Dependency

### Was geändert wurde

- `LEAD_PLACEHOLDER_UUID` samt Doc-Kommentar aus `tests/PROJ-135-clarifying-questions.spec.ts` entfernt
- die Verwendung auf `E2E_USER_ID` zurückgeführt; damit nutzen jetzt **alle drei** `responsible_user_id`-Stellen der Datei konsistent die geseedete Identität
- der erklärende Kommentarblock ersetzt: er beschrieb ein gelöstes Problem und verwies auf ein Followup, das es nicht mehr gibt

### Verifikation

**Der entscheidende Punkt war nicht das Löschen, sondern der Beweis, dass die Konformität reicht.** Zwei unabhängige Nachweise:

1. **Direkt gegen zod** (die Instanz, an der es damals scheiterte): `z.string().uuid()` **akzeptiert** `e2e00000-0000-4e2e-8e2e-000000000001` (Versions-Nibble `4`, Variant-Nibble `8`) und **weist** die alte `00000000-0000-0000-0000-000000000e2e` **ab**. Der Existenzgrund des Platzhalters ist damit messbar entfallen, nicht nur plausibel.
2. **Playwright** `tests/PROJ-135-clarifying-questions.spec.ts` **6/6 grün** (chromium) — darunter „kickoff upload makes the clarifying step appear (AC-135.3, upload half)", also genau der Fall, der den Wizard mit `responsible_user_id` über Step 1 hinausfährt. Wäre die ID nicht konform, würde die Navigation dort stehenbleiben — exakt das Symptom, das den Platzhalter ursprünglich nötig machte.

Nebenbefund: die Endpoint-/Finalize-Fälle (Zeilen 348 + 426) liefen in diesem Lauf **mit**, anders als bei PROJ-135s ursprünglichem QA-Lauf (dort Deviation D-1: übersprungen ohne `SERVICE_ROLE_KEY`/storage-state). Die Slice ist damit besser abgedeckt als bei ihrer Erstabnahme.

### Gates

ESLint 0 · `tsc --noEmit` 13 Fehler = Baseline, **0 neu** · `grep` bestätigt 0 verbleibende Referenzen auf den Platzhalter · Vitest unberührt (`tests/**` ist von vitest ausgeschlossen und gehört Playwright).

### Acceptance Criteria

- **AC-Y143a.1** ✅ Platzhalter entfernt, Stelle nutzt `E2E_USER_ID`
- **AC-Y143a.2** ✅ Kommentar ersetzt (kein Verweis mehr auf ein gelöstes Problem)
- **AC-Y143a.3** ✅ Spec 6/6 grün inkl. der Fälle jenseits von Step 1
- **AC-Y143a.4** ✅ keine weitere Referenz im Repo
