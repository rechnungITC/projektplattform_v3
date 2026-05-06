# PROJ-43: Stakeholder-Health Critical-Path Detection — Korrektheits- und Coverage-Fix

## Status: Deployed (43-α + β) + Architected (43-γ)
**Created:** 2026-05-05
**Last Updated:** 2026-05-05

## Kontext

Im Stakeholder-Health-Dashboard (PROJ-35-γ, deployed) wird der `Auf kritischem Pfad`-Badge pro Stakeholder berechnet. Die aktuelle Detection-Query in `src/app/api/projects/[id]/stakeholder-health/route.ts:91-118` ist auf einem zu engen Pfad: nur Stakeholder, die über `resources.source_stakeholder_id` mit einer Resource verknüpft sind UND deren Resource via `work_item_resources` an ein Work-Item mit `phase_id` allokiert ist UND dessen Phase manuell `is_critical=true` hat, bekommen den Badge.

Das ist ein Korrektheits-Bug: der naheliegendste Assignment-Pfad in der UI (`work_items.responsible_user_id`, gesetzt im Edit-Dialog, Wizard, Backlog) wird komplett ignoriert. Symptomatisches User-Feedback (2026-05-05): zwei zugewiesene Personen auf demselben kritischen Arbeitspaket — eine via Resource-Allocation („icke"), eine via Verantwortlicher-Feld („Test") — werden im Dashboard unterschiedlich gekennzeichnet, obwohl beide auf dem kritischen Pfad sind.

CIA-Review (2026-05-05) hat die drei eingangs identifizierten Gaps bestätigt, ein viertes Loch entdeckt (Gap 1b: Resources, die ausschließlich über `linked_user_id` ohne `source_stakeholder_id` allokiert sind), und eine α/β/γ-Slice-Struktur empfohlen. Diese Spec setzt die CIA-Empfehlung um.

## Slice-Struktur

| Slice | Inhalt | Priorität | Schema-Change |
|---|---|---|---|
| **43-α** | Detection-Query-Korrektheit: `responsible_user_id`-Pfad + `linked_user_id`-only-Resources + Projekt-Filter | **Must-have** (MVP) | Nein |
| **43-β** | Sprint-Pfad: `sprints.is_critical`-Boolean + Method-Gating (PROJ-26-Catalog-getrieben) | Should-have | Ja (1 Spalte + 12+ Audit-Whitelists) |
| **43-γ** | Computed-Critical-Path-Marker: zweiter Flag aus `compute_critical_path_phases` (RPC), niemals Trigger | Deferred | Ja (View oder Spalte, später entscheiden) |

α kann ohne β/γ deployed werden und ist die einzige zwingende Komponente. β und γ sind eigenständige Erweiterungs-Slices.

## Dependencies

- Requires: **PROJ-35** (Stakeholder-Wechselwirkungs-Engine, deployed) — γ-Phase liefert den Health-Dashboard-Endpoint, der erweitert wird
- Requires: **PROJ-9** (Work Item Metamodel, deployed) — `work_items.responsible_user_id` Spalte
- Requires: **PROJ-11** (Resources/Capacity, deployed) — `resources.linked_user_id` Spalte
- Requires (β only): **PROJ-26** (Method-Gating, deployed) — Catalog für Sprint-vs-Phase-Detection-Source
- Requires (β only): **PROJ-9** Sprint-Schema — `sprints` Tabelle für `is_critical`-Spalte
- Requires (β only): **PROJ-42** (Schema-Drift-CI-Guard, deployed) — Audit-Whitelist-Update muss durch CI laufen
- Requires (γ only): **PROJ-25** (Gantt + Critical-Path) — `compute_critical_path_phases` RPC

## User Stories

### α (Must-have)

1. **Als PM** möchte ich, dass ein als „Verantwortlicher" auf einem Work-Item gesetzter User im Stakeholder-Health-Dashboard als „auf kritischem Pfad" markiert wird, sofern das Work-Item in einer kritischen Phase liegt — damit ich keine Eskalations-relevanten Personen übersehe, nur weil sie nicht über die Resource-Allocation zugewiesen wurden.

2. **Als PM** möchte ich, dass ein direkt über `linked_user_id` allokierter User (Resource ohne Stakeholder-Promote) genauso markiert wird wie ein über `source_stakeholder_id` verknüpfter Stakeholder — damit der Indikator nicht vom Anlage-Pfad der Resource abhängt.

3. **Als PM** möchte ich, dass die Critical-Path-Berechnung im Dashboard auf das aktuelle Projekt eingeschränkt ist — damit Performance bei wachsenden Tenants nicht degradiert.

### β (Should-have)

4. **Als Scrum-PM** möchte ich einen Sprint als „kritisch" kennzeichnen können, sodass alle Stakeholder, die einem Work-Item in diesem Sprint zugeordnet sind, das Critical-Path-Badge erhalten — damit das Feature für Scrum-Methoden nicht still leer bleibt.

5. **Als PM einer Hybrid-Methode** möchte ich, dass Critical-Path-Detection sowohl die Phasen- als auch die Sprint-Quelle berücksichtigt — abhängig davon, welche Konstrukte meine Methode laut PROJ-26-Catalog freigibt.

### γ (Deferred)

6. **Als PM, der die Gantt-Critical-Path-Berechnung nutzt** möchte ich, dass das Stakeholder-Health-Dashboard auch ohne manuelles `is_critical`-Häkchen die rechnerisch ermittelten kritischen Phasen berücksichtigt — damit ich beim Onboarding nicht erst alle Phasen manuell markieren muss.

7. **Als PM mit eigener fachlicher Einschätzung** möchte ich, dass mein manueller `is_critical`-Flag NICHT durch den Algorithmus überschrieben wird — damit meine PM-Aussage Vorrang behält und sichtbar von der rechnerischen Empfehlung getrennt bleibt.

## Acceptance Criteria

### α — Detection-Korrektheit (Must-have)

- [ ] AC-α-1: Wenn Stakeholder S `linked_user_id = U` hat und Work-Item W `responsible_user_id = U` hat und W's Phase `is_critical=true` ist, dann liefert `GET /api/projects/{id}/stakeholder-health` für S `on_critical_path: true`.
- [ ] AC-α-2: Wenn Stakeholder S `linked_user_id = U` hat und Resource R `linked_user_id = U` (ohne `source_stakeholder_id`) hat und R via `work_item_resources` an Work-Item W mit kritischer Phase allokiert ist, dann ist `on_critical_path` für S `true`.
- [ ] AC-α-3: Wenn Stakeholder S `source_stakeholder_id = S.id` (Status quo) UND zusätzlich über `responsible_user_id` auf einem zweiten Work-Item zugewiesen ist, wird S **einmalig** als `true` markiert (Idempotenz, keine doppelte Auswertung).
- [ ] AC-α-4: Stakeholder ohne `linked_user_id` und ohne Resource-Verknüpfung bleiben `on_critical_path: false` (keine Falsch-Positive durch Namensgleichheit).
- [ ] AC-α-5: Inaktive Stakeholder (`is_active=false`) sind nicht im Dashboard und liefern keine `on_critical_path`-Auswertung — Status quo bleibt.
- [ ] AC-α-6: Detection-Query ist explizit auf das aktuelle Projekt gefiltert (`work_items.project_id = projectId` UND `work_item_resources.project_id = projectId`) — keine Cross-Projekt-Auswertung.
- [ ] AC-α-7: Kein Schema-Change, keine Migration, keine Audit-Whitelist-Anpassung nötig.
- [ ] AC-α-8: Test-Coverage in `route.test.ts` mit drei expliziten Szenarien: (i) nur Resource-Stakeholder, (ii) nur Resource-LinkedUser, (iii) nur `responsible_user_id`. Jeder Pfad muss isoliert das Badge auslösen.
- [ ] AC-α-9: Performance: zusätzliche Query darf nicht mehr als +50ms zur Endpoint-Antwort beitragen (gemessen am p95 mit 50 Stakeholdern · 100 Work-Items · 20 Phasen).

### β — Sprint-Pfad + Method-Gating (Should-have)

- [ ] AC-β-1: Migration fügt `sprints.is_critical boolean not null default false` hinzu (analog `phases.is_critical`).
- [ ] AC-β-2: Edit-Sprint-Dialog erhält Checkbox `is_critical` mit identischer Semantik zum Phase-Pendant.
- [ ] AC-β-3: Detection-Query liest **methodenabhängig** aus PROJ-26-Catalog, ob Phase-Pfad, Sprint-Pfad oder beide gewertet werden:
  - Wasserfall (Methoden mit Phasen-Konstrukt): Phase-Pfad
  - Scrum (Methoden mit Sprint-Konstrukt, ohne Phase): Sprint-Pfad
  - Hybrid (beide Konstrukte aktiv): beide Pfade per `OR`
- [ ] AC-β-4: Audit-Whitelists in **allen** `_tracked_audit_columns`-Definitionen für `sprints` werden um `is_critical` ergänzt (Schema-Drift-CI-Guard PROJ-42 muss grün laufen).
- [ ] AC-β-5: PROJ-42-CI-Run im Migrations-PR muss grün sein, kein Drift-Fail.
- [ ] AC-β-6: Test in `route.test.ts` für Scrum-Methode: Sprint-`is_critical=true` + responsible_user_id auf Sprint-Item → Stakeholder markiert.
- [ ] AC-β-7: Migration ist idempotent (`add column if not exists`).

### γ — Computed-Critical-Path-Marker (Deferred)

- [ ] AC-γ-1: Neue VIEW `phases_with_computed_critical_path` (oder gecachte Spalte, Architektur entscheidet `/architecture`) liefert pro Phase `is_on_computed_critical_path: boolean` aus `compute_critical_path_phases`-RPC.
- [ ] AC-γ-2: Detection-Query verknüpft per `OR` den manuellen `is_critical` und den computed-Flag.
- [ ] AC-γ-3: Manueller Flag wird **niemals** durch den Algorithmus überschrieben — keine Trigger, keine UPDATE-Statements auf `phases.is_critical` durch das System.
- [ ] AC-γ-4: Edit-Phase-Dialog zeigt computed-Wert read-only neben dem manuellen Flag mit klarer Beschriftung („Vom Gantt-Algorithmus erkannt" vs. „Vom PM markiert").
- [ ] AC-γ-5: Stakeholder-Health-Dashboard-Aggregat unterscheidet im Tooltip zwischen manuell/computed-Quelle, falls beide aktiv.

## Edge Cases

