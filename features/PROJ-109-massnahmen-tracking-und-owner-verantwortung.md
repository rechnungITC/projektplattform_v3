---
id: PROJ-109
title: "Maßnahmen-Tracking und Owner-Verantwortung"
issue_type: Story
epic_code: E
epic_title: "Risiken & Red Flags"
priority: Medium
priority_source: "Should"
labels: ["ma-platform", "epic-e", "should-have"]
dependencies: ["E1", "E2", "C1", "F1"]
roles: ["Risiko-Owner", "PMO-Lead", "Deal Lead"]
summary_for_jira: "[E3] Maßnahmen-Tracking und Owner-Verantwortung"
---

# PROJ-109: Maßnahmen-Tracking und Owner-Verantwortung

## Status: In Progress (backend done)
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic E — Risiken & Red Flags)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **DUP→REUSE** · Andockpunkt: PROJ-20 Open-Items + PROJ-9. Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** E — Risiken & Red Flags  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should  
> **Labels:** `ma-platform` · `epic-e` · `should-have`  
> **Abhängigkeiten:** `E1`, `E2`, `C1`, `F1`

**User Story:**

Als Risiko-Owner möchte ich Maßnahmen zu meinen Risiken und Red Flags definieren, terminieren und im Status verfolgen, damit klar ist, ob ein Risiko aktiv adressiert wird oder offen bleibt.

**Beschreibung / Kontext:**

Risiken ohne Maßnahmen sind im M&A-Umfeld ein häufiges Problem. Die Plattform muss erzwingen oder zumindest unterstützen, dass jedes nicht-akzeptierte Risiko mindestens eine Maßnahme hat oder begründet ohne Maßnahme bleibt.

**Akzeptanzkriterien:**

- [ ] Pro Risiko und Red Flag kann mindestens eine Maßnahme angelegt werden, die als Aufgabe (C1) referenziert ist.
- [ ] Maßnahmen haben Status (geplant, in Umsetzung, umgesetzt, verworfen) und Frist.
- [ ] Werden Risiken auf Status 'aktiv' geführt, prüft die Plattform vor Stage-Gate-Übergang (F1), ob Maßnahmen oder begründete Akzeptanz vorliegen, und gibt Hinweise.
- [ ] Eine Maßnahmen-Übersicht ist je Risiko, je Risiko-Owner und je Workstream verfügbar.

**Abgrenzungen (Out of Scope):**

- Wirtschaftlichkeitsbewertung der Maßnahmen ist nicht in Scope.
- Plattform erzwingt keine Maßnahme zwingend, sondern weist hin.

**Offene Fragen:**

- Soll der Maßnahmen-Hinweis bei Stage-Gate hart blockierend oder weich beratend sein?

**Definition of Ready:**

- [ ] Verknüpfung Risiko ↔ Maßnahme ist konzeptionell geklärt.

**Definition of Done:**

- [ ] Verknüpfung und Übersicht funktionieren.

**Abhängigkeiten:**

- E1, E2
- C1
- F1

**Betroffene Rollen:**

- Risiko-Owner
- PMO-Lead
- Deal Lead

---

## Tech Design (Solution Architect) — 2026-07-21

> **Reuse-Klasse: DUP→REUSE** · Andockpunkt laut ADR: **PROJ-20 Open-Items + PROJ-9**. Nach Bestandsaufnahme wird der Andockpunkt präzisiert (siehe unten): Der **Maßnahmen-Primitiv existiert bereits** — PROJ-107 hat ihn beim Risikoregister mitgeliefert. PROJ-109 baut **kein neues Datenmodell**, sondern eine dünne **Übersichts-/Abdeckungs-Schicht** darüber.

### Kernbefund der Bestandsaufnahme (was schon da ist)

Eine „Maßnahme" ist in dieser Plattform bereits definiert: **eine Aufgabe (`work_item`, `kind='task'`), die per `risk_links` an ein Risiko gehängt ist.** Konkret gebaut und live:

