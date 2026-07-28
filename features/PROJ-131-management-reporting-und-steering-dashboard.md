---
id: PROJ-131
title: "Management-Reporting und Steering-Dashboard"
issue_type: Story
epic_code: M
epic_title: "Reporting & Dashboards"
priority: Medium
priority_source: "Should"
labels: ["ma-platform", "epic-m", "should-have"]
dependencies: ["A2", "E2", "G3", "I1", "I2", "K2", "F1", "L2"]
roles: ["Executive Sponsor", "Steering Committee", "Deal Lead", "PMO-Lead", "Corporate Development"]
summary_for_jira: "[M1] Management-Reporting und Steering-Dashboard"
---

# PROJ-131: Management-Reporting und Steering-Dashboard

## Status: Planned (Requirements refined 2026-07-28 — gegen deployten Stand geerdet, Scope-Schnitt gelockt; → /architecture)
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic M — Reporting & Dashboards)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **VIEW** · Andockpunkt: PROJ-64 Dashboard + PROJ-21. Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **⚠️ CIA-Reuse-Note-Korrektur (2026-07-28):** Die ursprüngliche Note „merge mit PROJ-132" ist **überholt**. PROJ-132 (Operatives Reporting) wurde am 2026-07-27 **standalone** als VIEW-class deployed (`operative_report`-SECURITY-INVOKER-Funktion + M&A-Tab + CSV + Print-to-PDF, Tag `v2.25.0-PROJ-132`). PROJ-131 wird **kein Merge**, sondern spiegelt dasselbe Muster auf **Management/Steering-Ebene** (Executive Sponsor / Steering Committee) — das Pendant zu PROJ-132s operativer Ebene (PMO / Deal Lead / Workstreams). Referenz-Implementierung: `PROJ-132-*.md` Tech Design (`operative_report`, `/print`-Seite, `csvCell`, Aggregat-Leak-Pentest).

> **Epic:** M — Reporting & Dashboards  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should  
> **Labels:** `ma-platform` · `epic-m` · `should-have`  
> **Abhängigkeiten:** `A2`, `E2`, `G3`, `I1`, `I2`, `K2`, `F1`, `L2`

**User Story:**

Als Executive Sponsor möchte ich pro Deal und über alle Deals hinweg ein Steering-Dashboard mit den wichtigsten Kennzahlen (Phase, Stage-Gate-Status, Top-Findings/Red Flags, Kaufpreisbandbreite, Synergiestand) sehen können, damit ich Entscheidungs- und Eskalationsbedarf schnell erkenne.

**Beschreibung / Kontext:**

Das Modell verlangt eine Steuerung auf Geschäftsführungs- und Steering-Committee-Ebene. Die Plattform muss aus den operativen Daten ein verdichtetes Management-Reporting erzeugen, das ohne manuelle Aufbereitung tagesaktuell ist.

**Akzeptanzkriterien (MVP — buildbar gegen den deployten Stand):**

- [ ] **AC-131-1 (Pro-Deal Steering-Dashboard):** Pro Deal zeigt das Dashboard mindestens: aktuelle Phase + Status (PROJ-95/19), **nächstes offenes Stage-Gate** mit Status (F1 = PROJ-110 ✅), **Top-5 Red Flags** (G3 = PROJ-114 `severity ∈ {hoch, deal_breaker}` + E2 = PROJ-107 Risikoregister ✅), **kritische offene Aufgaben** (überfällig/blockiert, PROJ-101/103 ✅).
- [ ] **AC-131-2 (Klassifikations-gated Sichtbarkeit, L2):** Sichtbarkeit folgt der Vertraulichkeit (L2 = PROJ-100a/129 ✅) über den **Caller-Kontext einer SECURITY-INVOKER-Auswertungsfunktion** (mirror PROJ-132/116) — Sponsor sieht alles, andere Rollen nur ihnen Zugängliches; **Aggregate/Headline-Zahlen leaken keine nicht-zugänglichen Objekte** (Aggregat-Leak-Pentest Pflicht, wie PROJ-132 A–G).
- [ ] **AC-131-3 (Drill-down):** Von jedem Dashboard-Element ist ein Sprung zum Detailobjekt möglich (Stage-Gate → `/stage-gates`, Red Flag → DD-Findings/Risiko, Aufgabe → `/aufgaben`/`/engpaesse`).
- [ ] **AC-131-4 (Export):** Bericht als **Print-to-PDF** (chrome-lose `/print`-Seite außerhalb `(app)`, PROJ-21-Muster wie PROJ-116/132, Session-Client-RLS-gebunden, `robots: noindex`) + optional **CSV** je Abschnitt (`csvCell`-Formel-Escaping, Single-Source via erneuter Funktionsaufruf serverseitig).
- [ ] **AC-131-5 (Vorwärts-kompatible Platzhalter):** **Kaufpreisbandbreite** (I1/I2) und **Synergie-Stand** (K2) erscheinen als sichtbare „noch nicht verfügbar"-Kacheln (Modul nicht aktiv/nicht gebaut), damit die Steering-Dashboard-Struktur vollständig ist und die KPIs später **ohne Struktur-Umbau** angeschlossen werden können.

**Deferred (Folge-Slices — bewusst NICHT im MVP):**

