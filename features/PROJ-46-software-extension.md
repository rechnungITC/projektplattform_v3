# PROJ-46: Software Project Extension

## Status

Planned (aufzuteilen — ein Teil erfüllt, einer teilweise, einer unberührt, einer umgedreht)

**Created:** 2026-05-06
**Last Updated:** 2026-09-02

> **Geerdet 2026-09-02 (PROJ-168).** Die älteste offene Story des Portfolios, und die einzige, deren
> vier Teile in **vier verschiedene** Zustände auseinandergelaufen sind: **ST-01 ist vollständig
> erfüllt** (PROJ-61), **ST-02 teilweise** (zeitliche Typen ja, fachliche Art und Begründung nein),
> **ST-03 vollständig unberührt** und damit der eigentliche Kern, **ST-04 in seiner Richtung
> umgedreht** — es war als Vorarbeit für die Jira-Konnektoren gedacht, und die sind ohne es gebaut
> worden. Eine Story in diesem Zustand ist keine Story mehr. Siehe Erdungsabschnitt.

## Summary

Deepen software-project support beyond generic Scrum objects: releases, technical dependencies, test and acceptance traceability, and delivery-readiness views. This builds on PROJ-9, PROJ-26, and PROJ-28 without turning the shared core into a Jira clone.

## Source Requirements

- `docs/architecture/target-picture.md`
- `docs/projektplattform_skills/home/ubuntu/skills_markdown/software/`
- `docs/PRD.md`

## Dependencies

- Requires: PROJ-6 method catalog
- Requires: PROJ-9 work item metamodel
- Requires: PROJ-26 method gating
- Requires: PROJ-28 method-aware navigation
- Influences: PROJ-47/50 Jira connector features

## User Stories

### ST-01 Releases
As a software project lead, I want releases as first-class planning containers so that delivery scope and dates are visible above sprint level.

Acceptance criteria:
- [x] Releases are project-scoped and tenant-scoped. — **erfüllt durch PROJ-61** (`Deployed / full`):
      `releases` trägt `tenant_id` **und** `project_id`, beide `not null` mit `on delete cascade`.
- [x] Work items can be assigned to a release. — **erfüllt**: `work_items.release_id` (in 6
      Migrationen referenziert, im Feld-Audit seit PROJ-Y-130s).
- [x] Release status and target date are visible in software method navigation. — **erfüllt**:
      `status` (Default `planned`), `start_date`/`end_date`, `target_milestone_id`, und die Route
      `/projects/[id]/releases` existiert (PROJ-28 führt sie als methodenspezifischen Slug für
      Scrum).

### ST-02 Technical Dependencies
As a delivery lead, I want technical dependencies to be distinguished from business dependencies so that architecture blockers are visible.

Acceptance criteria:
- [~] Dependencies can carry type and technical rationale. — **halb erfüllt, und die Hälften liegen
      auf verschiedenen Achsen.** `dependencies.constraint_type` trägt live `FS · SS · FF · SF` plus
      `lag_days`, mit Bedienfläche seit PROJ-155-β.1 — das sind **zeitliche** Beziehungen. Diese
      Story will „technical **distinguished from** business", also die **fachliche Art**; die gibt es
      nicht. Und ein **Begründungsfeld** fehlt: live gemessen hat `dependencies` 10 Spalten, keine
      davon `rationale`/`note`/`description`.
- [~] Cross-project technical dependencies can reference PROJ-27 links. — **strukturell möglich
      geworden, aber anders als gedacht.** Die polymorphe Fassung aus PROJ-9-R2 hat `from_type`/
      `from_id`/`to_type`/`to_id` und **kein `project_id` mehr** (die Erstfassung hatte eines). Der
      Typ-CHECK erlaubt live `project · phase · work_package · todo · sprint` — **darunter
      `project`**. Projekt-zu-Projekt-Kanten sind damit **direkt** möglich. Zu entscheiden ist also
      nicht mehr „wie referenzieren wir PROJ-27", sondern „brauchen wir den Umweg überhaupt".
      **Achtung, Namensfalle:** PROJ-27s Verknüpfungstabelle heißt live **`work_item_links`** — eine
      Tabelle `cross_project_links` existiert **nicht**. Die acht Migrations-Treffer auf diesen Namen
      sind der **AIPurpose** `cross_project_links` aus PROJ-65-ε.4.γ, also ein KI-Zweck in den
      Purpose-CHECKs. Wer nach dem Namen sucht, findet einen Zweck und hält ihn für eine Tabelle.