- **`risk_links`** (PROJ-65, erweitert durch PROJ-107) verknüpft ein Risiko polymorph mit `phase | sprint | work_item | deliverable`. Der `work_item`-Zweig wird in der bestehenden UI **wörtlich als „Aufgaben (Maßnahmen)"** geführt (`risk-links-tab.tsx`). → **AC1 (Risiko-Seite) ist im Datenmodell bereits erfüllt.**
- **`work_items`** tragen bereits **Status** (`todo → in_progress → blocked → done → cancelled`) und **Frist** (`due_date`, PROJ-101) sowie **Verantwortlichen** (`responsible_user_id`) und **Workstream** (`workstream_id`, PROJ-102). → **AC2 ist im Datenmodell bereits erfüllt** (nur die fachliche Beschriftung „geplant/in Umsetzung/umgesetzt/verworfen" wird auf die vorhandenen Status gemappt).
- **`risks`** trägt bereits `status` (`open | mitigated | accepted | closed`), ein Freitext-Feld **`mitigation`** (Begründung/Plan), `responsible_user_id` (Risiko-Owner) und `workstream_id`. → **„begründete Akzeptanz ohne Maßnahme" ist nativ abbildbar** über `status='accepted'` + `mitigation`-Text. Kein neues Feld nötig.
- **Red Flag = hochsevere(s) `dd_finding`** (PROJ-114; `severity ∈ {hoch, deal_breaker}`). Findings haben `linked_risk_id` (FK auf `risks`) und `recommended_treatment`. → Eine Maßnahme zu einem Red Flag läuft über die Kette **Finding → verknüpftes Risiko → dessen Maßnahmen-Aufgaben**. Kein direkter Finding→Task-Link nötig (DUP→REUSE, kein Parallelweg).

**Konsequenz:** PROJ-20 **Open-Items** (Klärungs-Tracker, konvertierbar zu work_items/decisions) ist **nicht** die Heimat der Maßnahmen — der eigentliche Andockpunkt ist **`risk_links(work_item)` + `work_items` + `risks.mitigation/status`**. Die ADR-Zeile wird entsprechend als „PROJ-20 (risks/mitigation) + PROJ-9 (task) via PROJ-107 risk_links" gelesen.

### Was PROJ-109 tatsächlich neu liefert

Nur die zwei noch offenen ACs, beide als **Lesesicht/Ableitung** ohne neues Schreibmodell:

1. **AC4 — Maßnahmen-Übersicht** je Risiko, je Risiko-Owner und je Workstream.
2. **AC3 — Abdeckungs-Hinweis** („aktives Risiko ohne Maßnahme und ohne begründete Akzeptanz") als **weicher, beratender Hinweis** und als **vorwärtskompatibler Vertrag** für den späteren Stage-Gate-Check (PROJ-110, noch nicht gebaut).

### A) Komponentenstruktur (was gebaut wird)

```
M&A-Projektraum
+-- Risiken (bestehend, PROJ-20/107)
|   +-- Risiko-Drawer
|       +-- Tab "Verknüpfungen" (bestehend) → hier werden Maßnahmen-Aufgaben verknüpft
|       +-- NEU: Abdeckungs-Badge am Risiko ("Aktiv – keine Maßnahme/Akzeptanz")   ← AC3 (weich)
|
+-- NEU: Sektion "Maßnahmen" (eigener Tab im M&A-Raum)                              ← AC4
    +-- Umschalter: Gruppierung [ nach Risiko | nach Risiko-Owner | nach Workstream ]
    +-- Zeile je Maßnahme (= verknüpfte Aufgabe)
    |   +-- Titel · Status-Badge · Frist (rot bei überfällig) · Verantwortlicher
    |   +-- übergeordnetes Risiko (Titel + Risiko-Owner + Workstream)
    +-- Abdeckungs-Zusammenfassung: X von Y aktiven Risiken ohne Maßnahme/Akzeptanz
    +-- Empty-/Loading-/Error-State + Vertraulichkeits-gefilterte Sicht
```

Wiederverwendete Bausteine (nicht neu bauen): der bestehende **„Verknüpfungen"-Tab** im Risiko-Drawer bleibt der Ort, an dem eine Aufgabe als Maßnahme angehängt/entfernt wird. Aufgaben selbst werden weiter über den bestehenden **Aufgaben-Tab** (PROJ-101) angelegt/bearbeitet. PROJ-109 fügt **nur die Übersicht + das Badge** hinzu.

### B) Datenmodell (Klartext)

**Kein neues Schreibmodell, keine neue Tabelle, kein neues Feld.** Eine Maßnahme ist weiterhin:

```
Maßnahme  =  Aufgabe (work_item, kind='task')  die per risk_links an ein Risiko hängt
             ├─ Status   → todo/in_progress/blocked/done/cancelled  (angezeigt als geplant/in Umsetzung/…/umgesetzt/verworfen)
             ├─ Frist    → due_date
             ├─ Owner    → responsible_user_id
             └─ Workstream → workstream_id

Begründete Akzeptanz ohne Maßnahme  =  risk.status='accepted'  +  risk.mitigation (Freitext)
```

**Eine neue Lese-Funktion** liefert die Übersicht **und** den Abdeckungs-Status in einem Aufruf (Muster analog PROJ-116 DD-Report und PROJ-102/104 Dashboard — eine **SECURITY-INVOKER**-Auswertung, die im Kontext des aufrufenden Nutzers läuft):

```
Pro Risiko des Projekts:
  - Risiko: Titel, Status, Owner, Workstream, Vertraulichkeit
  - Maßnahmen[]: je verknüpfter Aufgabe → Titel, Status, Frist, Verantwortlicher, Workstream
  - abgedeckt?  =  (mind. 1 verknüpfte Aufgabe)  ODER  (status='accepted' mit Begründung)  ODER  (status in mitigated/closed)
  - aktiv-ohne-Abdeckung?  =  (status='open')  UND  (keine Maßnahme)  UND  (keine begründete Akzeptanz)   ← AC3-Signal
```

**Vertraulichkeit erbt „gratis":** Weil die Auswertung als aufrufender Nutzer läuft und über `risks`/`work_items` joint, greifen deren bestehende **Need-to-know-RESTRICTIVE-Gates** (PROJ-100a/107) automatisch — Nutzer sehen nur Maßnahmen zu Risiken, die sie sehen dürfen. Kein zweites Rechtemodell.

### C) Technische Entscheidungen (Begründung)

| Entscheidung | Begründung |
|---|---|
| **Kein `risk_measures`-Join-Tisch, keine neue „Maßnahme"-Tabelle** | Der Primitiv existiert (`risk_links(work_item)`); eine neue Tabelle würde Status/Frist/Owner der Aufgabe duplizieren → verstößt gegen DUP→REUSE + Invariante „Shared core before specialization". |
| **Maßnahme = `work_item`-Link, kein Diskriminator auf `risk_links`** | Die Live-UI führt `work_item`-Links bereits eindeutig als „Maßnahmen"; `phase/sprint` sind die Aufroll-/Betroffenheits-Links, `deliverable` separat. Ein „betroffene-Aufgabe-statt-Maßnahme"-Fall existiert heute nicht. → dokumentierte Annahme; falls je gebraucht, **PROJ-Y-109a** (Link-Rollen-Diskriminator). |
| **Abdeckungs-Hinweis weich/beratend, nicht hart blockierend** | Die Spec beantwortet ihre eigene offene Frage in „Out of Scope": *„Plattform erzwingt keine Maßnahme zwingend, sondern weist hin."* PROJ-110 (Stage-Gate) ist noch nicht gebaut → AC3 wird als **read-only Signal** geliefert, das PROJ-110 später konsumiert. Keine Durchsetzung in PROJ-109. |
| **Übersicht als eine SECURITY-INVOKER-Auswertung** | Ein Round-Trip, Need-to-know erbt automatisch (wie PROJ-116/102/104), stabiler Vertrag für PROJ-110/103/131/132. Gruppierung (Risiko/Owner/Workstream) passiert client-seitig aus dem flachen Pro-Risiko-Ergebnis. |
| **Red Flag über verknüpftes Risiko, kein Finding→Task-Direktlink** | `dd_finding.linked_risk_id` reicht bis zu den Maßnahmen des Risikos; ein Parallelweg wäre Redundanz (PROJ-108 wurde genau deshalb von PROJ-114 absorbiert). |

### D) Abhängigkeiten (Pakete)

**Keine.** Kein neues npm-Paket, kein neuer externer Dienst. Genau eine kleine, idempotente Migration für die Auswertungs-Funktion (im Stil PROJ-116).

### AC-Abdeckung

| AC | Wie erfüllt | Neu in PROJ-109? |
|---|---|---|
| AC1 — Maßnahme je Risiko/Red Flag, als Aufgabe referenziert | Risiko-Seite: `risk_links(work_item)` (live). Red Flag: `dd_finding.linked_risk_id` → Risiko → Maßnahmen. | nein (bestehend) — Übersicht macht es sichtbar |
| AC2 — Maßnahmen mit Status + Frist | `work_items.status` + `due_date`; Anzeige-Mapping auf geplant/in Umsetzung/umgesetzt/verworfen | nein (bestehend) — Label-Mapping |
| AC3 — Hinweis vor Stage-Gate bei aktivem Risiko ohne Maßnahme/Akzeptanz | Abdeckungs-Signal aus der Auswertung + weiches Badge; Vertrag für PROJ-110 | **ja** (weich/read-only) |
| AC4 — Übersicht je Risiko / Risiko-Owner / Workstream | Neue „Maßnahmen"-Sektion mit Gruppierungs-Umschalter | **ja** |

### Bewusst außerhalb / vorwärtskompatibel

- **Harte Stage-Gate-Durchsetzung** → PROJ-110 (konsumiert das AC3-Signal).
- **Wirtschaftlichkeitsbewertung von Maßnahmen** → Out of Scope laut Spec.
- **Link-Rollen-Diskriminator auf `risk_links`** (Maßnahme vs. betroffene Aufgabe) → **PROJ-Y-109a**, nur bei echtem Bedarf.
- **Direkter Finding→Maßnahme-Link** → nicht nötig; über verknüpftes Risiko abgedeckt.

### Implementierungs-Notizen — Backend (2026-07-21)

**Live in Prod (Migration `20260721111000_proj109_risk_measure_overview`):** eine read-only Funktion `public.risk_measure_overview(p_project_id uuid) → jsonb`, **SECURITY INVOKER** + `set search_path=public,pg_temp`, `revoke execute … from public, anon` + `grant … to authenticated`. Kein neues Schema/Feld/Tabelle, kein Dep. Sie liefert `{ risks: [...], summary: {...} }`:
- pro Risiko: `id/title/status/responsible_user_id/workstream_id/confidentiality_level/mitigation/probability/impact/score`, plus abgeleitet `measure_count`, `has_measure`, `accepted_with_rationale`, `covered`, `active_uncovered`, und `measures[]` (= per `risk_links(work_item)` verknüpfte, nicht-gelöschte `work_items` mit `id/title/kind/status/due_date/responsible_user_id/workstream_id`);
- `summary`: `risk_total / active_total (status=open) / active_uncovered / measure_total`.
- **Abdeckungs-Logik:** `covered = has_measure OR (status='accepted' AND mitigation nicht leer) OR status∈{mitigated,closed}`. `active_uncovered = status='open' AND kein Measure AND keine begründete Akzeptanz` → **AC3-Signal (weich)**.
- **Need-to-know erbt gratis:** INVOKER + Join über `risks`/`work_items` → deren RESTRICTIVE `can_access_classified`-Gates (PROJ-100a/107) filtern zeilenweise vor der Aggregation. Kein zweites Rechtemodell.

**API:** `GET /api/projects/[id]/risk-measure-overview` (`src/app/api/projects/[id]/risk-measure-overview/route.ts`) — session-gebundener User-Client (nie service-role), `requireProjectAccess(view)`, UUID-Validierung, RPC-Delegation, Null→leere-Übersicht-Normalisierung. **Client-Wrapper:** `fetchRiskMeasureOverview` + Typen in `src/lib/risks/measure-overview.ts`.

**Pflicht-Live-RPC-Smoke gegen Prod (rolled back, 0 Residue):** Eigenschaften `is_definer=false / auth_exec=true / anon_exec=false`. Funktional (atomarer DO-Block mit Rollback-Marker): (A) offenes Risiko ohne Measure → `active_uncovered=true, has_measure=false, covered=false`; akzeptiert+Begründung ohne Measure → `accepted_with_rationale=true, covered=true, active_uncovered=false`; (B) nach Anhängen einer verknüpften Aufgabe → `has_measure=true, active_uncovered=false, covered=true, measure_count=1`, Measure-Titel korrekt; `summary={risk_total:2, active_total:1, measure_total:1, active_uncovered:0}`. Residue-Check 0/0.

**Quality-Gates:** route.test 5/5, ESLint 0, tsc 14 baseline/0 neu, vitest **2273/2273** (+5), build clean (Route `/api/projects/[id]/risk-measure-overview` registriert), Supabase security-Advisor 0 ERROR (Funktion nicht gelistet — INVOKER + fixed search_path).

**Offen → /frontend:** „Maßnahmen"-Sektion (Tab, gruppierbar Risiko/Owner/Workstream) + weiches Abdeckungs-Badge am Risiko. → /qa: rollenbasierter Need-to-know-Pentest (INVOKER-Aggregat kein Leak) + Playwright-Auth-Gate.

### Implementierungs-Notizen — Frontend (2026-07-21)

**Neuer M&A-Projektraum-Tab „Maßnahmen"** (`massnahmen`, `requiresProjectType='ma'`, injiziert nach Deliverables via `MA_MEASURES_SECTION` in `method-templates/index.ts`, Icon `ShieldAlert`). Route `src/app/(app)/projects/[id]/massnahmen/page.tsx` → `MaMeasuresPage`.

**`MaMeasuresPage`** (`src/components/projects/ma/ma-measures-page.tsx`) — read-only:
- **Gruppierungs-Umschalter** (shadcn Select): nach Risiko / nach Risiko-Owner / nach Workstream (AC4). Bei Owner/Workstream-Gruppierung: Gruppen mit ungedeckten Risiken zuerst, `N ungedeckt`-Badge je Gruppe.
- **Abdeckungs-Banner** (AC3): rot „X von Y aktiven Risiken ohne Maßnahme/begründete Akzeptanz" bzw. grün „alle aktiven Risiken abgedeckt" — aus `summary.active_uncovered/active_total`.
- **Pro Risiko eine Card**: Titel + Severity-Badge (PROJ-107 `riskSeverityBadgeTone`) + Risiko-Status-Badge + **`CoverageBadge`** (rot „Aktiv – keine Maßnahme/Akzeptanz" bei `active_uncovered`, „Akzeptiert (begründet)" bei `accepted_with_rationale`, sonst „Abgedeckt"). Meta: Owner + Workstream + Maßnahmen-Zahl. Darunter Maßnahmen-Liste (Titel · Status-Badge · Verantwortlicher · Workstream · Frist rot bei überfällig) ODER die Akzeptanz-Begründung ODER „Keine Maßnahme verknüpft".
- Loading/Error(+Retry)/Empty-States. Namen via `useTenantMembers`, Workstream-Labels via `useWorkstreams`.

**Neuer Hook** `useRiskMeasureOverview` (`{overview, loading, error, refresh}`, `let cancelled`-Pattern).

**Label-Entscheidung (DUP→REUSE):** Maßnahmen-Status nutzt die plattformweiten `WORK_ITEM_STATUS_LABELS` (Offen/In Arbeit/Blockiert/Erledigt/Abgebrochen) statt einer M&A-Sonderbeschriftung — Konsistenz vor der Spec-Klammer-Wortwahl „geplant/in Umsetzung/umgesetzt/verworfen". Falls der Pilot die M&A-Wortwahl explizit will → Followup PROJ-Y-109b.

**Scope-Entscheidung:** AC3 wird in der Maßnahmen-Übersicht (Banner + per-Risiko-Badge, ungedeckte zuerst) geliefert; ein zusätzliches Badge in der geteilten Risiko-Tabelle (PROJ-20/107) wurde bewusst NICHT ergänzt (Shared-Component-Churn vermeiden, kein AC verlangt es dort). Harte Stage-Gate-Durchsetzung bleibt PROJ-110.

**Kein neues Dep, kein Backend-/Schema-Change.** Gates (Worktree `proj-109/architecture`): ESLint 0/0, tsc 14 baseline/0 neu, vitest 2273/2273, build clean (Route `/projects/[id]/massnahmen` registriert), method-templates/routing 124/124. → /qa (Need-to-know-Pentest INVOKER-Aggregat + Playwright Auth-Gate + Grouping-Smoke).

### CIA-Einordnung

Diese Slice ist **spec-folgend + prior-art-geklärt**: kein neues Paket, keine neue Tabelle, kein ≥5-Datei-Refactor, kein genuin offener Fork (Maßnahmen-Modell durch PROJ-107 gesetzt; Gate-Härte durch Spec-„Out of Scope" gesetzt; Auswertungs-RPC ist etabliertes Muster aus PROJ-116/102/104). Damit **keine CIA-Pflicht** nach `.claude/rules/continuous-improvement.md`. Der Nutzer kann dennoch eine CIA-Zweitmeinung anfordern, bevor `/backend` startet.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · E — Risiken & Red Flags_