### α
- **EC-α-1: Stakeholder mit `linked_user_id`, aber User ist nicht mehr Tenant-Mitglied** → Status quo: Stakeholder bleibt im Dashboard sichtbar (RLS auf Stakeholder, nicht User), `on_critical_path` wird ausgewertet, sofern `responsible_user_id`-Match besteht. Kein Sonderfall.
- **EC-α-2: Stakeholder mit `linked_user_id`, derselbe User ist `responsible_user_id` auf zwei Work-Items, eines kritisch, eines nicht** → `true` (Set-Aggregation, idempotent).
- **EC-α-3: Mehrere Stakeholder im selben Projekt teilen sich `linked_user_id`** (theoretisch nicht erlaubt, aber kein Constraint) → beide Stakeholder bekommen `true` (CIA bestätigt: korrektes Verhalten, kein Datenintegritätsproblem für PROJ-43).
- **EC-α-4: Resource hat sowohl `source_stakeholder_id` als auch `linked_user_id` → beide Stakeholder existieren** → Set-Aggregation greift idempotent für jeden separat ausgewerteten Pfad.
- **EC-α-5: Work-Item ist `is_deleted=true`** → wird aus Detection ausgeschlossen (Filter ergänzen).
- **EC-α-6: Phase wurde gelöscht (Cascade `set null` auf `phase_id`)** → Work-Item hat `phase_id=null`, fällt aus Detection raus, kein Fehler.

### β
- **EC-β-1: Methode ist Hybrid (Phase + Sprint)** → beide Pfade aktiv, Set-Aggregation idempotent.
- **EC-β-2: Sprint mit `is_critical=true` enthält Work-Item, das auch `phase_id` zu einer kritischen Phase hat** → Stakeholder einmal als `true` (Set).
- **EC-β-3: Methode ohne Sprint-Konstrukt (Wasserfall) hat Sprint-Datensätze (Migration-Erbe)** → Sprint-Pfad wird aufgrund PROJ-26-Catalog ignoriert, kein Falsch-Positive.

### γ
- **EC-γ-1: `compute_critical_path_phases` schlägt fehl (RPC-Error)** → VIEW liefert leere Critical-Path-Liste, manueller Flag bleibt einzige Quelle, Dashboard funktioniert weiter.
- **EC-γ-2: PM hat Phase manuell `is_critical=true` markiert, Algorithmus erkennt sie als nicht-kritisch** → manueller Flag gewinnt (`OR`-Logik), Tooltip zeigt „PM-markiert, algorithmisch nicht erkannt" als Hinweis.
- **EC-γ-3: Performance-Regression bei großen Projekten (>500 Phasen)** → ggf. Materialized-View statt VIEW, Architektur-Entscheidung in `/architecture` für γ.

## Technical Requirements

### α
- **Backend only:** keine UI-Änderung. Detection-Query in `src/app/api/projects/[id]/stakeholder-health/route.ts` Zeilen 89-118 wird ersetzt.
- **Datenmodell:** kein Change. Genutzte Felder existieren bereits: `work_items.responsible_user_id` (PROJ-9), `resources.linked_user_id` (PROJ-11), `stakeholders.linked_user_id` (PROJ-8).
- **Performance:** zusätzliche Sub-Query für `responsible_user_id`-Pfad muss explizit auf Projekt eingeschränkt sein. Index `work_items_responsible_user_idx` (Migration `20260428110000_proj9_work_items_sprints_dependencies.sql:84`) ist bereits vorhanden.
- **Security:** RLS bleibt aktiv, `requireProjectAccess` mit `view`-Permission ist Status quo.
- **Tests:** Erweiterung von `src/app/api/projects/[id]/stakeholder-health/route.test.ts` um drei neue Test-Cases (siehe AC-α-8).

### β
- **Migration:** `alter table public.sprints add column is_critical boolean not null default false;` mit Comment analog Phase-Migration.
- **Audit-Whitelists:** Update in **allen** `record_audit_changes`-Trigger-Definitionen für `sprints`. Verifikation per Schema-Drift-CI (PROJ-42).
- **Frontend:** Sprint-Edit-Dialog erweitern (Checkbox), analog `edit-phase-dialog.tsx:247`.
- **Method-Gating:** Detection-Query liest `project_methods.allowed_constructs` (oder äquivalente PROJ-26-Catalog-Spalte) und entscheidet Detection-Source.

