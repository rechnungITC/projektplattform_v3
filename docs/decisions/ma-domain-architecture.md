# Decision Record — M&A-Domäne: Architektur & Core-Reuse

**V3-original (kein V2-Erbe)** · Stand: 2026-06-23 · Betrifft: PROJ-94–132 (M&A-/Deal-Lifecycle-Epic, 39 Specs)

**Input:** CIA-Sequenzierungs-Analyse [`docs/ma-epic-sequencing-2026-06-15.md`](../ma-epic-sequencing-2026-06-15.md) (2026-06-15).
**Status:** Accepted (Forks 1–5 gelockt als CIA-empfohlene Defaults; revidierbar pro Fork, solange noch kein abhängiger Slice gebaut ist).

**Operativer Readiness-Guide:** [`docs/ma-project-execution-readiness.md`](../ma-project-execution-readiness.md) ist die laufende Sicht darauf, was noch gebaut werden muss, damit M&A-Projekte nicht nur angelegt, sondern fachlich durchgeführt werden können.

---

## Kontext

Es liegt ein 39-Spec-Epic für eine M&A-/Deal-Lifecycle-Domäne vor (PROJ-94–132: Projektanlage → Phasen → Workstreams/Aufgaben → Deliverables → Risiken → Stage-Gates → Due Diligence → Kommunikation → Bewertung/SPA → Signing/Closing → PMI → Vertraulichkeit → Reporting). Die Specs stammen aus einer Jira-Quelle (interne Codes A1–M2) und sind **core-blind** formuliert — ohne Bezug auf den bereits deployed Plattform-Core (PROJ-1–91).

Würde man sie 1:1 in `/architecture` geben, baute man Phasen (PROJ-19), Aufgaben (PROJ-9), Risiken/Entscheidungen/Open-Items (PROJ-20), Field-Level-Audit (PROJ-10), Approval-Gates (PROJ-31) und RBAC (PROJ-1/4) ein zweites Mal als M&A-Parallelwelt. Das verletzt die Kern-Invariante **„Shared core before specialization"** (siehe [architecture-principles.md](architecture-principles.md)).

Diese ADR lockt die domänenübergreifenden Architektur-Entscheidungen **einmalig für die ganze Domäne**, damit nicht jede der 39 Specs ihren eigenen Architektur-Fork aufmacht. Pro-Spec-Annotationen (Reuse-Klasse + Andockpunkt) sind in den Spec-Dateien selbst eingetragen und leiten sich aus §Reuse-Matrix unten ab.

## Entscheidungen

### Fork 1 — M&A als `project_type`, nicht eigenes Modul

**Entscheidung:** M&A wird ein **`project_type='ma'`** mit Anzeige-Label **"M&A-Projekt"** über die bestehende Rule-Engine ([project-rule-engine.md](project-rule-engine.md)) + den Project-Type-Katalog ([project-type-catalog.md](project-type-catalog.md)). Der Slug ist bewusst `ma` statt `m&a`, weil er URL- und API-sicher ist. Die 10 M&A-Phasen und 9 Stage-Gates werden als **Methode** im Method-Catalog ([method-catalog.md](method-catalog.md)) modelliert. M&A-spezifische Objekte (DD-Streams, DD-Findings, Bewertung, SPA, Synergie, Gremien) sind **Extensions** nach dem `v3-code-extension-pattern` — niemals Ersatz des Core.

