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

## Status: Planned
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