- **PROJ-131-β (Portfolio-/Multi-Deal-Sicht):** deal-übergreifende Aggregation über alle M&A-Deals des Tenants mit Filter nach Status, Land/Region, Investitionsvolumen (ursprüngliches AC2). Eigener Lift: **cross-project** Aggregation + Tenant-Sicht (nicht projekt-gebundenes `requireProjectAccess`) + eigene Berechtigungs-/Aggregat-Leak-Prüfung. MVP liefert erst die belastbare Pro-Deal-Sicht (mirror PROJ-132 per-project).
- **PROJ-Y-131a (Kaufpreis-/Synergie-KPIs):** die AC-131-5-Platzhalter mit echten Werten füllen, sobald **PROJ-120/121** (Bewertung/Kaufpreis-Bridge) und **PROJ-126** (Synergie-Tracking) deployed sind.
- **PROJ-Y-131b (Word-Export + Snapshot-Freeze):** Word-Export + persistiertes Zeitpunkt-Einfrieren eines Steering-Pre-Reads (ursprüngliches AC3-Teil). Bricht die reine VIEW-class (Migration + Retention-Entscheidung) → separater Slice.

**Abgrenzungen (Out of Scope):**

- Kein BI-Tool-Ersatz; einfache, vordefinierte Sichten.
- Keine Ad-hoc-Datenanalyse durch den Anwender.

**Offene Fragen:**

- Welche Top-5 KPIs werden pro Deal verbindlich erwartet?
- Soll eine Schnittstelle zu einem BI-Tool (Power BI, Tableau) bereitgestellt werden?

**Definition of Ready:**

- [ ] Dashboard-Mockup ist mit Sponsor, Steering und PMO abgestimmt.
- [ ] KPI-Definitionen und Datenquellen sind dokumentiert.

**Definition of Done:**

- [ ] Dashboard zeigt korrekte Live-Daten.
- [ ] Portfolio-Sicht und Snapshot-Export funktionieren.
- [ ] Berechtigungen sind getestet.

**Abhängigkeiten:**

- A2
- E2
- G3
- I1
- I2
- K2
- F1
- L2

**Betroffene Rollen:**

- Executive Sponsor
- Steering Committee
- Deal Lead
- PMO-Lead
- Corporate Development

---

## Requirements Refinement (2026-07-28)

Der ursprüngliche Backlog-Stub wurde gegen den **tatsächlich deployten** Plattform-Stand geerdet und der Scope für einen lieferbaren MVP gelockt (3 User-Entscheidungen).

### Dependency-Readiness (verifiziert gegen origin/main INDEX)

| Dep | Bedeutung | Modul | Status | Im MVP? |
|-----|-----------|-------|--------|---------|
| A2 | Strategische Grundlage / Deal-Phase | PROJ-94/95 | ✅ Deployed | ja (Phase+Status) |
| F1 | Stage-Gate-Status | PROJ-110 | ✅ Deployed | ja |
| E2 | Risikoregister | PROJ-107 | ✅ Deployed | ja (Red Flags) |
| G3 | DD-Findings / Red Flags | PROJ-114 | ✅ Deployed | ja (Red Flags) |
| L2 | Vertraulichkeit / Need-to-know | PROJ-100a/129 | ✅ Deployed | ja (Gate) |
| (Aufgaben) | Kritische offene Aufgaben | PROJ-101/103 | ✅ Deployed | ja |
| I1/I2 | Bewertung / Kaufpreis-Bridge | PROJ-120/121 | ⛔ Planned | **nein → Platzhalter (AC-131-5), PROJ-Y-131a** |
| K2 | Synergie-Tracking | PROJ-126 | ⛔ Planned | **nein → Platzhalter (AC-131-5), PROJ-Y-131a** |

### Gelockte Scope-Entscheidungen

1. **Ungebaute KPIs (I1/I2 Kaufpreis, K2 Synergie):** sauber deferren — sichtbare „noch nicht verfügbar"-Platzhalter im MVP (AC-131-5), echte Werte über **PROJ-Y-131a** sobald 120/121/126 landen. (Kein Block von PROJ-131.)
2. **Portfolio-Sicht (ursprüngliches AC2):** **pro-Deal zuerst** (MVP, mirror PROJ-132 per-project); deal-übergreifende Aggregation + Filter → **PROJ-131-β**.
3. **Export/Snapshot (ursprüngliches AC3):** **Print-to-PDF** (+ optional CSV) im MVP; **Word-Export + persistiertes Snapshot-Freeze** → **PROJ-Y-131b**.

### Reuse-/Architektur-Rahmen (WAS, nicht WIE — Details in /architecture)

- **Klasse VIEW / DUP→REUSE**, standalone (nicht Merge mit 132). Referenz-Muster: PROJ-132 `operative_report` — eine lesende `SECURITY INVOKER`-Auswertungsfunktion pro Projekt (Caller-Kontext → Need-to-know & Externen-Berater-Scope gratis, keine neue RLS-Engine), + M&A-Tab (Steering-Ebene) + `/print`-Seite + `csvCell`-Export. **Keine neue Tabelle/Migration an Bestand erwartet** (nur die neue Lese-Funktion; Snapshot-Persistenz ist bewusst nach PROJ-Y-131b ausgelagert, um VIEW-class rein zu halten).
- **Offene Architektur-Fragen** (für /architecture, ggf. CIA falls Fork): exakte „kritische offene Aufgabe"-Definition (Reuse `project_task_bottlenecks` aus PROJ-103?), „Top-5 Red Flags"-Sortierung (severity → EUR → Datum?), Tab-Platzierung/Rolle-Gating (nur Sponsor/SteerCo sichtbar?).

### Offene Fragen — Stand nach Refinement

- Verbindliche Top-5 KPIs pro Deal: **MVP-Set gelockt** (Phase/Status · nächstes Stage-Gate · Top-5 Red Flags · kritische offene Aufgaben · Platzhalter Kaufpreis/Synergie). Finales Mockup-Signoff mit Sponsor/SteerCo bleibt DoR für /architecture bzw. /designer.
- BI-Tool-Schnittstelle (Power BI/Tableau): bleibt **Out of Scope** (kein BI-Ersatz); ggf. späterer eigener Slice.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · M — Reporting & Dashboards_
