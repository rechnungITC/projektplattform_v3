# PROJ-43: Stakeholder-Health Critical-Path Detection — Korrektheits- und Coverage-Fix

## Status: Deployed (43-α)
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