### γ
- **Architektur-Entscheidung später:** VIEW vs. Materialized-View vs. Spalte mit Refresh-Job.
- **Niemals:** Trigger auf `phases.is_critical` (V2-ADR-Verstoß: PM-Aussage ≠ Algorithmus, vgl. ADR-Pattern „AI as proposal layer").
- **UI-Erweiterung:** Edit-Phase-Dialog zeigt computed-Wert read-only.

## Out-of-Scope (explizit)

- **Promote-to-Resource Edge-Case** (`promote-to-resource/route.ts:67-72` setzt `source_stakeholder_id` nicht, wenn Resource bereits mit anderer `source_stakeholder_id` existiert) — **separater Slice**, ist Identity-Mapping-Bug, nicht Critical-Path-Bug. Empfehlung CIA: PROJ-51-Kandidat oder PROJ-29-Folge.
- **Falsch-Positive-Detection bei Stakeholder-Namensgleichheit** ohne `linked_user_id`/Resource-Link — bewusst nicht im Scope, da PROJ-43 nur über harte FK-Verknüpfungen geht.
- **Decision-Approvals als Critical-Path-Quelle** — nicht relevant (CIA bestätigt: Decisions sind Governance-Pfad, nicht Schedule-Pfad).
- **Materialized-View für Detection-Query in α** — TypeScript-In-Memory-Aggregation ist für ≤50 Stakeholder × ≤500 Work-Items ausreichend; CIA empfiehlt explizit gegen MView in α.

## Risiko-Matrix

| Risiko | Wahrscheinlichkeit | Schwere | Mitigation |
|---|---|---|---|
| Falsch-positive durch zu großzügigen `OR`-Pfad | Niedrig | Mittel | Filter `stakeholder.is_active=true` AND `linked_user_id IS NOT NULL`; Test-Case AC-α-4 |
| Performance-Regression durch zusätzliche Sub-Query | Niedrig | Niedrig | Projekt-Filter setzen (AC-α-6); Index bereits vorhanden; AC-α-9 misst |
| Doppelt gewertete Stakeholder | Niedrig | Niedrig | `Set<string>`-Aggregation idempotent; AC-α-3 explizit |
| β bricht Method-Gating-Annahmen | Mittel | Mittel | Catalog-getrieben statt hardcoded; AC-β-3 |
| γ-Trigger würde V2-ADR verletzen | n/a (nicht implementieren) | Hoch | AC-γ-3 verbietet Trigger; OR-Pfad mit zweitem Flag stattdessen |
| Schema-Drift gegen PROJ-42 | Mittel | Hoch | β: Audit-Whitelist gemeinsam mit Migration committen; CI ist Required-Check |

## V2 Reference Material

- ADR-Pattern: `docs/decisions/stakeholder-vs-user.md` — Stakeholder ≠ User; Bestätigt Korrektheit der `linked_user_id`-Brücke
- ADR-Pattern: `docs/decisions/ai-as-proposal-layer.md` (sinngemäß; PRD-Pkt. 2 „AI as proposal layer") — algorithmische Aussagen überschreiben PM-Aussagen nicht; γ folgt diesem Muster
- V2-Migration: keine direkte Entsprechung; V3 ist hier originär
- V2-Story: keine direkte Entsprechung; PROJ-35-γ war V3-eigener Slice

## CIA-Review

Continuous Improvement Agent (2026-05-05) hat:
- Alle 3 ursprünglich identifizierten Gaps bestätigt + Gap 1b (Resources mit `linked_user_id`-only) entdeckt
- Slice-Struktur α/β/γ empfohlen mit klaren Priorisierungen (must/should/could)
- Anti-Patterns explizit benannt: Trigger auf `is_critical` ist V2-ADR-Verstoß; Materialized-View in α ist Overkill; Promote-Edge-Case gehört nicht in diesen Slice
- Performance-Lücke aufgezeigt: aktuelle Query ist nicht projekt-gefiltert (AC-α-6)
- Audit-Whitelist-Pflicht für β bei 12+ Tracking-Listen markiert (AC-β-4/5)

Vollständiger CIA-Bericht in der Session-Konversation 2026-05-05 dokumentiert. Spec setzt CIA-Empfehlungen 1:1 um.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect) — 43-α only

> Architektur für PROJ-43-α (Detection-Korrektheit). β und γ erhalten ein eigenes Tech-Design beim jeweiligen Slice-Start.

### Was geändert wird

**Genau eine Datei wird angefasst:** der Stakeholder-Health-Endpoint `src/app/api/projects/[id]/stakeholder-health/route.ts`. Konkret die Detection-Logik in den Zeilen 89–118 (Block „Critical-Path-Detection").

Plus eine neue Test-Datei (das Verzeichnis hat aktuell nur `route.ts`, keine `route.test.ts`).

**Nichts anderes ändert sich:** kein Datenmodell, keine Migration, keine UI, keine Audit-Whitelists, keine RPC. Frontend bleibt unverändert.

### Wie die Detection heute arbeitet

Aktuell prüft der Endpoint genau **einen** Pfad, um zu ermitteln, welche Stakeholder „auf kritischem Pfad" sind:

```
Stakeholder
  ⟵ Resource (nur wenn source_stakeholder_id gesetzt)
     ⟵ work_item_resources Allokation
        ⟶ Work-Item (nur wenn phase_id gesetzt)
           ⟶ Phase (nur wenn is_critical = true)
```

Wenn auch nur eine dieser Verbindungen fehlt, fällt der Stakeholder durchs Raster — selbst wenn er offensichtlich am kritischen Arbeitspaket beteiligt ist.

### Wie die Detection nach 43-α arbeitet

Drei Pfade, **alle drei** werden ausgewertet, Ergebnis ist die Vereinigungsmenge der Stakeholder-IDs, die mindestens einen Pfad erfüllen:

```
Pfad A — Resource mit Stakeholder-Verknüpfung (Status quo)
  Stakeholder → Resource(via source_stakeholder_id)
            → work_item_resources → Work-Item (mit phase_id) → kritische Phase

Pfad B — Resource ohne Stakeholder-Verknüpfung, aber mit User-Link (NEU, Gap 1b)
  Stakeholder(linked_user_id) ↔ Resource(linked_user_id)
            → work_item_resources → Work-Item (mit phase_id) → kritische Phase

Pfad C — Direkt-Verantwortlicher auf Work-Item (NEU, Gap 1)
  Stakeholder(linked_user_id) ↔ Work-Item.responsible_user_id (mit phase_id) → kritische Phase
```

Alle drei Pfade arbeiten mit demselben Endkriterium (`phases.is_critical = true` und Work-Item ist nicht gelöscht), nur die Verknüpfungsroute zwischen Stakeholder und Work-Item unterscheidet sich.

### Aggregations-Strategie

Wir laden die drei Pfade **parallel** als drei separate, projekt-gefilterte Anfragen und führen die gefundenen Stakeholder-IDs in einer einzigen Menge zusammen. Vorteile:

- **Idempotent**: Wer über mehrere Pfade gefunden wird, zählt einmal.
- **Lesbarkeit**: Jeder Pfad ist isoliert testbar.
- **Performance**: parallele Ausführung; alle drei nutzen vorhandene Indizes (`work_items_responsible_user_idx`, RLS-Tenant-Filter).
- **Keine neue Datenbank-Funktion** nötig — nur bestehende Tabellen werden gelesen.

Die Aggregation passiert serverseitig im API-Handler — die Antwort-Form (`{ stakeholders[], risk_score_overrides, tenant_id }`) bleibt unverändert.

### Datenmodell

**Keine Änderung.** Genutzte Spalten existieren alle bereits seit:

| Spalte | Tabelle | Eingeführt |
|---|---|---|
| `linked_user_id` | `stakeholders` | PROJ-8 |
| `linked_user_id` | `resources` | PROJ-11 |
| `responsible_user_id` | `work_items` | PROJ-9 |
| `is_critical` | `phases` | PROJ-35-β |
| `is_deleted` | `work_items` | PROJ-9 |

### Sicherheit & Berechtigungen

- **Authentifizierung**: unverändert (`requireProjectAccess` mit `view`-Rolle).
- **RLS**: alle drei Pfade laufen unter denselben RLS-Policies; Cross-Tenant-Lecks sind ausgeschlossen.
- **Kein Class-3-Pfad**: keine personenbezogenen Daten verlassen den Tenant.

### Performance-Profil

- **Status quo**: 1 Datenbankabfrage für Detection.
- **Nach 43-α**: 3 parallele Abfragen für Detection — alle projekt-gefiltert, alle indiziert.
- **Erwartete Zusatzlatenz**: < 50 ms p95 bei 50 Stakeholdern × 100 Work-Items × 20 Phasen (vgl. AC-α-9).

### Test-Strategie

Neue Datei `route.test.ts` mit drei expliziten Pfad-Szenarien plus Edge-Cases:

| Test | Szenario | Erwartung |
|---|---|---|
| T1 | Pfad A isoliert: Stakeholder hat Resource via `source_stakeholder_id`, Resource an Work-Item in kritischer Phase allokiert | Badge ja |
| T2 | Pfad B isoliert: Stakeholder hat `linked_user_id`, Resource hat denselben `linked_user_id` (ohne `source_stakeholder_id`), Resource an Work-Item in kritischer Phase allokiert | Badge ja |
| T3 | Pfad C isoliert: Stakeholder hat `linked_user_id`, Work-Item-`responsible_user_id` matcht, Phase kritisch | Badge ja |
| T4 | Doppelter Pfad: derselbe Stakeholder erfüllt A und C gleichzeitig | Badge **einmal**, kein Doppelzählen |
| T5 | Negativ: Stakeholder ohne `linked_user_id` und ohne Resource | Kein Badge |
| T6 | Negativ: Phase ist `is_critical=false` | Kein Badge |
| T7 | Negativ: Work-Item ist `is_deleted=true` | Kein Badge |
| T8 | Cross-Project-Schutz: Resource desselben Tenants in anderem Projekt allokiert | Kein Badge im aktuellen Projekt |

### Begründung der gewählten Lösung (für PM-Review)

**Warum drei separate Abfragen statt einer großen UNION-Query?**
Lesbarkeit und Wartbarkeit. Jeder Pfad ist eine eigenständige Geschäftsregel und sollte einzeln testbar bleiben. Die Performance-Differenz ist im Tenant-Skalenrahmen vernachlässigbar.

**Warum keine SQL-Datenbankfunktion (RPC) für die Aggregation?**
Eine RPC würde Schema-Drift-Risiko (PROJ-42) erhöhen und ein neues Versionsobjekt einführen, ohne nennenswerten Mehrwert. TypeScript-Aggregation ist hier ausreichend, der CIA bestätigt das ausdrücklich.

**Warum kein Materialized-View?**
Refresh-Komplexität und RLS-Probleme rechtfertigen sich erst bei nachweislichem Performance-Bedarf — nicht spekulativ.

**Warum bleibt `phases.is_critical` als manueller Flag?**
Bewusste Trennung von „PM-Aussage" und „Algorithmus" gemäß V2-ADR-Pattern (PRD-Architektur-Prinzip 2: „AI as proposal layer"). Die Auto-Sync-Frage ist 43-γ und bewusst zurückgestellt, bis Pilot-Feedback vorliegt.

### Komponentenstruktur

```
API-Endpoint  GET /api/projects/[id]/stakeholder-health
└── route.ts
    ├── 1. Auth + Projekt-Zugriff (unverändert)
    ├── 2. Aktive Stakeholder laden (unverändert)
    ├── 3. Critical-Path-Detection — NEU AUFGEBAUT:
    │     ├── Pfad A: Resource via source_stakeholder_id  (parallel)
    │     ├── Pfad B: Resource via linked_user_id          (parallel)
    │     └── Pfad C: Work-Item.responsible_user_id        (parallel)
    │     → Vereinigungsmenge der Stakeholder-IDs
    ├── 4. Tenant-Overrides laden (unverändert)
    └── 5. Antwort komponieren (unverändert)
```

### Abhängigkeiten

**Keine neuen Pakete.** Nur bestehende Supabase-Client-Funktionen.

### Migrations-/Deploy-Risiko

- **Schema-Drift-Risiko (PROJ-42)**: keines, kein Schema-Change.
- **RLS-Risiko**: keines, alle Pfade nutzen die bestehenden Policies.
- **Audit-Whitelist-Risiko**: keines, keine schreibenden Operationen.
- **Frontend-Regression**: keine, Antwort-Shape ist identisch (`on_critical_path: boolean`).
- **Rollback**: trivial — single-file-revert genügt.

### Übergabe an Implementierung

Backend-only Slice → direkter Sprung zu `/backend`, kein `/frontend` nötig. QA-Aufwand fokussiert auf die acht Test-Szenarien und einen End-to-End-Smoke gegen ein Pilot-Projekt.

## Implementation Notes — 43-α (2026-05-05)

**Geändert:** `src/app/api/projects/[id]/stakeholder-health/route.ts` — Critical-Path-Detection-Block (alte Zeilen 89-118) durch drei parallele Pfade ersetzt:

- **Pfad A + B kombiniert** in einer `work_item_resources`-Query (projekt-gefiltert via `.eq("project_id", projectId)`), die Resource-Source/User-Links und Phase-Status mitlädt. Iteration in TS prüft `is_deleted=false` und `phases.is_critical=true`.
- **Pfad C** als zweite parallele Query auf `work_items` (projekt-gefiltert, `responsible_user_id IS NOT NULL`). Iteration in TS prüft dieselben Bedingungen.
- **Lookup-Map** `linked_user_id → stakeholder_id[]` aus den geladenen Stakeholders gebaut, für Pfad B/C-Auflösung.
- **Stakeholder-SELECT** erweitert um `linked_user_id` (server-side für Lookup; bewusst NICHT in der Antwort exponiert — Class-3 PII).

**Neu erstellt:** `src/app/api/projects/[id]/stakeholder-health/route.test.ts` mit 10 Test-Cases (8 Acceptance-Szenarien T1-T8 + 401-Auth + Antwort-Shape-Schutz für `linked_user_id`).

**Schema-Drift-Risiko (PROJ-42):** geprüft. Alle neu adressierten Spalten sind seit langem im Schema:
- `stakeholders.linked_user_id` (PROJ-8)
- `work_items.responsible_user_id`, `is_deleted`, `phase_id`, `project_id` (PROJ-9)
- `resources.source_stakeholder_id`, `linked_user_id` (PROJ-11)
- `work_item_resources.project_id` (PROJ-11)
- `phases.is_critical` (PROJ-35-β)

**Verifikation:**
- `npx vitest run src/app/api/projects/[id]/stakeholder-health/route.test.ts` → 10/10 grün, Duration 860ms
- `npx eslint <route.ts> <route.test.ts>` → 0 Findings
- `npx tsc --noEmit` → meine Datei type-check sauber (eine vorhandene Tuple-Type-Warning in `ai-priority/route.test.ts` ist unverändert und nicht durch diesen Slice verursacht)

**AC-Abdeckung (43-α):**
| AC | Test | Status |
|---|---|---|
| AC-α-1 (responsible_user_id-Pfad) | T3 | ✓ |
| AC-α-2 (linked_user_id-only-Resource) | T2 | ✓ |
| AC-α-3 (Idempotenz Multipath) | T4 | ✓ |
| AC-α-4 (kein Falsch-Positive) | T5 | ✓ |
| AC-α-5 (is_active-Filter) | unverändert (Status quo) | ✓ |
| AC-α-6 (Projekt-Filter) | T8 | ✓ |
| AC-α-7 (kein Schema-Change) | git diff | ✓ |
| AC-α-8 (3 isolierte Test-Cases) | T1+T2+T3 | ✓ |
| AC-α-9 (Performance < 50ms) | manuell zu messen in QA | offen |

**Nicht angefasst:** β (Sprint-Pfad + Method-Gating), γ (Computed-Critical-Path-Marker), Promote-to-Resource-Edge-Case. Bleibt jeweils eigener Slice.

## QA Test Results — 43-α (2026-05-06)

**Tester:** /qa skill
**Scope:** PROJ-43-α (three-path Critical-Path-Detection). β/γ aus dem Scope ausgeklammert (eigene Slices).

### Acceptance Criteria

| AC | Quelle | Test/Beleg | Ergebnis |
|---|---|---|---|
| AC-α-1 (`responsible_user_id`-Pfad) | route.ts:180-185 (Path C) | T3 | ✓ pass |
| AC-α-2 (`linked_user_id`-only Resource) | route.ts:173-176 (Path B) | T2 | ✓ pass |
| AC-α-3 (Idempotenz Multipath) | `Set<string>` (route.ts:160) | T4 | ✓ pass |
| AC-α-4 (kein Falsch-Positive) | Map nur über `linked_user_id`-Keys | T5 | ✓ pass |
| AC-α-5 (`is_active=true`-Filter) | route.ts:85 (Status quo aus PROJ-35-γ) | code review | ✓ pass |
| AC-α-6 (Projekt-Filter) | route.ts:121 + 127 | T8 | ✓ pass |
| AC-α-7 (kein Schema-Change) | git diff: nur route.ts + route.test.ts | manual | ✓ pass |
| AC-α-8 (3 isolierte Tests) | T1+T2+T3 isoliert | vitest | ✓ pass |
| AC-α-9 (Performance < +50ms p95) | static: 2 parallele indizierte Queries | static | ✓ static pass; live-bench post-deploy |

### Edge Cases

| EC | Verifiziert via | Ergebnis |
|---|---|---|
| EC-α-1 (User nicht mehr Tenant-Member) | code review: keine User-Membership-Prüfung im Pfad | ✓ verhält sich wie Spec verlangt |
| EC-α-2 (User auf 2 Items, 1 kritisch) | Set-Idempotenz | ✓ |
| EC-α-3 (Mehrere Stakeholder share `linked_user_id`) | `Map<string, string[]>` (route.ts:134) | ✓ beide flagged |
| EC-α-4 (Resource hat beide Links) | Path A + B addieren separat | ✓ |
| EC-α-5 (`is_deleted=true`) | route.ts:167+181 Filter | T7 ✓ |
| EC-α-6 (Phase gelöscht → `phase_id=null`) | `wi.phases?.is_critical !== true` (route.ts:168) | ✓ wird übersprungen |

### Automated Tests

- `npx vitest run src/app/api/projects/[id]/stakeholder-health/route.test.ts` → **10/10 grün** (Duration 745ms)
- `npx vitest run` (volle Suite) → **1078/1078 grün** über 124 Test-Files (Duration 13.97s)
- Keine Regression in Stakeholder/Resources/Work-Item-Bereich.

### Security Audit (Red Team)

| Check | Ergebnis |
|---|---|
| Class-3-PII-Boundary für `linked_user_id` | ✓ wird geladen (route.ts:81+118), aber nicht in `StakeholderHealthRow`-Interface (Zeilen 47-63) und nicht im Mapping (198-215) durchgereicht |
| Antwort-Shape-Test verhindert Leak-Regression | ✓ route.test.ts:349-361 assertet `Object.keys(...).not.toContain("linked_user_id")` |
| Auth (`requireProjectAccess view`) | ✓ unverändert |
| RLS auf alle 4 Queries (stakeholders, work_item_resources, work_items, tenant_settings) | ✓ Supabase-Client respektiert Policies |
| Input-Validation (`projectId`) | ✓ via `requireProjectAccess` |
| SQL-Injection | ✓ keine — nur Supabase-Builder, keine string-Concat |
| Cross-Tenant-Leak | ✓ alle Queries über RLS gescopt; tenant_id aus access-Result |

**Keine Security-Findings.**

### Regression Test (PROJ-35-γ Stakeholder-Health-Dashboard)

| Konsument | Erwartetes Shape | Status |
|---|---|---|
| `health-api.ts:18-33` (`StakeholderHealthRow`) | id, name, is_active, attitude, conflict_potential, decision_authority, influence, impact, communication_need, preferred_channel, current_escalation_patterns, agreeableness_fremd, emotional_stability_fremd, on_critical_path | ✓ exakt |
| `stakeholder-health-page-client.tsx:160+352` (`on_critical_path` lesend) | unverändert | ✓ |
| Top-level Response (`{ stakeholders, risk_score_overrides, tenant_id }`) | unverändert | ✓ |
| Referenz auf `linked_user_id` in UI | nicht vorhanden | ✓ kein UI-Leak |

**Keine Regression im PROJ-35-γ-Dashboard.**

### Performance (AC-α-9)

Statische Analyse:
- Pfade A+B als eine indizierte Query (`work_item_resources_project_id_created_at_idx`)
- Pfad C als zweite indizierte Query (`work_items(project_id, ...)` + `work_items_responsible_user_idx`)
- Beide via `Promise.all` parallel — Netto-Gewinn vs. alter Single-Query bei nur einem zusätzlichen Roundtrip
- TS-Aggregation O(W·R + W) bei realistischen Größen (W≤100, R≤200) ⇒ < 1 ms

Live-p95-Bench (50 Stakeholders × 100 Work-Items × 20 Phases) ist in der QA-Umgebung mangels seeded Pilot-Daten nicht durchführbar. Empfehlung: Post-Deploy-Smoke gegen Pilot-Tenant via Vercel/Sentry-Latency-Monitoring.

### Bugs Found

**Keine.**

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 0 |

### Production-Ready Decision

**READY** — keine Critical/High-Bugs, alle 9 Acceptance Criteria erfüllt (AC-α-9 als static pass mit Post-Deploy-Smoke-Empfehlung), Class-3-PII-Boundary geprüft, kein Regressionsrisiko für PROJ-35-γ.

### Out-of-Scope-Erinnerungen (für Folge-Slices)

- 43-β (Sprint-Pfad + Method-Gating) — eigener Slice
- 43-γ (Computed-Critical-Path-Marker) — eigener Slice, deferred
- Promote-to-Resource Identity-Mapping-Bug — separater Kandidat (PROJ-51 oder PROJ-29-Folge)
- Performance-Live-Bench mit Pilot-Daten — Post-Deploy

## Deployment — 43-α (2026-05-06)

**Production URL:** https://projektplattform-v3.vercel.app
**Deploy-Trigger:** Push to `main` (`e01a1da`), Vercel Auto-Deploy
**Tag:** `v1.43.0-α`

### Pre-Deploy Checks

| Check | Status |
|---|---|
| `npm run build` | ✓ grün — 51 statische Pages generiert in 7.8s |
| `npm run lint` | ✓ 0 errors (1 pre-existing warning in `edit-work-item-dialog.tsx:410`, nicht PROJ-43-bezogen) |
| `npx vitest run` (full suite) | ✓ 1078/1078 grün |
| QA Approved | ✓ 9/9 AC erfüllt, 0 Bugs |
| Schema-Change / Migration | keine — Backend-only Slice |
| Env-Vars-Update | keine |

### Scope

**Geändert:**
- `src/app/api/projects/[id]/stakeholder-health/route.ts` — Detection-Logik Pfade A/B/C
- `src/app/api/projects/[id]/stakeholder-health/route.test.ts` — neu, 10 Test-Cases

Keine UI-Änderung, kein Schema-Change, keine Audit-Whitelist-Anpassung.

### Post-Deploy-Smoke (Empfehlung)

1. **Funktional:** Stakeholder-Health-Dashboard auf Pilot-Tenant öffnen, prüfen dass „Test"-User (über `responsible_user_id` zugewiesen) jetzt zusammen mit „icke" das Critical-Path-Badge bekommt.
2. **Performance:** Vercel-Function-Logs für `/api/projects/[id]/stakeholder-health` auf p95-Latenz prüfen — Erwartung < ursprünglich + 50ms (AC-α-9 Live-Verifikation).
3. **Sentry:** Auf neue Fehler in der Route filtern (Tags: `route=stakeholder-health`, `tenant_id`).

### Rollback

Single-File-Backend-Slice → Rollback ist trivial:
```
git revert 39b9336
git push origin main
```
oder via Vercel-Dashboard: vorigen Deploy promoten.

### Out-of-Scope (für eigene Slices)

- 43-β — Sprint-Pfad + Method-Gating
- 43-γ — Computed-Critical-Path-Marker (deferred)
- Promote-to-Resource Identity-Mapping-Bug (PROJ-44-Kandidat oder PROJ-29-Folge)

## Tech Design (Solution Architect) — 43-β

> Tech-Design für PROJ-43-β (Sprint-Pfad + Method-Gating). Folge-Slice von 43-α. γ erhält ein eigenes Tech-Design beim Slice-Start.

### Was geändert wird

Ein **kleines Vier-Komponenten-Paket**:

```
β-Slice
├── Datenbank          neue Spalte sprints.is_critical (analog phases.is_critical)
├── API-Route          Detection-Query erweitert um Method-Gating + Sprint-Pfad
├── UI                 Edit-Sprint-Dialog erhält "kritisch"-Checkbox
└── Tests              vitest-Cases für Scrum-Methode + Method-Gating-Verhalten
```

Alles andere bleibt unverändert.

### Wesentliche Kurskorrektur gegenüber Original-Spec

**AC-β-4 + AC-β-5 (Audit-Whitelist-Update + PROJ-42-CI-Run für Audit) sind nach Recon nicht erforderlich.**

Hintergrund: Der β-Slice wird gegen `phases.is_critical` (PROJ-35-β) als Vorbild gebaut. PROJ-35-β hat `phases.is_critical` **bewusst nicht** in das Field-Level-Audit-Whitelist (`_tracked_audit_columns`) aufgenommen — die Entscheidung gilt für genau diese Klasse von Marker-Boolean-Spalten („PM-Aussage, opt-in"). Wir folgen dem Präzedenzfall: `sprints.is_critical` wird ebenfalls nicht audit-tracked.

Wirkung: kein Update an den 14 vorhandenen `_tracked_audit_columns`-Re-Definitionen über alle PROJ-Migrations hinweg, kein zusätzlicher CI-Risikopunkt.

PROJ-42 Schema-Drift-CI bleibt automatisch grün, weil neue Spalten nach Migration nur **dazukommen** (kein SELECT auf entfernte Spalten).

### Wie die Detection nach 43-β arbeitet

Die drei α-Pfade (Resource-Stakeholder / Resource-LinkedUser / Direkt-Verantwortlicher) bleiben erhalten. Neu kommt die **Wegabhängigkeit der Verbindung „Work-Item → kritisches Konstrukt"**:

```
α-Pfade A/B/C → Work-Item → ?
                              ├─ wenn Methode hat Phasen → phase ist_critical?
                              └─ wenn Methode hat Sprints → sprint ist_critical?
                              ⟶ Vereinigungsmenge der Treffer
```

Das Method-Gating entscheidet **pro Projekt**, welche Pfade aktiv sind:

| Methode des Projekts | Phase-Pfad | Sprint-Pfad |
|---|---|---|
| Wasserfall, PMI, PRINCE2, VXT 2.0 | aktiv | inaktiv |
| Scrum, SAFe | inaktiv | aktiv |
| (zukünftig) Hybrid mit beiden Konstrukten | aktiv | aktiv |
| keine Methode gewählt (NULL) | aktiv | aktiv |

Quelle ist der bestehende PROJ-26-TS-Helper `SCHEDULE_CONSTRUCT_METHOD_VISIBILITY` — kein neuer Catalog-Lookup, kein RPC, keine doppelte Wahrheit.

### Aggregations-Strategie

Wie in α: Pfade werden parallel ausgeführt, Ergebnisse als `Set<stakeholder_id>` vereinigt. Inaktive Pfade werden gar nicht erst abgesetzt — Performance-Vorteil für reine Wasserfall-Projekte (keine Sprint-Query nötig).

### Datenmodell

**Eine Spalte:**

| Spalte | Tabelle | Typ | Default | Audit-getrackt? |
|---|---|---|---|---|
| `is_critical` | `sprints` | `boolean not null` | `false` | nein (Präzedenzfall PROJ-35-β) |

**Migration:** `add column if not exists is_critical boolean not null default false` (idempotent, Roll-forward-only). Kein Backfill nötig — alle existierenden Sprints starten korrekt mit `false`.

### UI-Erweiterung

**`edit-sprint-dialog.tsx`** erhält eine Checkbox „Auf kritischem Pfad" — exakt das Pattern aus `edit-phase-dialog.tsx:247` mit identischer Beschriftung und Tooltip-Begründung.

**`new-sprint-dialog.tsx`** könnte die Checkbox initial auch zeigen — Empfehlung: **nicht** in β, weil neu angelegte Sprints standardmäßig `false` sind und der Dialog-Footprint klein bleiben soll. Markierung erfolgt im späteren Edit.

**Sprint-Card-Badge** (analog Phase-Card, Critical-Path-Anzeige in Listen): **out of scope für β**, kann als Folge-Slice oder Hygiene-Erweiterung. Reine Lese-Komponente.

### Sicherheit & Berechtigungen

- **Authentifizierung:** unverändert. Edit-Sprint-Dialog läuft schon mit `requireProjectAccess`-`edit`-Permission.
- **RLS:** unverändert. Lesen über bestehende Sprint-Policies; Schreiben (Toggle der Checkbox) geht über bestehende Sprint-Update-Route.
- **Class-3-PII:** unberührt. `is_critical` ist ein boolean-Marker ohne personenbezogenen Inhalt.

### Performance-Profil

- **Status quo nach α:** 2 parallele Queries (Pfade A/B + Pfad C, alle gegen Phasen)
- **Nach 43-β bei Wasserfall-Methoden:** unverändert (Sprint-Pfad nicht aktiv → keine Zusatz-Query)
- **Nach 43-β bei Scrum/SAFe:** 2 parallele Queries (Pfade A/B + Pfad C, jetzt gegen Sprints statt Phasen — gleiche Anzahl Queries, andere Endknoten)
- **Nach 43-β bei Hybrid:** 4 parallele Queries (je 2 für Phase-Pfad und Sprint-Pfad). Aktuell kein Methoden-Hybrid registriert, also Latenz-Risiko theoretisch.
- **Index:** `sprints` hat `sprints_project_state_idx` und `sprints_project_start_date_idx` (PROJ-9). Sprint-Joins gehen über `work_items.sprint_id`, dafür existiert `work_items_project_sprint_idx`. Keine zusätzliche Migration für Indizes nötig.

### Test-Strategie

Erweiterung der bestehenden `route.test.ts` um vier Cases plus eine UI-Test-Datei für den Edit-Dialog:

| Test | Szenario | Erwartung |
|---|---|---|
| T9 (Scrum) | Projekt-Methode `scrum`, Sprint mit `is_critical=true`, responsible_user_id auf Sprint-Item | Stakeholder markiert, Phase-Pfad **nicht** ausgewertet |
| T10 (Wasserfall) | Projekt-Methode `waterfall`, Sprint-Datensätze vorhanden (Migrations-Erbe), Sprint-`is_critical=true` | Stakeholder **nicht** markiert (Sprint-Pfad inaktiv) |
| T11 (Hybrid theoretisch) | Methode mit beiden Konstrukten (Mock erweitert die Visibility-Map) | Beide Pfade laufen, Set-Idempotenz |
| T12 (NULL-Methode) | Methode = NULL (Setup-Phase) | Beide Pfade aktiv, Stakeholder markiert wenn entweder Phase- oder Sprint-Pfad trifft |
| UI: edit-sprint-dialog.test.tsx | Checkbox togglet, Form-Submit überträgt `is_critical: true` | Submit-Payload enthält den Wert |

### Begründung der gewählten Lösung (für PM-Review)

**Warum keine Audit-Tracking-Pflicht?**
Marker-Booleans wie `is_critical` sind PM-Hand-Aussage, nicht Geschäftsdaten-Mutation. Field-Level-Audit ist dafür gedacht, fachliche Inhaltsänderungen revidierbar zu halten („Welcher Stakeholder-Name wurde wann geändert?"). Eine Markierung ist orthogonal — sie darf jederzeit geändert werden, der Dashboard-Effekt ist sofort sichtbar. Genau diese Argumentation hat PROJ-35-β für `phases.is_critical` getroffen, β folgt der Linie.

**Warum nicht das Method-Gating in einer SQL-Funktion?**
Die TS-Visibility-Map ist die kanonische Quelle (PROJ-26 nennt sie explizit „TS-Registry, mit DB-Trigger-Spiegel"). API-seitiges Gating bleibt in der gleichen Datei wie die Detection-Logik selbst — eine Stelle, ein Test.

**Warum kein „Standardmäßig kritisch" für Sprints in Scrum-Projekten?**
Hieße eine implizite Aussage „in Scrum ist jeder Sprint kritisch", was den Zweck des Markers — gezielte PM-Markierung — aushöhlt. `false`-Default ist semantisch korrekt.

**Warum kein Sprint-Card-Badge in β?**
Reines Lese-UI-Polish ohne Datenfluss-Implikation. Trennt sich sauber als kleiner Folge-Slice ab und blockiert die Detection-Korrektur nicht.

### Komponentenstruktur

```
DB Migration            sprints add column is_critical boolean default false
└── (idempotent, kein Backfill)

API-Endpoint            GET /api/projects/[id]/stakeholder-health
└── route.ts
    ├── 1. Auth + Projekt-Zugriff (unverändert)
    ├── 2. Aktive Stakeholder + linked_user_id-Map (unverändert)
    ├── 3. Method-Gating          ← NEU
    │     └── visible_constructs = SCHEDULE_CONSTRUCT_METHOD_VISIBILITY[project.method]
    ├── 4. Critical-Path-Detection — bedingt erweitert:
    │     ├── if 'phases' visible:
    │     │   ├── Pfad A: WIR via source_stakeholder_id   (parallel)
    │     │   ├── Pfad B: WIR via linked_user_id           (parallel)
    │     │   └── Pfad C: work_items.responsible_user_id   (parallel)
    │     │   ↘ alle drei gegen phases.is_critical
    │     └── if 'sprints' visible:
    │         ├── Pfad A': WIR via source_stakeholder_id  (parallel)
    │         ├── Pfad B': WIR via linked_user_id          (parallel)
    │         └── Pfad C': work_items.responsible_user_id  (parallel)
    │         ↘ alle drei gegen sprints.is_critical via work_items.sprint_id
    │     → Vereinigungsmenge aller Treffer
    ├── 5. Tenant-Overrides laden (unverändert)
    └── 6. Antwort komponieren (unverändert)

UI                      src/components/sprints/edit-sprint-dialog.tsx
└── Checkbox "Auf kritischem Pfad" — analog edit-phase-dialog.tsx:247
```

### Abhängigkeiten

**Keine neuen Pakete.** Genutzt werden:
- bestehende `SCHEDULE_CONSTRUCT_METHOD_VISIBILITY`-Map (PROJ-26)
- bestehende Form-Patterns (react-hook-form + Zod) im Edit-Sprint-Dialog
- bestehende Sprint-Update-Route (Toggle des Boolean) — keine neue API nötig

### Migrations-/Deploy-Risiko

- **Schema-Drift-Risiko (PROJ-42-α SELECT-Check):** keines, neue Spalte ist additiv.
- **RLS-Risiko:** keines, kein Policy-Change.
- **Audit-Whitelist-Risiko:** keines (Präzedenzfall, siehe Kurskorrektur).
- **Frontend-Regression:** keine, Antwort-Shape bleibt identisch (`on_critical_path: boolean`).
- **Rollback:** zwei Schritte: (a) Migration revert (`drop column is_critical`) — sicher, weil keine FK; (b) Single-File-Code-Revert. Kein Daten-Verlust.

### Open Questions / Architektur-Entscheidungen für /backend

| Frage | Default-Empfehlung | Veränderbar in /backend? |
|---|---|---|
| Wo wird `project.project_method` für Method-Gating gelesen? | aus `requireProjectAccess`-Result, falls vorhanden — sonst zusätzlicher SELECT auf `projects.project_method` | ja, abhängig von Hilfs-Funktion |
| Wird `is_critical` initial im New-Sprint-Dialog angezeigt? | **nein** (Edit-only in β) | ja |
| Sprint-Card zeigt "kritisch"-Badge? | **nein** in β (separater Lese-UI-Slice) | ja |
| `compute_critical_path_phases`-RPC für Sprints replizieren? | **nein** in β (γ-Thema) | nein, Slice-Grenze |

### Übergabe an Implementierung

Hauptsächlich Backend-Slice mit kleinem UI-Anteil → bevorzugte Reihenfolge: `/backend` (Migration + Route + Tests) → `/frontend` (Edit-Sprint-Checkbox + Test) → `/qa` → `/deploy`. UI-Slice ist klein genug, um an Backend zu hängen, falls gewünscht.

### Geänderter AC-Satz vs. Spec-Original

| Original-AC | Status nach β-Tech-Design | Begründung |
|---|---|---|
| AC-β-1 (Migration `is_critical`) | unverändert | ✓ |
| AC-β-2 (Edit-Sprint-Checkbox) | unverändert | ✓ |
| AC-β-3 (Method-Gating per Catalog) | unverändert, gelöst per TS-Helper | ✓ |
| AC-β-4 (Audit-Whitelists ergänzen) | **gestrichen** (Präzedenzfall PROJ-35-β) | siehe Kurskorrektur |
| AC-β-5 (PROJ-42 CI grün im Migrations-PR) | **redundant** (Schema-Drift trifft additive Spalten nicht) | siehe Kurskorrektur |
| AC-β-6 (Test für Scrum-Methode) | unverändert | ✓ |
| AC-β-7 (Migration idempotent) | unverändert | ✓ |

## Implementation Notes — 43-β (2026-05-06)

**Migration:** `supabase/migrations/20260506100000_proj43b_sprints_is_critical.sql`
- Idempotent `add column if not exists is_critical boolean not null default false` analog zu PROJ-35-β.
- Live appliziert per `mcp__supabase__apply_migration` auf Projekt `iqerihohwabyjzkpcujq`; Smoke-Check via `information_schema.columns` bestätigt: `boolean NOT NULL DEFAULT false`.
- Audit-Whitelist **bewusst nicht angefasst** (PROJ-35-β-Präzedenz, AC-β-4 als überspecifiziert markiert).

**Geändert:** `src/app/api/projects/[id]/stakeholder-health/route.ts`
- Extra-SELECT `projects.project_method` nach Stakeholder-Load (gezielt isoliert, kein Helper-Refactor).
- `phasesActive` / `sprintsActive` via `isScheduleConstructAllowedInMethod` aus `@/lib/work-items/schedule-method-visibility`.
- Vier parallele Queries via `Promise.all` (statt zwei) — inaktive Pfade kurzschließen via `Promise.resolve({data: [], error: null})`, kein Datenbank-Roundtrip.
- Phase-Pfad und Sprint-Pfad teilen sich die Set-Aggregation in `criticalStakeholderIds` → Idempotenz garantiert für die theoretische Hybrid-Methode.

**Geändert:** `src/app/api/projects/[id]/stakeholder-health/route.test.ts`
- T9 (Scrum-only) → Sprint-Pfad aktiv, Phase-Pfad inaktiv, Sprint-`is_critical=true` flagt Stakeholder.
- T10 (Wasserfall-only) → Sprint-Daten werden ignoriert (Sprint-Pfad inaktiv); ohne Phase-Daten kein Match.
- T11 (NULL-Methode, Setup) → Beide Pfade aktiv.
- T12 (Kanban) → Beide Pfade inaktiv, auch maximal kritische Daten flaggen niemanden.
- Bestehende α-Tests (T1-T8 + Auth + Shape) unverändert grün.

**Schema-Drift-Risiko (PROJ-42):** geprüft. Neue Spalte `sprints.is_critical` ist additiv → SELECT-Drift-Check trivial grün; keine entfernten Spalten in `src/`.

**Verifikation:**
- `npx vitest run src/app/api/projects/[id]/stakeholder-health/route.test.ts` → 14/14 grün, Duration 685ms
- `npx vitest run` (volle Suite) → 1082/1082 grün über 124 Files, +4 Neue, 0 Regressionen
- `npx tsc --noEmit` → keine neuen Type-Fehler in route.ts / route.test.ts

**AC-Abdeckung (43-β):**
| AC | Test | Status |
|---|---|---|
| AC-β-1 (Migration `is_critical`) | live appliziert + smoke-check | ✓ |
| AC-β-2 (Edit-Sprint-Checkbox) | offen — folgt im /frontend-Slice | offen |
| AC-β-3 (Method-Gating per Catalog) | T9 (Scrum), T10 (Waterfall), T11 (NULL), T12 (Kanban) | ✓ |
| AC-β-4 (Audit-Whitelist) | **gestrichen** per Tech-Design-Kurskorrektur | n/a |
| AC-β-5 (PROJ-42 CI grün) | redundant — additive Spalte | n/a |
| AC-β-6 (Test für Scrum) | T9 | ✓ |
| AC-β-7 (Migration idempotent) | `add column if not exists` | ✓ |

**Nicht angefasst:**
- `sprintPatchSchema` / `sprintCreateSchema` in `_schema.ts` — UI-Wiring kommt mit /frontend-Slice (Edit-Sprint-Checkbox + react-hook-form-Anbindung).
- New-Sprint-Dialog (Default `is_critical=false` reicht).
- Sprint-Card-Badge analog Phase-Card — out of scope, kann separater Lese-UI-Slice werden.

**Open für /frontend:**
- `edit-sprint-dialog.tsx` Checkbox „Auf kritischem Pfad" analog `edit-phase-dialog.tsx:247`
- Optional: kleiner Vitest-Case dafür

## Frontend Implementation Notes — 43-β (2026-05-06)

**Geändert:**
- `src/types/sprint.ts` — `Sprint`-Interface um `is_critical: boolean` erweitert (Doku-Kommentar zu PROJ-43-β-Semantik).
- `src/hooks/use-sprints.ts` — SELECT um `is_critical` ergänzt, sonst hätte das Edit-Dialog-Feld nie den persistierten Wert geladen.
- `src/app/api/projects/[id]/sprints/_schema.ts` — `is_critical: z.boolean().optional()` in beiden Schemas (`sprintCreateSchema` + `sprintPatchSchema`). Schema-Drift-CI-Tests zwingen das Feld in die kitchen-sink-Fixtures (POST + PATCH); beide aktualisiert mit `is_critical: false`/`true`.
- `src/components/sprints/edit-sprint-dialog.tsx` — Switch-FormField analog `edit-phase-dialog.tsx:247`. Beschriftung „Auf kritischem Pfad" + Help-Text inkl. Hinweis auf Method-Gating („Nur wirksam in Methoden mit Sprint-Konstrukt — Scrum, SAFe").

**Bewusst NICHT angefasst:**
- `new-sprint-dialog.tsx` — Default `false` ist semantisch korrekt; PM markiert kritisch nachträglich.
- `sprint-card.tsx` — Critical-Path-Badge in Sprint-Karten ist optionale Lese-UI-Polish, separater kleiner Slice.

**Verifikation:**
- `npx vitest run` → 1082/1082 grün, inkl. der zwei zuvor wegen Drift-Tests rot gelaufenen Sprint-Schema-Cases (POST + PATCH).
- `npm run build` → ✓ 51 Pages, 7.8s, keine neuen Fehler.
- `npm run lint` → 0 errors, nur die pre-existing `incompatible-library` Warning in `edit-work-item-dialog.tsx:412`.

**AC-β-2 abgeschlossen:** Edit-Sprint-Checkbox live im UI, Toggle persistiert via PATCH → `sprints.is_critical` → Stakeholder-Health-Detection. β-Slice damit voll backend+frontend implementiert, awaiting /qa.

## QA Test Results — 43-β (2026-05-06)

**Tester:** /qa skill
**Scope:** PROJ-43-β (Sprint-Pfad + Method-Gating + Edit-Sprint-Checkbox). γ aus dem Scope ausgeklammert.

### Acceptance Criteria

| AC | Quelle | Test/Beleg | Ergebnis |
|---|---|---|---|
| AC-β-1 (Migration `sprints.is_critical`) | Migration `20260506100000_proj43b_sprints_is_critical.sql` + Live-Smoke-Check `information_schema.columns` | DB-Query: `boolean NOT NULL DEFAULT false`, 0 NULL-Leaks bei 8 existierenden Sprints | ✓ pass |
| AC-β-2 (Edit-Sprint-Checkbox) | `edit-sprint-dialog.tsx` Switch-Block analog `edit-phase-dialog.tsx:247` | Schema, defaultValues, form.reset, Payload — alle vier Stellen führen `is_critical` end-to-end | ✓ pass |
| AC-β-3 (Method-Gating per Catalog) | `route.ts:129-136` via `isScheduleConstructAllowedInMethod` | T9 (Scrum), T10 (Waterfall), T11 (NULL), T12 (Kanban) | ✓ pass |
| AC-β-4 (Audit-Whitelist-Update) | **gestrichen** per Tech-Design-Kurskorrektur | n/a (PROJ-35-β-Präzedenz) | n/a |
| AC-β-5 (PROJ-42 CI grün im Migrations-PR) | redundant — additive Spalte trifft α-SELECT-Drift-Check trivial nicht | n/a | n/a |
| AC-β-6 (Test für Scrum-Methode) | T9 Scrum-only test im `route.test.ts` | vitest 14/14 grün im File | ✓ pass |
| AC-β-7 (Migration idempotent) | `add column if not exists` | grep-Bestätigt | ✓ pass |

### Edge Cases

| EC | Verifiziert via | Ergebnis |
|---|---|---|
| EC-β-1 (Hybrid: Phase + Sprint aktiv) | `phasesActive` + `sprintsActive` beide true → beide Loops laufen, Set dedupliziert. Aktuell **kein** Methode in PROJ-26 hybrid; T11 (NULL) deckt Semantik. Code ist hybrid-ready für künftige Methoden. | ✓ ready |
| EC-β-2 (WI in kritischer Phase UND kritischem Sprint) | Pfade A/B/C unabhängig, geteiltes Set `criticalStakeholderIds` (route.ts:222) → Stakeholder einmal | ✓ |
| EC-β-3 (Wasserfall + Sprint-Erbdaten) | T10 explizit; `sprintsActive=false` führt zu `Promise.resolve({data:[]})` (route.ts:203,212) | ✓ |

### Automated Tests

- `npx vitest run` (volle Suite) → **1082/1082 grün** über 124 Test-Files (Duration 12.10s)
- `npx vitest run` für Sprints + Hooks + Schedule-Method-Visibility → **36/36 grün** (Duration 768ms)
- `npm run build` → ✓ 51 Pages, 7.8s
- `npm run lint` → 0 errors, 1 pre-existing Warning unrelated to PROJ-43 (`edit-work-item-dialog.tsx:412`, react-hook-form `watch()`)
- `npx tsc --noEmit` → 4 pre-existing TS-Errors in `ai-priority/route.test.ts` (vorhanden vor PROJ-43-α), keine neuen Fehler durch β

### Security Audit (Red Team)

| Check | Ergebnis |
|---|---|
| RLS auf `sprints` (select/insert/update/delete) | ✓ alle 4 Policies unverändert vorhanden |
| Column-Level-Permissions | ✓ neue Spalte erbt Row-Level-Access; kein GRANT-Override |
| Class-3-PII-Risiko durch `is_critical` | ✓ boolean-Marker, kein PII |
| XSS via Switch-Toggle | ✓ Switch sendet boolean; Zod `z.boolean()` validiert serverseitig |
| SQL-Injection | ✓ Supabase-Builder, keine string-Concat |
| Authz auf Sprint PATCH (incl. `is_critical`-Flag) | ✓ `requireProjectAccess "edit"` in `[sid]/route.ts` unverändert |
| Cross-Tenant-Leak | ✓ neue Spalte über bestehende `sprints_select`-Policy gefiltert |
| Method-Gating-Short-Circuit | ✓ `Promise.resolve({data:[]})` enthält keine DB-Daten — kein RLS-Bypass-Vektor |

**Keine Security-Findings.**

### Regression Test (PROJ-26 Method-Gating + PROJ-35-γ Health-Dashboard + PROJ-9 Sprints)

| Bereich | Belege | Ergebnis |
|---|---|---|
| PROJ-26 Method-Visibility-Trigger | `sprints_method_visibility`-Trigger live in `pg_trigger` (DB-Query) | ✓ unverändert |
| PROJ-9 Sprints CRUD | `src/app/api/projects/[id]/sprints/**` Tests inkl. Drift-Tests grün (POST + PATCH `is_critical` jetzt im kitchen-sink) | ✓ |
| PROJ-35-γ Stakeholder-Health-Dashboard | `health-api.ts`-Konsumenten-Interface unverändert; α-Tests T1-T8 weiter grün; β nimmt nur method-gegated Pfade dazu | ✓ |
| `use-sprints` Hook | SELECT um `is_critical` ergänzt; Hook-Caller bekommen Wert ohne API-Schema-Bruch | ✓ |
| Edit-Phase-Dialog (Vorbild-Pattern) | unverändert — Switch wurde dupliziert, nicht generisiert | ✓ kein Drift |

### Bugs Found

**Keine.**

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 0 |

### Open / nicht im Scope für β

- **Sprint-Card-Critical-Path-Badge** in `sprints-list.tsx` / `sprint-card.tsx` analog Phase-Card → optionale Lese-UI-Polish-Slice. **Empfehlung:** kleiner Folge-Slice (geschätzt < 30 min).
- **New-Sprint-Dialog Checkbox** → bewusst weggelassen, Default `false` ist semantisch korrekt.
- **Browser-basierte E2E-Tests** für Edit-Sprint-Toggle — könnten als Playwright-Spec ergänzt werden, sind aber durch die Vitest-Drift-Tests + Switch-Pattern-Spiegelung von Edit-Phase ausreichend abgedeckt für Pilot-Use.

### Production-Ready Decision

**READY** — keine Critical/High-Bugs, alle relevanten ACs erfüllt (β-4/β-5 per Tech-Design-Kurskorrektur entfallen), Security-Boundary geprüft, kein Regressionsrisiko für PROJ-26/PROJ-35-γ/PROJ-9. Live-DB-Smoke-Check bestätigt Migrations-Korrektheit auf Pilot-Tenant.

## Deployment — 43-β (2026-05-06)

**Production URL:** https://projektplattform-v3.vercel.app
**Deploy-Trigger:** Push to `main` (`91c53de` mit Vorgängern `58864de` + `da806fc`), Vercel Auto-Deploy
**Tag:** `v1.43.0-β`

### Pre-Deploy Checks

| Check | Status |
|---|---|
| `npm run build` | ✓ grün — 51 Pages, 7.4s |
| `npm run lint` | ✓ 0 errors (1 pre-existing warning, nicht PROJ-43) |
| `npx vitest run` | ✓ 1082/1082 |
| QA Approved | ✓ 0 Bugs, alle ACs erfüllt |
| Migration live | ✓ `sprints.is_critical` seit /backend-Phase aktiv (DB-Smoke 3/3 grün) |
| Env-Vars-Update | keine |

### Scope

**Geändert (3 Commits):**
- `da806fc` — Migration `20260506100000_proj43b_sprints_is_critical.sql` + Method-gated Detection in `route.ts` + 4 neue Test-Cases
- `58864de` — Sprint-Type erweitert; `use-sprints` SELECT; `sprintCreateSchema` + `sprintPatchSchema`; Edit-Sprint Switch-FormField; 2 Drift-Test kitchen-sinks aktualisiert
- `91c53de` — QA-Test-Results-Block + Status-Bumps

Keine zusätzliche Migration im Deploy (Migration war bereits in /backend appliziert).

### Post-Deploy-Smoke (Empfehlung)

1. **Funktional:** Im Edit-Sprint-Dialog auf einem Scrum-Pilot-Projekt die „Auf kritischem Pfad"-Checkbox toggeln, speichern → im Stakeholder-Health-Dashboard prüfen, dass Stakeholder, die einem Work-Item in diesem Sprint zugeordnet sind, den Critical-Path-Badge erhalten.
2. **Method-Gating:** Auf einem Wasserfall-Pilot-Projekt prüfen, dass die `is_critical`-Toggle für Sprints (falls vorhanden) keinen Dashboard-Effekt hat — Phase-Pfad bleibt einzige Quelle.
3. **Performance:** Vercel-Function-Logs für `/api/projects/[id]/stakeholder-health` auf p95 prüfen — Erwartung: bei reinem Wasserfall-Projekt unverändert (Sprint-Pfad short-circuit), bei Scrum vergleichbar mit α (zwei parallele Queries statt drei, andere Endknoten).
4. **Sentry:** auf neue Fehler in `route.ts` filtern, insbesondere zur neuen `projects.project_method`-Lookup-Query.

### Rollback

Single-File-Code-Revert + Migration-Rückrollung möglich, aber wegen `not null default false` ungefährlich:

```
git revert 91c53de 58864de da806fc
git push origin main
```

Migration kann optional zurückgerollt werden (`alter table public.sprints drop column if exists is_critical;`) — nicht erforderlich, weil Spalte additiv und mit Default belegt ist. Existierende Daten unbetroffen.

### Out-of-Scope (offen für Folge-Slices)

- 43-γ — Computed-Critical-Path-Marker (deferred per Spec)
- Sprint-Card-Critical-Path-Badge in `sprints-list.tsx` / `sprint-card.tsx`
- Playwright-E2E für Edit-Sprint-Toggle

## Tech Design (Solution Architect) — 43-γ

> Tech-Design für PROJ-43-γ (Computed-Critical-Path-Marker). Architektur-Entscheidung von CIA-Review (2026-05-06) bestätigt; siehe „Begründung" weiter unten.

### Was geändert wird

Die γ-Slice fügt der Detection in `/api/projects/[id]/stakeholder-health/route.ts` **eine zusätzliche Quelle** für „kritische Phase" hinzu: die rechnerisch ermittelte Critical-Path-Liste aus der bestehenden RPC `compute_critical_path_phases` (eingeführt mit PROJ-25 Gantt-Slice).

**Kein Schema-Change. Keine neue Tabelle. Keine neue Spalte. Keine Materialized-View. Keine Trigger.**

```
γ-Slice
├── Datenbank          unverändert (RPC compute_critical_path_phases existiert bereits)
├── API-Route          Detection-Query erhält 5. Promise: RPC-Call → Set<phase_id>
├── UI                 Edit-Phase-Dialog zeigt Read-only-Badge "Vom Algorithmus erkannt"
└── Tests              vitest-Cases für RPC-Match, RPC-Fail-Fallback, Method-Gating
```

### Wesentliche Architektur-Entscheidung

**Vier Optionen wurden bewertet** (CIA-Review 2026-05-06). Die gewählte Option ist **D — API-Aggregation**. Die ursprüngliche Spec-Frage „VIEW vs. Materialized-View vs. gecachte Spalte" wird damit konkret beantwortet: keine davon.

| Option | Ergebnis | Hauptgrund gegen |
|---|---|---|
| **A — Stateless VIEW** | „funktioniert, aber überflüssig" | RPC liefert bereits genau die richtige Form (`uuid[]`); zusätzliche VIEW wäre nur ein Wrapper |
| **B — Materialized View** | **abgelehnt** | MVs erben **keine** RLS — Multi-Tenant-Invariant verletzt |
| **C — Gecachte Spalte mit Refresh-Job** | **abgelehnt** | Verletzt V2-ADR „AI as proposal layer" — Algorithmus-Output würde wie PM-Aussage persistiert; gefährliches Präzedens |
| **D — API-Aggregation in `route.ts`** | **gewählt** | Null neue DB-Persistenz; RPC-Call passt 1:1 zur bestehenden Set-Aggregation; Rollback ist eine Code-Hunk-Revert |

**Eskalations-Pfad:** Wenn Telemetrie zeigt, dass die RPC bei einem Tenant > 200 ms p95 braucht (z.B. > 200 Phasen mit dichten FS-Edges), dann In-Place-Refactor zu Option A (VIEW) — Aggregations-Logik im Code bleibt gleich, nur die Quelle wechselt.

### Wie die Detection nach 43-γ arbeitet

Die α-Pfade (drei Resource/Responsible-User-Pfade) und β-Pfade (Phase + Sprint Method-Gating) bleiben unverändert. Neu kommt **eine zweite Critical-Quelle** pro Phase:

```
Phase ist kritisch wenn:
   PM hat is_critical=true gesetzt (manuell, V2-Vorrang)
   ODER
   compute_critical_path_phases RPC liefert die Phase im Critical-Path-Set (computed)
```

Das `OR` löst AC-γ-2. Stakeholder werden dadurch **konsequent breiter** erkannt: sowohl PM-markierte als auch algorithmisch ermittelte kritische Phasen flaggen ihre zugeordneten Stakeholder.

**Wichtig:** PM-Override gewinnt **immer**. Das bedeutet:
- Markiert PM eine Phase manuell als kritisch, ist sie kritisch — auch wenn der Algorithmus sie übersieht (EC-γ-2).
- Demarkiert PM eine algorithmisch erkannte Phase nicht, bleibt der Stakeholder kritisch über den Computed-Pfad — dieser Effekt ist gewollt, weil die zwei Quellen orthogonal sind.

### Aggregations-Strategie

Neue Schicht in `route.ts`:

1. **5. Promise** parallel zu den bestehenden vier Detection-Queries: RPC-Call `compute_critical_path_phases(p_project_id)`. Ergebnis: `Set<phase_id>` (`computedCriticalPhaseIds`).
2. **`OR`-Verknüpfung** in den Phase-Loops: ein Work-Item wird als „kritisch" gewertet, wenn entweder `wi.phases.is_critical === true` **oder** `computedCriticalPhaseIds.has(wi.phase_id)`.
3. **Method-Gating respektiert**: RPC läuft nur wenn `phasesActive === true`. Für Kanban-Projekte (kein Phase-Konstrukt sichtbar) wird der RPC-Call gespart.
4. **Graceful Degradation**: Wenn RPC fehlschlägt, fällt das Computed-Set auf leer zurück; Detection läuft weiter nur über manuelle Markierungen. EC-γ-1 ist damit per Design abgedeckt.

### Datenmodell

**Keine Änderung.** Genutzt werden ausschließlich bestehende Bausteine:

| Baustein | Quelle | Status |
|---|---|---|
| `compute_critical_path_phases(p_project_id)` RPC | PROJ-25 (Gantt-Slice) | live |
| `phases.is_critical` | PROJ-35-β | live (PM-Aussage) |
| `sprints.is_critical` | PROJ-43-β | live (PM-Aussage) |
| `/api/projects/[id]/critical-path`-Endpoint | PROJ-25 (Gantt-Slice) | live, wiederverwendet vom Edit-Phase-Dialog |

### UI-Erweiterung

**`edit-phase-dialog.tsx`** bekommt einen **read-only Badge** neben dem bestehenden Switch „Auf kritischem Pfad":

```
[Switch: Auf kritischem Pfad]   [✓ Vom Gantt-Algorithmus erkannt]   ← read-only
                                 ↑ wenn Phase im Computed-Set
```

- Switch bleibt voll bedienbar — PM kann sich gegen den Algorithmus entscheiden.
- Badge ist rein informativ: „Hier denkt der Gantt-Algorithmus, das ist kritisch."
- Datenquelle: `useSWR("/api/projects/[id]/critical-path")` — Endpoint existiert seit PROJ-25, kein neuer Server-Path nötig.

**Stakeholder-Health-Dashboard-Tooltip (AC-γ-5):** der Health-Endpoint exposed ein zusätzliches Feld `critical_path_sources: { manual: boolean, computed: boolean }` pro Stakeholder. Frontend zeigt im Tooltip:
- nur `manual=true` → „Vom PM markiert"
- nur `computed=true` → „Vom Algorithmus erkannt"
- beide → „Beide Quellen bestätigen"

Payload-Impact: 2 Booleans × ≤ 50 Stakeholder = vernachlässigbar.

### Sicherheit & Berechtigungen

- **RLS:** unverändert. RPC ist `SECURITY DEFINER` und projekt-skoped — keine Cross-Tenant-Leaks.
- **Authentifizierung:** unverändert (`requireProjectAccess "view"`).
- **Class-3-PII:** unberührt — Phase-IDs sind keine personenbezogenen Daten.
- **Trigger / System-UPDATE:** **explizit verboten** durch AC-γ-3. Diese Architektur kommt ohne aus.

### Performance-Profil

- **Status quo nach β:** 2-4 parallele Queries je nach Method-Gating
- **Nach γ bei Wasserfall/PMI/PRINCE2/VXT2:** +1 RPC-Call zu den 2 Phase-Queries → 3 parallele Operationen
- **Nach γ bei Scrum/SAFe:** kein RPC-Call (phasesActive=false → Skip), 2 Sprint-Queries unverändert
- **Nach γ bei NULL-Methode:** 2 Phase-Queries + 2 Sprint-Queries + 1 RPC = 5 parallele Operationen
- **Nach γ bei Kanban:** keine Detection-Queries (beide Pfade inaktiv), kein RPC
- **RPC-Latenz:** erwartet < 50 ms bei n=500 Phasen mit indizierten FS-Edges; CIA bestätigt
- **Eskalation zu VIEW:** dokumentiert (Schwelle p95 > 200 ms)

### Test-Strategie

| Test | Szenario | Erwartung |
|---|---|---|
| T13 | RPC liefert `[phase-1]`, `phases.is_critical=false` auf phase-1 | Stakeholder via phase-1 wird als kritisch erkannt (computed-Pfad allein reicht) |
| T14 | RPC liefert leer, `phases.is_critical=true` auf phase-1 | Stakeholder via phase-1 kritisch (manueller Pfad allein reicht) — EC-γ-2 |
| T15 | RPC wirft Exception | Endpoint antwortet 200 mit nur manuellen Treffern, kein 500 — EC-γ-1 |
| T16 | Methode `kanban` | RPC wird **nicht** aufgerufen, Performance-Schoner |
| T17 | RPC liefert `[phase-1]` UND PM hat `phases.is_critical=true` auf phase-1 | `critical_path_sources.manual=true` UND `.computed=true` |
| UI: edit-phase-dialog.test.tsx | Phase-ID im Critical-Path-Endpoint enthalten | Read-only-Badge sichtbar; Switch bleibt bedienbar |

### Begründung der gewählten Lösung (für PM-Review)

**Warum keine neue Datenbank-Persistenz?**
Algorithmus-Output ist per V2-ADR-Pattern „AI as proposal layer" ein **Vorschlag**, keine kanonische Wahrheit. Persistenz würde Druck erzeugen, ihn als Wahrheit zu behandeln (Trigger füllen, Refresh-Jobs, Stale-Data-Diskussionen). Die ephemere API-Aggregation hält die Trennung sichtbar: PM-Spalte bleibt PM-eigen, Algorithmus-Set lebt nur für die Dauer eines Health-Requests.

**Warum nicht die Materialized-View, die so populär ist?**
Multi-Tenant-Killer. MVs erben in PostgreSQL **keine** RLS-Policies. Eine MV `phases_with_computed_critical_path` würde alle Tenant-Daten unsegmentiert enthalten; jede Cross-Tenant-Anfrage wäre ein Datenleck. Sicheres Aufsetzen würde tenant_id-Partitionierung + manuelle Refresh-Trigger + zusätzliche Authz-Schichten verlangen — der Aufwand übersteigt den Nutzen.

**Warum nicht eine zweite Spalte auf `phases` (nebst `is_critical`)?**
AC-γ-3 verbietet System-UPDATEs auf `phases.is_critical`. Eine Schwester-Spalte daneben mit demselben Mechanismus setzt ein gefährliches Präzedens — die Tabelle würde teils PM-eigen, teils System-eigen, das Field-Level-Audit (PROJ-10) bekäme System-Edits in den Audit-Trail, und der nächste Slice will dann die zwei Spalten verschmelzen. Sauberer ist, die zwei Quellen architektonisch getrennt zu halten.

**Warum den bestehenden `/critical-path`-Endpoint für Edit-Phase-Dialog wiederverwenden?**
Existiert seit PROJ-25, liefert exakt was der Dialog braucht (Phase-IDs des Critical-Paths). Ein neuer `/api/phases/[id]/computed-flag` wäre semantisch granularer, aber teurer in Wartung und Doppelaufruf-anfällig (Dialog würde N+1-mal anfragen statt einmal).

**Warum kein Sprint-Computed-Pendant?**
`compute_critical_path_phases` ist phasen-only. Eine analoge `compute_critical_path_sprints`-RPC existiert nicht und würde eine eigene FS-Chain-Berechnung über Sprints brauchen — das ist ein eigenständiger Slice (provisorisch δ oder PROJ-44+ Kandidat). γ deckt explizit nur Phasen ab.

### Komponentenstruktur

```
API-Endpoint            GET /api/projects/[id]/stakeholder-health
└── route.ts
    ├── 1. Auth + Projekt-Zugriff (unverändert)
    ├── 2. Aktive Stakeholder + linked_user_id-Map (unverändert)
    ├── 3. Method-Gating (unverändert seit β)
    ├── 4. Critical-Path-Detection — erweitert:
    │     ├── Phase-Pfade A/B/C → matchen wenn manuell ODER computed kritisch
    │     ├── Sprint-Pfade A'/B'/C' (unverändert seit β)
    │     └── 5. RPC compute_critical_path_phases  ← NEU
    │           → Set<phase_id> für OR-Logik in den Phase-Loops
    │           → Fehler-Fallback: leeres Set, manueller Pfad allein
    │     → Vereinigungsmenge der Stakeholder-IDs
    │     → optional: critical_path_sources je Stakeholder (manual/computed)
    ├── 5. Tenant-Overrides laden (unverändert)
    └── 6. Antwort komponieren (Shape-Erweiterung optional)

UI                      src/components/phases/edit-phase-dialog.tsx
└── Read-only Badge "Vom Algorithmus erkannt" neben dem Switch
   └── Datenquelle: useSWR("/api/projects/[id]/critical-path") — bestehend

UI                      src/components/projects/stakeholder-health/* (Tooltip)
└── Anzeige aus critical_path_sources, falls AC-γ-5 ausgerollt wird
```

### Abhängigkeiten

**Keine neuen Pakete.** Genutzt werden:
- bestehende Supabase-Client `.rpc(...)`-Methode
- bestehender `/critical-path`-Endpoint für Edit-Phase-Dialog
- `useSWR` (bereits im Stack)

### Migrations-/Deploy-Risiko

- **Schema-Drift-Risiko (PROJ-42-α):** keines, kein neuer SELECT auf nicht-existente Spalten; keine Migrations
- **RLS-Risiko:** keines, kein Policy-Change
- **Audit-Whitelist-Risiko:** keines, keine schreibenden Operationen
- **Frontend-Regression:** Edit-Phase-Dialog wird ergänzt, nicht umgebaut; Health-Response erweitert sich additiv um optionales Feld
- **Rollback:** trivial — drei Code-Hunk-Reverts (route.ts, edit-phase-dialog.tsx, optional Tooltip-Komponente)

### Open Questions / Architektur-Entscheidungen für /backend

| Frage | Default-Empfehlung | Veränderbar in /backend? |
|---|---|---|
| `critical_path_sources: { manual, computed }` im Response? | **ja**, additiv exposen — ermöglicht AC-γ-5 Tooltip ohne zweite API-Anfrage | ja |
| FS-Chain-Fallback (RPC liefert „längste Phase" wenn keine FS-Deps existieren) — durchreichen oder unterdrücken? | **durchreichen** (V2-Pattern: Algorithmus liefert Empfehlung, PM filtert) | ja, via RPC-Aufruf-Parameter falls vorhanden |
| Sprint-Computed-Quelle (analog zu Phase-RPC) | **out of scope für γ** — δ-Slice | nein, Slice-Grenze |
| Edit-Phase-Dialog Datenquelle: bestehender `/critical-path`-Endpoint vs. neuer dedizierter | **bestehender Endpoint wiederverwenden** | ja, falls Lazy-Load-Performance enttäuscht |
| Telemetrie-Tag für Eskalations-Schwelle | **`critical_path_source: rpc` in Sentry-Tags** für p95-Monitoring | ja |

### AC-Mapping (Status nach γ-Tech-Design)

| AC | Original | Nach Tech-Design |
|---|---|---|
| AC-γ-1 (VIEW oder gecachte Spalte) | offen | **konkretisiert: API-Aggregation, RPC-basiert, keine DB-Persistenz** |
| AC-γ-2 (`OR`-Verknüpfung) | unverändert | ✓ realisiert via Set-Lookup pro Phase-Loop |
| AC-γ-3 (kein System-UPDATE auf manueller Spalte) | unverändert | ✓ inhärent — keine Schreib-Operationen |
| AC-γ-4 (Read-only-Anzeige im Edit-Phase-Dialog) | unverändert | ✓ via useSWR auf bestehendem Endpoint |
| AC-γ-5 (Tooltip-Differenzierung) | unverändert | ✓ via additives `critical_path_sources`-Feld |

### Übergabe an Implementierung

Backend-+Frontend-Slice → bevorzugte Reihenfolge: `/backend` (RPC-Integration + Set-Logik + 5 Test-Cases) → `/frontend` (Edit-Phase-Badge + Stakeholder-Health-Tooltip) → `/qa` → `/deploy`. Geschätzter Gesamtaufwand: **~2 PT** (1 Backend, 1 Frontend) per CIA-Review.

### CIA-Review

Continuous Improvement Agent (2026-05-06) hat:
- Vier Architektur-Optionen bewertet (A VIEW / B MV / C Spalte / D API-Aggregation) und **D** mit klaren Begründungen empfohlen
- Anti-Patterns explizit benannt (Trigger / MV ohne RLS / System-UPDATE / 500 bei RPC-Fehler / Caching ohne Invalidation)
- Folge-Slice-Map mit Backend/Frontend/QA/Deploy-Punkten geliefert
- Eskalations-Pfad zu Option A (VIEW) für >200 Phasen-Tenants dokumentiert
- Open Questions an /architecture-Skill-Owner gestellt — alle in Default-Empfehlungen oben adressiert

Vollständiger CIA-Bericht ist in der Session-Konversation 2026-05-06 dokumentiert.
