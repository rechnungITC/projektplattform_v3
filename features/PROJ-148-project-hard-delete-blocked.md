---
id: PROJ-148
title: "„Endgültig löschen\" scheitert an der Lead-Invariante"
issue_type: Bug
epic_code: CORE
epic_title: "Shared Core — Projekte & Lebenszyklus"
priority: High
priority_source: "Must"
labels: ["bug", "core", "data-integrity"]
dependencies: ["PROJ-2", "PROJ-4"]
roles: ["Platform"]
summary_for_jira: "[BUG] Papierkorb laesst sich nicht leeren — Hard-Delete bricht mit 23514"
---

# PROJ-148: „Endgültig löschen" scheitert an der Lead-Invariante

## Status: Deployed
## Deployment Scope: full
**Created:** 2026-08-14
**Origin:** Nebenbefund bei der Vorbereitung von PROJ-Y-143o.

## Befund

`enforce_last_lead()` prüft im DELETE-Zweig nur, ob nach dem Entfernen einer Mitgliedschaft noch
ein `lead` übrig bleibt — nicht, ob das Elternprojekt gerade selbst abgerissen wird. Beim
`ON DELETE CASCADE` von `projects` auf `project_memberships` feuert der Trigger deshalb mit
`23514 / project must have at least one lead`, und der Hard-Delete schlägt fehl.

Die Route `src/app/api/projects/[id]/route.ts` führt im `hard`-Zweig genau diesen Delete aus
(Service-Role-Client) und gibt entsprechend `delete_failed` / 500 zurück.

**Reichweite, am Kundenmandanten simuliert (zurückgerollt):** von 23 Projekten im Papierkorb
waren **21 nicht löschbar**. Löschbar waren genau die zwei ohne Lead-Mitgliedschaft. Da der
Wizard jedem neuen Projekt einen Lead gibt, ist praktisch jedes betroffene Projekt betroffen:
der Papierkorb füllt sich, ohne leerbar zu sein.

## Warum es nicht auffiel

`tests/PROJ-1-2-live-closure.spec.ts` deckt den Hard-Delete ab und war grün. Der Test seedet
sein Projekt aber direkt per Service-Role **ohne Mitgliedschaft** — also in genau der einzigen
Form, die durchgeht. Er prüfte eine Projektform, die das Produkt nie erzeugt. Dieselbe Klasse
blinder Fleck wie der gemockte Parser aus PROJ-142: der Test bewachte eine Fassade.

Die Härtung des Tests gehört deshalb zu dieser Slice und nicht in ein Folgeticket — ohne sie
bliebe er grün, egal was der Fix tut.

## Fix

Im DELETE-Zweig früh zurückkehren, wenn das Elternprojekt nicht mehr existiert. Empirisch
belegt (zurückgerollte Probe mit probeweise eingespieltem Fix): bei einem Kaskaden-Delete ist
die `projects`-Zeile bereits weg, wenn die Kind-Trigger laufen — die Bedingung trifft also
genau den Abriss und nur ihn.

Die Invariante bleibt unangetastet: solange das Projekt lebt, sind sowohl das Entfernen als
auch das Degradieren des letzten Leads weiterhin `23514`.