**Begründung:** ERP/Bau/Software laufen bereits exakt so. Ein eigenes M&A-Modul wäre ein Daten-Silo, der die geteilten Querschnitte (Audit, Approval, Stakeholder, Reporting) abkoppelt — direkter Widerspruch zur Produktvision (PRD: „shared project core plus type-specific extensions").

**Konsequenz:** PROJ-94 (Anlage) erweitert PROJ-2/5/6; PROJ-95 (Phasen) ist eine Methode auf PROJ-19, kein neues Phasen-Schema.

### Fork 2 — Need-to-Know-Vertraulichkeit als RLS-Sublayer, nicht als Ersatz der Tenant-RLS

**Entscheidung:** Need-to-Know (PROJ-100/129) wird ein **additiver Sub-Layer UNTER der bestehenden Tenant-RLS**. Konkret: neuer SECURITY-DEFINER-STABLE-Helper `can_access_classified(object, level)` **zusätzlich** zu `is_tenant_member`/`has_tenant_role`/`is_tenant_admin`; eine `confidentiality_level`-Spalte auf den betroffenen Tabellen; eine Inner-Circle-Membership-Tabelle (wer ist im engsten Deal-Kreis). Die Tenant-Isolation bleibt **unverändert die äußere, nicht verhandelbare Schranke** — Need-to-Know verschärft nur additiv innerhalb des Tenants.

**Begründung:** Die Multi-Tenant-Invariante (jede Policy geht durch die etablierten Helper) darf nicht aufgeweicht werden. Need-to-Know ist eine Verschärfung, kein paralleles Berechtigungsmodell.

**Konsequenz:** Dies ist der **risikoreichste Fork**. PROJ-100 trägt eine **Pentest-Pflicht-AC** (Cross-Circle-Leak, Rechte-Eskalation, Cross-Tenant trotz Klassifikation). PROJ-100 wird in **100a (RLS-Helper + Klassifikations-Ebenen)** und **100b (Inner-Circle-Profile + 4-Augen + „Wer-darf-was"-View)** gesplittet (analog dem Slicing von PROJ-1).

### Fork 3 — Class-3 (Datenschutz) und M&A-Vertraulichkeit sind zwei getrennte Achsen

**Entscheidung:** Class-3 ([data-privacy-classification.md](data-privacy-classification.md), PII → technisch von externen LLMs geblockt) und M&A-Confidentiality (Need-to-Know, Inner Circle) sind **orthogonale Achsen** und koexistieren. Ein M&A-confidential Objekt ist **nicht automatisch Class-3**. Aber: Target-Personendaten in der DD (z.B. Management-Profile, Mitarbeiterlisten) **sind** Class-3 → AI-Proposals darauf laufen **tenant-Ollama-only** (Defense-in-depth wie PROJ-88).

**Begründung:** Die beiden Achsen verwechseln führt entweder zu unnötig blockierter AI (alles M&A-confidential → fälschlich Class-3) oder zu PII-Leak (M&A-Objekt mit Personendaten → fälschlich als „nur confidential" an Cloud-Modell). Die Invariante #3 (Class-3-Hard-Block) bleibt unberührt.

### Fork 4 — Datenraum-Anbindung (PROJ-115) = Verlinkung, nicht Integration; DMS bleibt PROJ-79

**Entscheidung:** PROJ-115 (externe Datenräume/VDR) ist **nur externe URL-Referenz + Link-Check** über das Connector-Framework ([connector-framework.md](connector-framework.md), PROJ-14). Interne Dokumente bleiben Sache des DMS (PROJ-79). Eine echte VDR-API-Integration (Dokument-Sync) ist **„Could", separat, pilot-getrieben** — nicht Teil des Epics.

**Begründung:** Die Spec sagt selbst „Verlinkung, nicht Ersatz". Eine VDR-Integration wäre ein eigenes Connector-Projekt mit Auth/Sync/Konflikt-Semantik (vgl. PROJ-47/50 Jira-Aufwand).

### Fork 5 — Projekt-Templates (PROJ-96) = Rule-Engine-Preset + Copy-on-create

**Entscheidung:** Standardphasen/-rollen kommen aus einem **Rule-Engine-Preset** (PROJ-6, deklarativ); inhaltliche Vorbefüllung (Standard-Aufgaben, Deliverable-Katalog-Vorlagen) über **Copy-on-create** beim Projekt-Anlegen. Kein generisches „Projekt-aus-Projekt-klonen"-Feature in v1.

**Begründung:** Der Core hat heute kein Template-System — das ist die eine **echte strukturelle Lücke** im Epic. Der Rule-Engine-Weg fügt sich in den bestehenden `compute_rules(type, method)`-Mechanismus, ohne ein schweres Klon-Feature zu bauen.

## Reuse-Matrix (verbindlich für die Pro-Spec-Annotation)

Legende: **REUSE** = Feld/Config-Erweiterung eines deployed Core-Features · **EXTEND** = neue M&A-Extension auf Core-Pattern · **VIEW** = reine Report/Aggregation · **DUP→REUSE** = Redundanz-Risiko, als Erweiterung statt Neubau schneiden · **EXTEND-Foundation** = neuer Foundation-Knoten, blockiert viele.

| Spec | Klasse | Andockpunkt |
|---|---|---|
| 94 M&A-Projekt anlegen | REUSE | PROJ-2 CRUD + PROJ-5 Wizard + PROJ-6 `project_type='ma'` |
| 95 Phasenmodell | DUP→REUSE | PROJ-19 + PROJ-6 Method-Catalog |
| 96 Projekt-Templates | EXTEND | PROJ-6 Rule-Engine-Preset + Copy-on-create (echte Lücke) |
| 97 Projektrollen/RACI | DUP→REUSE | PROJ-4 RBAC + PROJ-57; RACI-Feld neu |
| 98 Gremien/Steuerungskreise | EXTEND | neue `committees`-Tabelle |
| 99 Externe Berater | EXTEND | PROJ-1 Memberships + Mandats-/NDA-Felder + Class-3 |
| 100 Need-to-Know | EXTEND-Foundation | RLS-Sublayer (Fork 2) — split 100a/100b |
| 101 Aufgaben | DUP→REUSE | PROJ-9 Work-Items (kind=task) |
| 102 Workstreams | EXTEND | Gruppierung über Work-Items (merge mit 127) |
| 103 Engpass-Übersicht | VIEW | Aggregation auf PROJ-9/19 |
| 104 Deliverable-Katalog | EXTEND | neue `deliverables` (an PROJ-79 DMS) |
| 105 Freigabe-Workflow Deliverables | DUP→REUSE | PROJ-31 Approval-Gates |
| 106 Versionierung Deliverables | DUP→REUSE | PROJ-10 Field-Level-Versioning |
| 107 Risikoregister | DUP→REUSE | PROJ-20 Risks (Score/Heatmap teils neu) |
| 108 Red-Flag-Log DD | ~~EXTEND~~ **Superseded by 114** | Durch PROJ-114 `dd_findings` absorbiert (CIA 2026-06-26): „Red Flag" = hochsevere(s) Finding, kein eigenes Datenkonzept. Rest → 116 (Report) / 120-122 (Übernahme) / PROJ-Y-1 (source_ref) / PROJ-Y-2 (Lens). |
| 109 Maßnahmen-Tracking | DUP→REUSE | PROJ-20 Open-Items + PROJ-9 |
| 110 Stage-Gate-Workflow | DUP→REUSE | PROJ-31 + PROJ-19 Phasen-Transition |
| 111 Entscheidungslog | DUP→REUSE | PROJ-20 Decisions (immutable+supersedes vorhanden) |
| 112 DD-Streams | EXTEND-Foundation | neues DD-Backbone |
| 113 DD-Fragenkatalog/Q&A | EXTEND | neue `dd_questions` |
| 114 DD-Findings | EXTEND | neue `dd_findings` (quantifiziert, ≠ risk) |
| 115 Externe Datenräume | REUSE | PROJ-79 DMS + PROJ-14 Connector (nur Links, Fork 4) |
| 116 DD-Berichte/Red-Flag-Report | VIEW | PROJ-21 Output-Rendering |
| 117 Gremien/Meeting-Verwaltung | EXTEND | meetings auf PROJ-13 |
| 118 Kommunikationsmatrix | EXTEND | PROJ-13 + Klassifikation |
| 119 Vertraul. Verteilung | REUSE | PROJ-13 + PROJ-129 |
| 120 Bewertungsmodell/Business-Case | EXTEND | neu (an PROJ-22 Budget) |
| 121 Kaufpreis-Bridge | EXTEND | neu (M&A-spezifisch) |
| 122 SPA Issues-List | EXTEND | neu (an PROJ-20 Open-Items denkbar) |
| 123 Closing-Conditions | EXTEND | neu (Checklisten-Pattern) |
| 124 Closing-Durchführung/Übergabe | EXTEND | neu (PMI-Brücke) |
| 125 Day-1/100-Tage-Plan | DUP→REUSE | PROJ-9/19 (Sub-Projekt-Plan) |
| 126 Synergie-Tracking | EXTEND | neu (an PROJ-22 Budget) |
| 127 PMI-Workstreams/IMO | REUSE | = 102 im PMI-Kontext (merge) |
| 128 NDA-Verwaltung | EXTEND | neu (Bündel mit 99/129) |
| 129 Vertraul.-Klassifikation | EXTEND-Foundation | erweitert Class-3-Modell (Fork 2/3) |
| 130 Audit-Trail | DUP→REUSE | PROJ-10 (vollständig vorhanden) |
| 131 Management/Steering-Dashboard | VIEW | PROJ-64 + PROJ-21 |
| 132 Operatives Reporting | VIEW | PROJ-21 + PROJ-64 |

**Summe: 11 DUP→REUSE · 4 REUSE · 12 EXTEND · 4 VIEW · 3 EXTEND-Foundation** (96/112/100 sind die echten neuen Foundations; über die Hälfte ist kein Neubau).

## Single-Responsibility-Konsolidierung (verbindlich vor /requirements je Spec)

- **Merge:** 102+127 (ein Workstream-Feature, IMO ist Config) · 128+129+99-NDA-Teil (ein Vertraulichkeits-Bündel) · 131+132 (eine Report-Engine, zwei Presets analog PROJ-21).
- **Downgrade auf Config-Erweiterung** (kein eigener Build): 130→PROJ-10 · 111→PROJ-20 Decisions · 106→PROJ-10 · 105→PROJ-31.
- **Split:** 100 → 100a (RLS-Helper + Ebenen) / 100b (Inner-Circle-Profile + 4-Augen + View).

## Execution Readiness

PROJ-94 macht den Deal-Raum anlegbar, aber noch nicht vollständig durchführbar. Der minimale Pfad zum DD-Pilot ist:

```
PROJ-100b -> PROJ-95 -> PROJ-97 -> PROJ-99/128/129 -> PROJ-112 -> PROJ-113 -> PROJ-114 -> PROJ-110/111 -> PROJ-116
```

> **Update 2026-06-26:** PROJ-108 (Red-Flag-Log) ist aus der Kette entfernt — durch das deployte PROJ-114 (`dd_findings`) absorbiert (Superseded; CIA-Review). Der Red-Flag-Report bleibt Teil von PROJ-116; die Bewertungs-/SPA-Übernahme wandert nach PROJ-120/121/122. Stand der Kette: 100b/95/97/99/128/129/112/113 deployed, 114 in QA, offen 110/111 + 116.

Die Kriterien und Gates stehen im Readiness-Guide [`docs/ma-project-execution-readiness.md`](../ma-project-execution-readiness.md). Dieser Guide ist operativ führend für "was muss als Nächstes sichtbar gebaut werden"; diese ADR bleibt führend für "wie wird es architektonisch geschnitten".

## Release-Sequenz (siehe Sequencing-Doc für Details)

- **Release 0 (Foundation-Lock):** diese ADR + PROJ-6 `project_type='ma'` + M&A-Method-Catalog + PROJ-100 Need-to-Know-RLS.
- **Release 1 (Deal-Setup & Governance):** 94 · 95 · 97 · 99 · 130/10-Config.
- **Release 2 (DD-Kern, frühester Pilot-Wert):** 112 · 113 · 114 · 108 · 115 · 110 · 111 · 116.
- **Release 3 (Risiko/Deliverables/Aufgaben):** 101 · 102+127 · 104 · 105/106 · 107/109 · 98/117.
- **Release 4 (Transaktion & Reporting):** 120 · 121 · 122 · 123/124 · 131+132 · 118/119.
- **Release 5 (PMI/Integration):** 125 · 126 · 128/129.

## Offene Fragen (an Produkt/User, nicht blockierend für Release 0)

- Buy-Side / Sell-Side / Carve-out / JV als separate `project_type`-Varianten oder Template-Varianten von `ma`?
- Externe Berater (PROJ-99): Gast-Pool im Tenant vs. IdP-Federation — betrifft PROJ-1 Auth.
- Interne Jira-Codes A1–M2 in den Specs durch PROJ-X-Cross-Refs ersetzen? (Empfehlung: ja, sonst Pflege-Drift.)

## Konsequenzen

- **Positiv:** Scope und Risiko des Epics halbieren sich (≈½ ist Core-Reuse); Audit/Approval/Stakeholder/Reporting bleiben ein einziges geteiltes System; kein Daten-Silo.
- **Negativ/Aufwand:** Release 0 liefert keinen direkten User-Wert, ist aber Voraussetzung; die DUP→REUSE-Specs müssen vor `/requirements` auf Erweiterungs-Scope eingedampft werden (sonst binden sie Aufwand für bereits Gebautes).
- **Folge-Schritt:** Jede der 39 Specs trägt nun eine **„V3 Core Reuse"-Annotation** (Klasse + Andockpunkt, abgeleitet aus der Matrix oben). `/requirements`/`/architecture` je Spec MUSS diese Annotation + diese ADR respektieren.
