# M&A-Epic (PROJ-94–132) — Priorisierungs- & Sequenzierungs-Analyse

**Erstellt:** 2026-06-15 · **Quelle:** Continuous Improvement Agent (CIA-Review) · **Status:** Decision-Input (vorgeschaltet zu `/architecture`)

> Dieses Dokument ist eine Entscheidungsvorlage. Es ersetzt keine Spec und keine ADR. Es soll verhindern, dass die 39 M&A-Specs 1:1 in `/architecture` gehen, bevor die Architektur-Forks (§6) gelockt und die Reuse-Annotationen (§4) vorgenommen sind.

## 1. Kurzfazit

Die 39 Specs (PROJ-94–132) sind ein fachlich kohärentes M&A-Domänenmodell — aber als **Greenfield-Backlog aus einer Jira-Quelle** geschrieben (interne Codes A1–M2, eigene „Abhängigkeiten"-Notation), **ohne Bezug zum bereits deployed Core (PROJ-1–91)**. Zentraler Befund: Eine 1:1-Architektur würde Risikoregister, Aufgaben, Phasen, Entscheidungslog, Audit-Trail, Stage-Gates und Berechtigungen **ein zweites Mal** bauen — als M&A-Parallelwelt neben PROJ-9/19/20/10/31/1. Das verletzt die Invariante „Shared core before specialization".

**Gesamtempfehlung: RE-FRAME vor `/architecture`.** Kein Spec geht so wie geschrieben in `/architecture`. Vorgeschaltet: eine **Domänen-ADR** (Forks 1–5, §6), die M&A als `project_type` auf der Rule-Engine (PROJ-6) verankert, plus eine Reuse-Annotation jeder Spec. Geschätzte Wirkung: ~12 der 39 Specs schrumpfen auf Konfiguration/Feld-Erweiterung, ~8 sind echte neue Extensions, ~7 sind reine Reports/Views.

## 2. Reuse-vs-Neu-Matrix

Legende: **REUSE** = Feld/Config-Erweiterung eines deployed Core-Features · **EXTEND** = echte neue M&A-Extension auf Core-Pattern · **VIEW** = reine Report/Aggregation · **DUP→REUSE** = Redundanz-Risiko, als Erweiterung statt Neubau schneiden.

| Spec | Titel (kurz) | Klasse | Andockpunkt |
|---|---|---|---|
| 94 | M&A-Projekt anlegen | REUSE | PROJ-2 CRUD + PROJ-5 Wizard + PROJ-6 `project_type='m&a'` |
| 95 | Phasenmodell (10 Phasen) | DUP→REUSE | PROJ-19 + PROJ-6 Method-Catalog |
| 96 | Projekt-Templates | EXTEND | PROJ-6 Rule-Engine + Template-Mechanismus (echte Lücke) |
| 97 | Projektrollen/RACI | DUP→REUSE | PROJ-4 RBAC + PROJ-57; RACI-Feld neu |
| 98 | Gremien/Steuerungskreise | EXTEND | neue `committees`-Tabelle |
| 99 | Externe Berater | EXTEND | PROJ-1 Memberships + Mandats-/NDA-Felder + Class-3 |
| 100 | Need-to-Know Berechtigung | EXTEND (Foundation) | erweitert RLS-Helper — **Fork** |
| 101 | Aufgaben | DUP→REUSE | PROJ-9 Work-Items (kind=task) |
| 102 | Workstreams | EXTEND | Gruppierung über Work-Items |
| 103 | Engpass-Übersicht | VIEW | Aggregation auf PROJ-9/19 |
| 104 | Deliverable-Katalog | EXTEND | neue `deliverables` (an PROJ-79 DMS) |
| 105 | Freigabe-Workflow Deliverables | DUP→REUSE | PROJ-31 Approval-Gates |
| 106 | Versionierung Deliverables | DUP→REUSE | PROJ-10 Field-Level-Versioning |
| 107 | Risikoregister | DUP→REUSE | PROJ-20 Risks (Score/Heatmap teils neu) |
| 108 | Red-Flag-Log DD | EXTEND | DD-spezifisch auf PROJ-20 |
| 109 | Maßnahmen-Tracking | DUP→REUSE | PROJ-20 Open-Items + PROJ-9 |
| 110 | Stage-Gate-Workflow | DUP→REUSE | PROJ-31 + PROJ-19 Phasen-Transition |
| 111 | Entscheidungslog | DUP→REUSE | PROJ-20 Decisions (immutable+supersedes vorhanden) |
| 112 | DD-Streams | EXTEND (DD-Foundation) | neues DD-Backbone |
| 113 | DD-Fragenkatalog/Q&A | EXTEND | neue `dd_questions` |
| 114 | DD-Findings | EXTEND | neue `dd_findings` (quantifiziert, ≠ risk) |
| 115 | Externe Datenräume | REUSE/DUP | PROJ-79 DMS + PROJ-14 Connector |
| 116 | DD-Berichte/Red-Flag-Report | VIEW | PROJ-21 |
| 117 | Gremien/Meeting-Verwaltung | EXTEND | meetings auf PROJ-13 |
| 118 | Kommunikationsmatrix | EXTEND | PROJ-13 + Klassifikation |
| 119 | Vertraul. Verteilung | REUSE | PROJ-13 + PROJ-129 |
| 120 | Bewertungsmodell/Business-Case | EXTEND | neu (an PROJ-22 Budget) |
| 121 | Kaufpreis-Bridge | EXTEND | neu (M&A-spezifisch) |
| 122 | SPA Issues-List | EXTEND | neu (an PROJ-20 Open-Items denkbar) |
| 123 | Closing-Conditions | EXTEND | neu (Checklisten-Pattern) |
| 124 | Closing-Durchführung/Übergabe | EXTEND | neu (PMI-Brücke) |
| 125 | Day-1/100-Tage-Plan | DUP→REUSE | PROJ-9/19 (Sub-Projekt-Plan) |
| 126 | Synergie-Tracking | EXTEND | neu (an PROJ-22 Budget) |
| 127 | PMI-Workstreams/IMO | REUSE | = 102 im PMI-Kontext |
| 128 | NDA-Verwaltung | EXTEND | neu (an 99/129) |
| 129 | Vertraul.-Klassifikation | EXTEND (Foundation) | erweitert Class-3-Modell — **Fork** |
| 130 | Audit-Trail (cross-cutting) | DUP→REUSE | PROJ-10 (vollständig vorhanden) |
| 131 | Management/Steering-Dashboard | VIEW | PROJ-64 + PROJ-21 |
| 132 | Operatives Reporting | VIEW | PROJ-21 + PROJ-64 |

**Summe: 11 DUP→REUSE · 4 REUSE · 14 EXTEND · 4 VIEW · 2 EXTEND-Foundation** — über die Hälfte ist kein Neubau.

## 3. Abhängigkeits-DAG + P0-Kette

Foundation-Knoten (von vielen referenziert): **130 Audit** (≈25 Refs, aber = PROJ-10 vorhanden) · **100 Need-to-Know** (≈15 Refs, echter neuer Foundation-Knoten, blockiert alles DD/Vertraulichkeit) · **94/95** (Wurzel) · **97 Rollen** · **113/114 DD-Q&A/Findings** (Herzstück) · **110 Stage-Gates**.

**P0-Kette (kürzester Pfad zum frühesten Pilot-Wert, DD-zentriert):**

```
94 (Projekt + project_type) → 100 (Need-to-Know-RLS) → 97 (Rollen/RACI)
  → 95 (Phasen via PROJ-19) → 101 (Aufgaben via PROJ-9)
  → 112 (DD-Streams) → 113 (Q&A) → 114 (Findings) → 108 (Red-Flag-Log)
  → 110 (Stage-Gate via PROJ-31) → 111 (Decisions via PROJ-20) → 116 (DD-Report via PROJ-21)
```

Pilot-Nutzen: „Deal anlegen → DD strukturiert durchführen → Findings quantifizieren → Gate-Entscheidung dokumentieren → Red-Flag-Report rausgeben".

## 4. Architektur-Forks (VOR /architecture locken)

**Fork 1 — M&A als `project_type` vs. eigenes Modul.** Empfehlung: **`project_type='m&a'` über PROJ-6 Rule-Engine + Method-Catalog** (10 Phasen + 9 Stage-Gates als Methode), M&A-Objekte als Extensions via `v3-code-extension-pattern.md`. Begründung: respektiert „Shared-core"; ERP/Bau/Software laufen schon so. Eigenes Modul = Silo.

**Fork 2 — Need-to-Know (100/129) als RLS-Erweiterung vs. neue Schicht.** Empfehlung: **Sub-Layer UNTER der Tenant-RLS** — neuer Helper `can_access_classified(object, level)` zusätzlich zu `is_tenant_member`; Klassifikation als `confidentiality_level`-Spalte + Inner-Circle-Membership. KEIN Ersatz der Tenant-Invariante. Risikoreichster Fork — Pentest-AC (100) ernst nehmen.

**Fork 3 — Class-3 vs. M&A-Vertraulichkeit.** Zwei Achsen: Class-3 (PII/Datenschutz, blockt externe Modelle) ≠ M&A-Confidentiality (Need-to-Know). Beide koexistieren: M&A-Confidential ist NICHT automatisch Class-3; aber Target-Personendaten in DD SIND Class-3 → AI-Proposals auf DD-Findings tenant-Ollama-only (wie PROJ-88).

**Fork 4 — Datenraum (115) vs. DMS (PROJ-79).** Spec sagt „Verlinkung, nicht Ersatz". Locken: 115 = nur externe URL-Referenzen + Link-Check (PROJ-14); PROJ-79 = interne Dokumente. VDR-API = „Could", separat.

**Fork 5 — Templates (96).** Echte Lücke. Empfehlung: Rule-Engine-Preset (PROJ-6) für Phasen/Rollen + Copy-on-create für Inhalte.

## 5. Single-Responsibility (Merge/Split)

- **Merge:** 102+127 (Workstreams + PMI/IMO = ein Feature, IMO ist Config) · 128+129+99-NDA-Teil (ein Vertraulichkeits-Bündel) · 131+132 (eine Report-Engine, zwei Presets analog PROJ-21).
- **Downgrade auf Config-Erweiterung:** 130→PROJ-10 · 111→PROJ-20 Decisions · 106→PROJ-10 · 105→PROJ-31.
- **Split:** 100 Need-to-Know → 100a (RLS-Helper + Ebenen) / 100b (Profile + 4-Augen + „Wer-darf-was"-View).

## 6. Empfohlene Release-Sequenz

- **Release 0 (Foundation-Lock, zwingend):** Domänen-ADR (Forks 1–5) + PROJ-6 `project_type='m&a'` + M&A-Method-Catalog (Phasen+Gates) + 100 Need-to-Know-RLS.
- **Release 1 (Deal-Setup & Governance):** 94 · 95 · 97 · 99 · 130/10-Config.
- **Release 2 (DD-Kern — frühester Pilot-Wert):** 112 · 113 · 114 · 108 · 115 · 110 · 111 · 116.
- **Release 3 (Risiko/Deliverables/Aufgaben):** 101 · 102+127 · 104 · 105/106 · 107/109 · 98/117.
- **Release 4 (Transaktion & Reporting):** 120 · 121 · 122 · 123/124 · 131+132 · 118/119.
- **Release 5 (PMI/Integration):** 125 · 126 · 128/129.

Prinzip analog Assistant-Track: Foundation+Vertraulichkeit zuerst, DD-Kern als Pilot, Transaktion/PMI später.

## 7. Risiken

- Daten-Silo / Doppel-Schema ohne ADR → höchstes Risiko (Hauptgrund für CIA-vor-/architecture).
- Need-to-Know-RLS falsch geschichtet → Tenant-Leak / Rechte-Eskalation (100 fordert Pentest).
- Class-3 vs. Confidentiality verwechselt → AI blockiert wo unnötig, oder PII leakt zu Cloud.
- „39× Planned" suggeriert gleichrangigen Scope → Erwartungsmanagement: ~½ ist Core-Config.

## 8. Offene Fragen

- Buy-Side / Sell-Side / Carve-out / JV als separate `project_type`-Varianten oder Template-Varianten?
- Identity-Federation für externe Berater (99) — Gast-Pool vs. IdP-Federation? (betrifft PROJ-1 Auth)
- Interne Codes A1–M2 dauerhaft als Zweit-Identifier behalten oder durch PROJ-X-Cross-Refs ersetzen? (Empfehlung: ersetzen)

## 9. Empfohlene nächste Schritte

1. **User-Entscheidung:** Fork 1 (`project_type`) + Fork 2 (Need-to-Know-RLS) locken.
2. Domänen-ADR via `/architecture` für die **Domäne** schreiben (nicht pro Spec).
3. 39 Specs gegen Reuse-Matrix (§2) annotieren: je Spec „Reuse: PROJ-X" oder „Extension" + Cross-Ref statt interner Codes.
4. DUP→REUSE-Specs auf Erweiterungs-Scope eindampfen, bevor sie Aufwand binden.
5. Merge 102+127 / 131+132 / 128+129; Split 100 → 100a/100b.
6. Release-0-Foundation als erster Architektur-Slice.
