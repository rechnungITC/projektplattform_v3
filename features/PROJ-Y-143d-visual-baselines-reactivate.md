---
id: PROJ-Y-143d
title: "projects-list + project-room Visual-Baselines wieder aktivieren"
issue_type: Chore
epic_code: HYGIENE
epic_title: "Hygiene & Supply-Chain"
priority: Medium
priority_source: "Should"
labels: ["hygiene", "testing", "ui"]
dependencies: ["PROJ-Y-143b", "PROJ-51"]
roles: ["Platform"]
summary_for_jira: "[HYGIENE] Zwei stillgelegte Visual-Baselines reproduzierbar machen und reaktivieren"
---

# PROJ-Y-143d: Zwei stillgelegte Visual-Baselines reaktivieren

## Status: Planned
**Created:** 2026-08-11
**Origin:** Followup aus PROJ-Y-143b, Funde C-1 und C-2.

> **Hygiene-Slice.** Erfolg heißt: zwei `test.fixme()` sind entfernt und die Tests bewachen wieder etwas. Erfolg heißt **nicht**: die Suite ist grün.

## Ausgangslage

PROJ-Y-143b hat den Warte-Anker der authentifizierten Snapshots von der Shell auf die Daten umgestellt. Dabei fielen zwei Baselines durch (C-1): `projects-list-chromium-linux.png` und `project-room-chromium-linux.png` waren **1280 × 720**, also exakt die Viewport-Größe — `fullPage`-Aufnahmen von Seiten, die noch nicht gewachsen waren. Die `projects-list`-Baseline zeigt fünf Skeleton-Zeilen an der Stelle der Projekttabelle. Beide Tests waren dauerhaft grün und haben nichts bewacht.

Unter dem Daten-Anker rendern dieselben Seiten **1200 px** bzw. **2423 px**. Beide stehen seither auf `test.fixme()`.

Neu aufnehmen allein löst es nicht (C-2): `projects-table.tsx:129` rendert `formatRelative(project.updated_at)` — „just now" / „10m ago" / „5h ago" ändert sich pro Lauf. Zusätzlich wächst die Zeilenzahl mit jedem E2E-Lauf (beobachtet: 12 Zeilen, davon 11 akkumulierte `[E2E …]`-Fixtures). Die Seitenhöhe variiert also, und eine `fullPage`-Baseline ist strukturell unmöglich. Ein simples Neu-Ziehen drehte den Test lediglich von *falsch-grün* auf *dauerhaft-rot*.

## Die eigentliche Entscheidung

Es sind zwei Wege möglich, und sie unterscheiden sich nicht im Aufwand, sondern in der **Abdeckung**. Das ist eine bewusste Produktentscheidung, keine Implementierungsfrage:

**Weg A — Clip auf die deterministische Region.** Der Snapshot beschränkt sich auf Kopfbereich und Filterleiste; die Tabelle bleibt außen vor. Schnell umsetzbar, kein Eingriff in Daten, sofort stabil. Preis: Der eigentliche Inhalt — die Tabelle — wird nicht mehr bewacht. Für `project-room` bliebe fast nichts übrig, was den Test dort nahezu wertlos macht.

**Weg B — gepinnte Seed-Daten (+ `mask` auf die Zeitspalte).** Die Snapshot-Tests laufen gegen einen bekannten, festen Datenbestand; die relative Zeitspalte wird maskiert, weil sie selbst bei fixem `updated_at` mit dem Kalender weiterwandert. Volle Abdeckung, aber setzt voraus, dass der Bestand nicht durch Fremdläufe verunreinigt wird — genau das passiert heute.

**Empfehlung: B für `projects-list`, A als Zwischenschritt vertretbar.** Ohne B bleibt das Kernproblem — dass die Testumgebung nicht reproduzierbar ist — bestehen und trifft die nächste Slice erneut.

## Acceptance Criteria

- **AC-Y143d.1** — Die Coverage-Entscheidung (A oder B, je Seite) ist getroffen und in dieser Spec begründet. Bei A ist ausdrücklich festgehalten, was der Test **nicht** mehr abdeckt.
- **AC-Y143d.2** — Zeitabhängige Anzeigen beeinflussen den Vergleich nicht mehr: entweder außerhalb des Clips, maskiert, oder im Testmodus auf absolute Werte gepinnt. Nachweis: zwei Läufe mit **> 1 h Abstand** liefern identische Bilder.
- **AC-Y143d.3** — Der Datenbestand der betroffenen Seiten ist reproduzierbar. Nachweis: die volle Suite zweimal hintereinander ausführen, die Seitenhöhe ändert sich nicht. (Heute wächst sie, weil die Läufe Projekte anlegen und nicht abräumen.)
- **AC-Y143d.4** — Die Baselines sind im **verifiziert geladenen** Zustand neu gezogen und inhaltlich durchgesehen — kein Skeleton, keine Leerseite (AC-Y143b.7).
- **AC-Y143d.5** — Beide `test.fixme()` sind entfernt. Die authentifizierte Suite läuft 7/7 grün, und zwar zweimal hintereinander **sowie** einmal mit geleertem `.next/dev`.
- **AC-Y143d.6** — Ein Selbsttest verhindert die Rückkehr des Fehlers: Ist ein `fullPage`-Snapshot exakt Viewport-hoch (720 px), schlägt der Test mit klarer Meldung fehl, statt eine Leerseite als Wahrheit einzufrieren. Billig, und C-1 wäre damit sofort aufgefallen.

## Abgrenzung

- **PROJ-Y-143c** räumt den **Alt**-Tenant einmalig auf (43 Projekte, destruktiv, auf Freigabe blockiert). Das beseitigt AC-Y143d.3 **nicht**: dort geht es um Altbestand, hier um den aktiven Tenant und darum, dass jeder Lauf neue Zeilen erzeugt.
- **PROJ-Y-143e** behandelt die inhaltlichen Funde C-3 (Sprachmix) und C-4 („Project Health"-Umbruch). Hier geht es ausschließlich um Reproduzierbarkeit.
- **PROJ-Y-143b** ist abgeschlossen; der Daten-Anker steht und ist im Kaltstart belegt. Diese Slice stellt her, dass es auf diesen beiden Seiten überhaupt etwas Stabiles zu prüfen gibt.

## Warum das nicht liegen bleiben sollte

Beide Tests sind aktuell stillgelegt, und `fixme` ist ehrlich — aber es ist kein Dauerzustand. Solange sie ruhen, sind die Projektliste und der Projektraum visuell ungeschützt, also zwei der meistgenutzten Flächen. Der teure Teil ist ohnehin schon geleistet: der Fehler ist verstanden und benannt.