Bearbeitet wird die **Live-Definition per Anker-Ersetzung** (Hausregel „replace from live,
never retype"), whitespace-tolerant, mit Abbruch bei ≠ 1 Treffer und Post-Conditions, die
prüfen, dass **beide** Invarianten-Prüfungen erhalten sind und der neue Zweig nicht im
UPDATE-Pfad gelandet ist.

## Acceptance Criteria

- **AC-148.1** — Ein Projekt **mit** Lead-Mitgliedschaft lässt sich über den Route-Pfad
  (Service-Role) hart löschen. ✅ Pentest A
- **AC-148.2** — Die Lead-Invariante greift für lebende Projekte unverändert: letzten Lead
  entfernen und letzten Lead degradieren bleiben `23514`. ✅ Pentest B, C
- **AC-148.3** — Der reguläre Mehr-Lead-Fall ist unberührt: bei zwei Leads darf einer weg.
  ✅ Pentest D
- **AC-148.4** — Der Fix öffnet keinen neuen Löschpfad: ein gewöhnliches Mitglied scheitert
  weiterhin an `projects_delete_admin`, fremde Mandanten bleiben unerreichbar. ✅ Pentest F, G
- **AC-148.5** — Der E2E-Test prüft die reale Projektform (mit Lead) und wäre vor dem Fix rot.
  ✅ `tests/PROJ-1-2-live-closure.spec.ts`
- **AC-148.6** — Wirkung auf den Bestand belegt: keine Lead-bedingte Blockade mehr.
  ✅ Pentest E1/E2 — **0** lead-blockiert (vorher 21), **19 von 23** löschbar (vorher 2)

## Bewusst nicht in Scope

Die verbleibenden **4** Papierkorb-Projekte scheitern an einer **zweiten, unabhängigen
Ursache**: der Kaskaden-Delete trifft append-only-Tabellen
(`stakeholder_profile_audit_events`, `decision_approval_events`), deren Guard `UPDATE` und
`DELETE` grundsätzlich verbietet. Das ist kein Trigger-Bug, sondern ein echter Zielkonflikt
zwischen „endgültig löschen" und „Governance-Historie ist unveränderlich" — und er darf nicht
nebenbei zugunsten des Löschens entschieden werden, sonst ließe sich Genehmigungs-Historie
durch Projektlöschung tilgen (genau die Klasse, gegen die PROJ-130 antritt).

Registriert als **PROJ-Y-148a**, CIA-pflichtig.

Ebenfalls nicht angefasst: die 23 Papierkorb-Projekte des Kundenmandanten (die Messung lief
ausschließlich in zurückgerollten Transaktionen), und `enforce_admin_invariant` auf `tenants`,
das dieselbe Bauart hat (Mandanten-Hard-Delete bleibt blockiert; Offboarding läuft ohnehin
über PROJ-17).

## Nachweise

- Migration `20260814090000_proj148_last_lead_cascade_fix.sql` — Anker-Ersetzung aus der
  Live-Definition, Post-Conditions strukturell.
- `tests/sql/PROJ-148-project-hard-delete-pentest.sql` — **A–H, 7 PASS + 1 INFO**, live gegen
  Prod, 0 Rückstände.
- Zwei Testfallen sind im Pentest dokumentiert statt stillschweigend korrigiert: „fremder
  Mandant" muss über *fehlende Mitgliedschaft* bestimmt werden (der geteilte E2E-Nutzer ist
  Admin in zwei Mandanten, sonst meldet der Vektor ein Leck, das keins ist), und E muss nach
  Ursache aufschlüsseln statt pauschal zu zählen.

## Definition of Done

- [x] Fix in Prod, Migration idempotent und fresh-apply-fest
- [x] Live-Pentest grün, 0 Rückstände
- [x] E2E-Test auf die reale Projektform gehärtet
- [x] Zweite Ursache benannt und als Followup registriert statt vermischt
- [x] Merge + Post-Deploy-Smoke — PR #384 → main `4403c97`, Tag `v2.57.0-PROJ-148`; Smoke 2/2 gegen Prod (Abriss-Zweig live + beide Invarianten erhalten; Hard-Delete mit Lead → 1 Zeile), 0 Rückstände

## Deployment

**Deployed 2026-08-14:** PR #384 (squash) → main `4403c97`, Tag `v2.57.0-PROJ-148`. Die Migration
lag seit dem Bau in Prod, der Merge brachte also **keinen** Runtime-DB-Change — er schließt die
Repo/Prod-Divergenz und liefert die Test-Härtung aus. Post-Deploy-Smoke 2/2 gegen Prod
(zurückgerollt, 0 Rückstände).

**Warum Scope `full` und nicht `mvp`:** alle sechs Akzeptanzkriterien sind belegt, QA ohne
Critical/High, Produktionsverhalten live verifiziert. Die 4 verbleibenden Papierkorb-Projekte
sind **kein zurückgestelltes Kriterium dieser Slice**, sondern eine zweite, während der Arbeit
entdeckte Ursache mit eigener Entscheidungsfrage (PROJ-Y-148a) — AC-148.6 fordert ausdrücklich
die *lead-bedingte* Blockade, und die ist auf 0 gemessen. Die Grenze steht unter „Bewusst nicht
in Scope", damit `full` nicht mehr behauptet als geliefert wurde.