- [ ] Critical dependencies are reportable. — Critical-Path existiert (PROJ-43 `full`, PROJ-155-β.2
      seit 2026-09-02), aber ein „kritisch"-Merkmal **an der Kante** nicht.

### ST-03 Test and Acceptance Traceability
As a test manager, I want tests and acceptance checks linked to requirements/stories so that release readiness can be evaluated.

Acceptance criteria:
- [ ] Test cases can reference work items and releases. — **nichts davon existiert**: `test_case`,
      `test_run`, `test_result`, `acceptance_check` je **0** Treffer in `supabase/migrations/`
      **und** in `src/`.
- [ ] Failed tests can create bugs or open items via review. — nicht baubar ohne das Obige; die
      Zielseite existiert (`bug` ist ein `WorkItemKind`, `open_items` seit PROJ-20).
- [ ] Release readiness includes unresolved critical bugs and missing acceptance checks. — **die
      erste Hälfte könnte auf Bestand aufsetzen**: Readiness ist PROJ-56 (`Deployed / full`, 4
      Migrationen) und `bug` ist ein vorhandenes Work-Item-Kind. Die zweite Hälfte („missing
      acceptance checks") braucht die fehlenden Objekte.

### ST-04 Jira Compatibility
As an integration owner, I want software extension fields to map cleanly to Jira export/sync so that teams can connect without duplicate modeling.

Acceptance criteria:
- [ ] Release, dependency, and test fields have stable mapping names. — **nicht erfüllt**:
      `src/lib/jira/mapping.ts` kennt `status_map`, `priority_map`, `labels` und `assignee_mode` —
      und **0** Treffer für Release/`fixVersion`, Dependency oder Testfall.
- [ ] Jira connector specs can consume the mapping without schema ambiguity. — **die Richtung dieses
      Kriteriums hat sich umgedreht.** Es war als **Vorarbeit** gedacht (die Spec sagt oben
      „Influences: PROJ-47/50"). Tatsächlich sind PROJ-47 (`full`) und PROJ-50 (`mvp`) **ausgeliefert**
      — mit `jira_field_mappings`, `jira_export_jobs` und `external_refs`, ohne auf diese Story zu
      warten. Was bleibt, ist keine Vorarbeit, sondern eine **Nachrüstung an einem laufenden
      Konnektor** — ein anderer Zuschnitt, anderes Risiko.

## Out of Scope

- Replacing Jira as an issue tracker.
- CI/CD pipeline execution.
- Source-code scanning.

## Technical Requirements

- Use extension tables or typed metadata instead of redefining `work_items`.
- Keep method gating strict: software-only surfaces must not appear in non-software methods unless explicitly configured.
- All new data must be tenant-scoped and RLS-protected.

## V2 Reference Material

- `docs/projektplattform_skills/home/ubuntu/skills_markdown/software/`
- `docs/decisions/work-item-metamodel.md`
- `docs/decisions/method-object-mapping.md`

## Geerdet am 2026-09-02 (PROJ-168)

### Der Befund: vier Teile, vier Zustände

Diese Story ist am **2026-05-06** entstanden und seit dem **2026-05-12** unverändert — die älteste
offene des Portfolios. In diesen knapp vier Monaten sind ihre vier Teile in vier verschiedene
Zustände gelaufen:

| Teil | Zustand | Gemessen |
|---|---|---|
| **ST-01 Releases** | **vollständig erfüllt** | `releases` mit `tenant_id`+`project_id`, `work_items.release_id`, `status`, `start_date`/`end_date`, `/releases`-Route — alles über PROJ-61 (`Deployed / full`) |
| **ST-02 Technische Abhängigkeiten** | **teilweise, auf der falschen Achse** | `constraint_type` = `FS·SS·FF·SF` (zeitlich) statt technisch-gegen-fachlich; kein Begründungsfeld unter 10 Spalten; Cross-Project ist über `from_type='project'` **direkt** möglich geworden |
| **ST-03 Test-/Abnahme-Traceability** | **vollständig unberührt** | `test_case`/`test_run`/`test_result`/`acceptance_check` je 0 Treffer in Migrationen und `src/` |
| **ST-04 Jira-Kompatibilität** | **Richtung umgedreht** | Das Mapping kennt Status, Priorität, Labels, Assignee — und 0 Release-/Dependency-/Test-Felder. PROJ-47/50 sind fertig, **ohne** diese Story |

### Warum das ein Aufteilungs-Urteil ist und keine Erdung mit Nacharbeit

Bei PROJ-82/83 (Tranche 1) genügte ein α/β-Schnitt, weil dort **eine** Fachlichkeit an einer
gesperrten Abhängigkeit hing. Hier ist es anders: die vier Teile haben nach vier Monaten **keine
gemeinsame Restarbeit** mehr. ST-01 ist fertig, ST-03 ist ein eigenes Datenmodell mit eigener
Fachlichkeit (Testmanagement), ST-04 ist eine Nachrüstung an einem ausgelieferten Konnektor, und
ST-02 sind zwei kleine Felder. Eine Slice, die alle vier zusammenhält, hätte weder einen gemeinsamen
Nachweis noch eine gemeinsame Abnahme.

**Der Zuschnitt, der aus der Messung folgt** — vorgeschlagen, nicht entschieden:

- **ST-01 abhaken.** Erfüllt durch PROJ-61, mit Nachweis je Kriterium oben.
- **ST-02 als kleine Nachrüstung** (fachliche Art · Begründungsfeld · „kritisch"-Merkmal). Vorher zu
  klären: ob der Umweg über `cross_project_links` überhaupt noch gewollt ist, wo
  `from_type='project'` direkt erlaubt ist.
- **ST-03 als eigene Slice** — der eigentliche Kern, und das größte Stück. Testmanagement ist eine
  eigene Fachlichkeit; die Hausregel „search for the primitive that already exists" ist hier
  ergebnislos (0 Treffer), also entsteht wirklich Neues.
- **ST-04 als Nachrüstung an PROJ-47/50**, nicht als Vorarbeit. Fachlich gehört es dorthin, wo das
  Mapping lebt.

### Nutzungsmessung — und sie fällt anders aus als beim M&A-Epic

Live gegen Prod am 2026-09-02:

| Gemessen | Wert | Was es sagt |
|---|---|---|
| `releases` | **2** | ST-01 ist nicht nur gebaut, sondern **benutzt** |
| `work_items` mit `release_id` | **3** | ebenso |
| `dependencies` | **5** | alle `FS`, **0** mit Abstand ≠ 0, **0** Projekt-Kanten |
| `work_items` mit `kind='bug'` | **0** | die ST-03-Hälfte „unresolved critical bugs" hat heute keine Datenbasis |

**Der bemerkenswerte Teil ist die Dependency-Zeile:** PROJ-155-β.1 hat am 2026-09-01 Typ und Abstand
als bedienbare Objekte geliefert — und in Prod sind alle fünf Kanten weiterhin `FS` mit Abstand 0.
Der Mechanismus ist ausgeliefert und **noch nie benutzt**. Das ist ein Argument gegen ST-02s
fachliche Abhängigkeitsart: eine zweite Unterscheidungsachse zu bauen, während die erste ungenutzt
ist, wäre Vorratsarbeit.

**Anders als beim M&A-Epic (PROJ-167, null Nutzung) ist die Software-Extension teilweise in
Gebrauch** — die Releases werden verwendet. Das macht ST-01s Erfüllung nicht nur formal, sondern
praktisch belegt.

### Was diese Erdung nicht entschieden hat

Ob die Aufteilung so erfolgt; ob ST-03 überhaupt gewollt ist (der erste Pilot ist ERP, nicht
Software — siehe `docs/PRD.md`); und ob eine fachliche Abhängigkeitsart (ST-02) den Aufwand lohnt,
wo der Bestand seit PROJ-155-β.1 vier zeitliche Typen samt Bedienfläche trägt und die fünf
Kanten in Prod **ausnahmslos** `FS` mit Abstand 0 sind — die erste Achse ist also ungenutzt.

### Ein Buchführungs-Nebenbefund

`docs/PRD.md` führte diese Fähigkeit als **`_TBD_`**-Zeile („Software project extension: sprints,
releases, technical dependencies") — ohne die Kennung, obwohl diese Spec seit dem 2026-05-06
existiert. Zwei der drei dort genannten Punkte sind längst ausgeliefert (**Sprints** über
PROJ-59/60, **Releases** über PROJ-61). In PROJ-168 nachgezogen.
