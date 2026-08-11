---
id: PROJ-Y-143c
title: "Optionale Bereinigung des E2E-Alt-Tenants (43 Testprojekte)"
issue_type: Chore
epic_code: HYGIENE
epic_title: "Hygiene & Supply-Chain"
priority: Low
priority_source: "Could"
labels: ["hygiene", "testing", "data-cleanup"]
dependencies: ["PROJ-143"]
roles: ["Platform"]
summary_for_jira: "[HYGIENE] E2E-Alt-Tenant aufräumen — nur nach ausdrücklicher Freigabe"
---

# PROJ-Y-143c: Bereinigung des E2E-Alt-Tenants

## Status: Planned — **blockiert auf ausdrückliche Freigabe**
**Created:** 2026-08-11
**Origin:** Followup aus PROJ-143, Deviation D-2.

> **Destruktiver Eingriff in Prod-Daten.** Diese Slice wird nicht ohne explizite, gesonderte Freigabe ausgeführt. Sie existiert, damit die Entscheidung sichtbar offen bleibt statt vergessen zu werden.

## Ausgangslage

PROJ-143 hat die E2E-Fixture-Identitäten auf RFC-4122-konforme UUIDs umgestellt. Der Tenant der alten, nicht-konformen Identität besteht weiter — inklusive **43 angesammelter Testprojekte**. Er wurde bewusst nicht gelöscht:

1. **Pentest-Referenzen.** Mehrere `tests/sql/PROJ-*-pentest.sql` verdrahten Tenant- und User-IDs als Literale. Ein Löschen kann Pentests brechen, deren Grün heute als Sicherheitsnachweis gilt.
2. **Destruktiver Prod-Eingriff.** `projects` hängt über `ON DELETE CASCADE` an `tenants`; ein Tenant-Delete zieht Work-Items, Risiken, Audit-Zeilen, Storage-Objekte und Deal-Räume mit.

Zwei `E2E-Visual-Regression`-Zeilen koexistieren derzeit unter altem und neuem Tenant.

## Warum es überhaupt aufgeräumt werden sollte

Der Alt-Tenant ist kein akutes Risiko — er ist mandantengetrennt und für niemanden sichtbar außer den E2E-Identitäten. Der Nutzen einer Bereinigung ist Hygiene: Prod-Datenbestand ohne toten Testmüll, und Advisor-/Index-Statistiken, die nicht von 43 Phantomprojekten verzerrt werden.

Der Nutzen ist also gering, das Risiko konkret. **Default ist: stehen lassen.**

## Acceptance Criteria (nur bei Freigabe)

- **AC-Y143c.1** — Vollständige Referenz-Analyse **vor** jedem Löschen: alle `tests/sql/**` und `tests/fixtures/**` auf Vorkommen der Alt-IDs prüfen; jede Fundstelle bewerten.
- **AC-Y143c.2** — Trockenlauf: die Kaskade wird in einer zurückgerollten Transaktion ausgeführt und die betroffenen Zeilen pro Tabelle gezählt und protokolliert, bevor irgendetwas endgültig gelöscht wird.
- **AC-Y143c.3** — Der tatsächliche Löschvorgang erfolgt erst nach Vorlage dieser Zählung und einer zweiten, expliziten Freigabe.
- **AC-Y143c.4** — Nach dem Löschen sind alle Pentests und die authentifizierte Playwright-Suite grün; andernfalls wird zurückgerollt.
- **AC-Y143c.5** — Alternative, die zuerst zu bewerten ist: **nur die 43 Testprojekte** löschen und den Tenant selbst behalten. Das entfernt den Müll und lässt alle Tenant-/User-Literale in den Pentests intakt — deutlich besseres Risiko-Nutzen-Verhältnis.

## Empfehlung

AC-Y143c.5 zuerst prüfen. Wenn das Aufräumen der Projekte genügt, entfällt der riskante Teil vollständig und die Slice wird zu einer harmlosen Datenbereinigung.
