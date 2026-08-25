# PROJ-78: Skill-Projektzuordnung

## Status: Deployed (2026-08-11)

## Deployment Scope: full

> **Scope-Klassifikation (PROJ-Y-145b, Tranche 5, 2026-08-24):** QA **0 Critical/0 High**: Live-Pentest **14/14** gegen Prod mit 0 Rueckstaenden (Betrachter-Sperre 42501, mandantenuebergreifend, inaktiver Skill 422, Idempotenz, `manual_pm` ueberlebt den Auto-Replay, Lesbarkeit des `removed`-Ereignisses, `anon`-EXECUTE entzogen), dazu vier Regressions-Pentests fremder Slices und Playwright 6/6. **Der Architektur-Pass hat zwei Spec-Annahmen live widerlegt** und die Story dadurch erst baubar gemacht: die gespecte „Re-Resolution bei Methoden-/Typ-Wechsel" ist unerreichbar (Methode ist per Trigger unveraenderlich, `project_type` hat nach der Anlage keinen Schreibpfad) und wurde durch das real erreichbare, rein additive „Skills abgleichen" ersetzt; und `record_audit_changes` ist ein AFTER-**UPDATE**-Diff, haette fuer INSERT/DELETE also **nie** eine Zeile geschrieben. Die vier E2E-Befunde (F-1…F-4) sind vorbestehend oder Umgebungsgrenzen, keiner davon ein offenes Kriterium.

**Deployed:** 2026-08-11 — Closure-Deploy, Tag `v2.44.0-PROJ-78`. Code lag bereits auf main (Merge `61943e6`, PR #301), Migration `20260807205228_proj78_project_skills` seit `/backend` in Prod → kein Runtime-Deploy nötig (Vercel deployt automatisch von main). Verifiziert auf main `265cccb`: ESLint 0 · `npm run build` clean · `check:migration-naming` 0 Errors · Post-Deploy-Smoke gegen Prod: alle neuen Flächen 307 Auth-Gate, kein Leck.
**Created:** 2026-06-06
**Last Updated:** 2026-08-08

## Summary
Wizard-Erweiterung und Project-Room-Sidebar-Entry: When a project is created (or its method/project_type is changed), the system auto-assigns matching Skills based on `method_tags`, `project_type_tags`, and the `cross_cutting` category. The PM sees a confirmation step in the wizard and can remove auto-assigned skills or add others from the catalog. Inside the project room, a new "Skills" section in the method-aware sidebar shows the active set.

## Dependencies
- Requires: PROJ-76 (Skill-Framework — catalog source)
- Requires: PROJ-2 (Project CRUD) — wizard hook + `projects.project_method` column from PROJ-7
- Requires: PROJ-7 (Project Room) — sidebar entry slot
- Requires: PROJ-10 (Audit)
- Influences: PROJ-82 (Skill-driven AI Proposals) — looks up assigned skills at proposal time

## V2 Reference Material
- Conceptually adjacent to V2 method selection but skill auto-assign did not exist in V2.
- Method-template registry already in `src/lib/method-templates/` (PROJ-7 Tech Design).

## User Stories
- **[V3 SK-11]** As a PM, I want auto-assigned skills suggested in the project wizard based on the method and project type I selected, so that I do not have to pick each skill manually.
- **[V3 SK-12]** As a PM, I want to remove suggested skills or add others from the catalog before finishing the wizard, so that the final skill set matches my project reality.
- **[V3 SK-13]** As a PM, I want to see the active skills for my project on a dedicated sidebar entry inside the project room, so that I know which agent personas are in scope.
- **[V3 SK-14]** As a PM, I want to add or remove skills from my project after creation, so that the skill set can evolve with the project.

## Acceptance Criteria

### Data model
- [ ] Junction table `project_skills`: `id UUID PK, tenant_id UUID NOT NULL, project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE, skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE RESTRICT, assignment_source TEXT NOT NULL CHECK (assignment_source IN ('auto_method','auto_project_type','auto_cross_cutting','manual_pm','manual_admin')), assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(), assigned_by UUID REFERENCES auth.users(id)`.
- [ ] Unique `(project_id, skill_id)`.
- [ ] Skill cannot be hard-deleted while referenced (FK ON DELETE RESTRICT); deactivate handled in PROJ-76.

### Auto-assignment logic at project creation
- [ ] Server function `resolveSkillsForProject(method, project_type, tenant_id)` returns the matching skill set:
  - All active skills where `category='method'` AND `method_tags` contains `method`.
  - All active skills where `category='project_type'` AND `project_type_tags` contains `project_type`.
  - All active skills where `category='cross_cutting'`.
- [ ] Results de-duplicated by `skill_id`.
- [ ] Empty matches return empty array (UI shows informational hint, not error).

### Wizard step "Skills"
- [ ] New wizard step "Skills" appears AFTER the method+project-type step.
- [ ] Shows the auto-resolved skill set as cards with: name, category badge, description, tags, source label (e.g. "method: scrum"), checkbox to deselect.
- [ ] Toolbar action "Aus Katalog hinzufügen" opens a multi-select dialog with all active skills the project does not yet have, with tag filter.
- [ ] PM may finish the wizard with zero skills assigned (with a soft warning).
- [ ] On wizard completion, `project_skills` rows are written with the chosen `assignment_source`.

### Project-room sidebar entry "Skills"
- [ ] Sidebar shows "Skills" entry under the method-driven sections (PROJ-7 sidebar pattern).
- [ ] Entry route `/projects/[id]/skills` lists active skills with category badges, description, and the assignment source.
- [ ] PM can:
  - Add another skill from the catalog (writes `assignment_source='manual_pm'`).
  - Remove a skill (deletes the junction row).
- [ ] Removal of an auto-assigned skill is allowed but flagged in audit as a manual override.

### ~~Re-resolution on method or project_type change~~ → Katalog-Abgleich (korrigiert 2026-08-07)

> **Spec-Korrektur (/architecture, CIA-reviewed).** Die ursprüngliche Formulierung
> setzte einen Methoden- bzw. Projekttyp-Wechsel voraus. Beides ist live nicht
> erreichbar: `projects_method_immutable` blockt jede Änderung einer gesetzten
> Methode (errcode 42501, die referenzierte Migrations-RPC existiert nicht), und
> `project_type` hat nach der Anlage **keinen Schreibpfad** (weder `patchSchema`
> in `src/app/api/projects/[id]/route.ts` noch UI akzeptieren das Feld).
> Ersetzt durch den real erreichbaren Auslöser. Nachverfolgung: PROJ-Y-78a/78b.

- [ ] Aktion „Skills abgleichen" im Projektraum, **bewusst vom PM ausgelöst** (kein Automatismus).
- [ ] Der Abgleich ist **rein additiv**: er schlägt nur Skills vor, die noch nicht zugeordnet sind, und entfernt **niemals** eine bestehende Zuordnung — unabhängig von deren `assignment_source`.
- [ ] Deckt beide real erreichbaren Auslöser ab: (a) der Katalog ist gewachsen, (b) die Methode wurde nachträglich gesetzt (`NULL → Wert` ist die **einzige** vom Trigger erlaubte Methoden-Transition und im Wizard regulär erreichbar, da der Methoden-Schritt `null` zulässt).
- [ ] PM nimmt Vorschläge einzeln an oder verwirft sie; angenommene Zeilen tragen die auflösende `auto_*`-Herkunft.
- [ ] Ein zuvor entfernter Skill darf erneut vorgeschlagen werden (kein dauerhaftes „nie wieder"-Merkmal).

### Audit
> **Spec-Korrektur (/architecture).** `record_audit_changes` ist ein reiner
> AFTER-**UPDATE**-Diff (live verifiziert: liest `OLD`/`NEW`). Zuordnungen werden
> nur angelegt und gelöscht, nie geändert — der Auto-Trigger würde also **keine
> einzige** Zeile schreiben. Die Ereignisse werden daher explizit in der
> SECURITY-DEFINER-RPC geschrieben (Muster PROJ-141-α4).

- [ ] Ereignis bei Zuordnung (`field_name='assigned'`) mit Herkunft als neuem Wert.
- [ ] Ereignis bei Entfernung (`field_name='removed'`), inkl. Kennzeichnung, wenn eine `auto_*`-Zuordnung manuell überschrieben wurde.
- [ ] **Kein** `record_audit_changes`-Trigger und **kein** `_tracked_audit_columns`-Zweig für `project_skills` (es gibt keinen UPDATE-Pfad).
- [ ] `audit_log_entity_type_check` und `can_read_audit_entry` werden **additiv per Anchor-Replace aus der Live-Definition** erweitert; `grant execute … to authenticated` danach erneut gesetzt.

## Edge Cases
- **No matching skills in tenant catalog** → wizard step shows "Noch keine Skills für diese Kombination konfiguriert" with a deep-link for admins to create one.
- **Skill becomes inactive (PROJ-76) after assignment** → junction row stays; project_room "Skills" tab shows the skill greyed out with status badge "inaktiv"; PROJ-82 skips it at proposal time.
- **Skill is deleted (not supported V1, but if a future delete path lands)** → FK RESTRICT prevents it; admin must remove all assignments first.
- **Same skill auto-assigned via two routes** (e.g. method + cross_cutting) → de-dup at resolve time; `assignment_source` defaults to the first match in priority order: method → project_type → cross_cutting.
- **PM removes a skill, then changes method back** → re-resolution dialog re-offers it.
- **Wizard exited mid-flow** → no `project_skills` rows written; no orphan state.

## Technical Requirements
- **Stack:** Next.js 16 + Supabase, shadcn/ui (`Card`, `Checkbox`, `Dialog`, `Badge`).
- **Multi-tenant:** `tenant_id` enforced on `project_skills`. RLS **SELECT** via `is_tenant_member(tenant_id) AND is_project_member(project_id)`; **INSERT/DELETE** zusätzlich `has_project_role(project_id,'lead') OR is_tenant_admin(tenant_id)` (verschärft ggü. Erstfassung — ab PROJ-82 steuert das Skill-Set das KI-Handlungsmandat, ein Viewer darf es nicht verschieben; konsistent mit PROJ-102/104). Same-Tenant-Konsistenz-Trigger gegen mandantenfremde Skills.
- **Validation:** Zod for wizard payload; enum check for `assignment_source`.
- **Auth:** Supabase Auth; PM project role required for project-room changes; admin role for backend admin overrides.
- **Performance:** Skill list for wizard is cached per tenant (reuse PROJ-76 cache). Project skill list cached per project for 60 s.
- **Audit hook:** PROJ-10.

## Out of Scope
- Conflict resolution between overlapping skills at runtime (PROJ-82).
- Per-project skill customizing (V1 keeps tenant-global content; PROJ-77 is admin-only).
- Bulk reassignment across multiple projects (admin admin tool, deferred).
- Skill recommendation engine ("you might also want X") — V2.

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

**Architected 2026-08-07** (CIA-reviewed, 5 Forks entschieden, 2 HIGH-Findings live gegen Prod verifiziert).
Kein neues Dependency. Eine Migration im Fenster `20260807 12xxxx`.

### Ausgangslage — was live wirklich gilt (verifiziert, nicht aus der Spec übernommen)

Zwei Annahmen der ursprünglichen Spec halten der Realität nicht stand:

1. **Der Methoden-Wechsel, den die Spec voraussetzt, kann nicht stattfinden.**
   Ein DB-Wächter (`projects_method_immutable`) blockt jede Änderung einer bereits
   gesetzten Projekt-Methode. Erlaubt ist ausschließlich der Erstsetzungs-Fall
   „noch nicht festgelegt → Methode". Ein echter Wechsel (Scrum → Wasserfall)
   ist produktweit unmöglich; die dafür vorgesehene Migrations-Funktion existiert
   nirgends.
2. **Der Projekttyp lässt sich nach der Anlage überhaupt nicht mehr ändern.**
   Die DB würde es erlauben, aber es gibt keinen einzigen Schreibweg dorthin —
   weder API noch Oberfläche akzeptieren das Feld nach der Projektanlage.

Damit beschreibt der Spec-Block „Re-resolution on method or project_type change"
einen Zustand, den das Produkt nicht erzeugen kann.

**Der Auslöser, der real eintritt, ist ein anderer:** Der Skill-Katalog ist neu
(PROJ-76/77) und wächst. Ein Admin legt *nach* der Projektanlage neue Skills an —
und ein PM, der den Wizard ohne Methode abgeschlossen hat, setzt diese später nach.

### Entscheidung D1 — „Abgleichen" statt „Re-Resolution"

Statt auf einen Wechsel zu reagieren, der nie kommt, bekommt der Projektraum eine
**bewusst ausgelöste Aktion „Skills abgleichen"**. Sie schlägt ausschließlich
*zusätzliche* Skills vor und entfernt nie etwas. Sie deckt beide real erreichbaren
Auslöser ab: den gewachsenen Katalog und die nachgetragene Methode.

Das ist strikt sicherer als die ursprüngliche AC: ein manuell gesetzter Skill kann
durch keinen Automatismus verschwinden. Die Spec-ACs zur Re-Resolution werden
entsprechend umgeschrieben; die unerreichbaren Anteile wandern als PROJ-Y-78a/78b
in die Nachverfolgung.

### Entscheidung D2 — Vorschlagen liest, Speichern schreibt kontrolliert

Die **Auflösung** (welche Skills passen?) ist eine reine Leseabfrage im Namen des
angemeldeten Nutzers. Das ist bewusst so: die Zugriffsregeln der Skill-Tabelle
zeigen einem normalen PM ohnehin nur *aktive* Skills — die fachlich exakt richtige
Filterung entsteht damit von selbst, ohne Sonderlogik.

Das **Speichern** läuft dagegen über eine kontrollierte Datenbank-Funktion. Grund:
der bestehende Audit-Automatismus des Systems protokolliert nur *Änderungen* an
Datensätzen — Neuanlagen und Löschungen sieht er strukturell nicht. Die von der
Spec geforderten Ereignisse (`zugewiesen`, `entfernt`) entstehen also nur, wenn die
Funktion sie selbst schreibt. Sie prüft dabei eigenständig, wer sie aufruft.

**Fehlertoleranz beim Projektanlegen:** Scheitert die Skill-Zuordnung, wird das
Projekt trotzdem angelegt und der PM bekommt einen sichtbaren Hinweis. Ein Projekt
ohne Skills ist voll funktionsfähig und im Projektraum nachbesserbar — ein
Abbruch mit Datenverlust wäre die schlechtere Wahl. Das spiegelt exakt die bereits
etablierte Behandlung der M&A-Projektvorlagen.

### Entscheidung D3 — Wer darf das Skill-Set ändern

Die Spec verlangte nur „Projektmitglied". Das ist zu schwach: ab PROJ-82 bestimmt
das Skill-Set das *Handlungsmandat der KI* — ein reiner Betrachter darf das nicht
verschieben können. Deshalb: **Lesen** für jedes Projektmitglied, **Ändern** nur
für Projektleitung oder Tenant-Admin. Zusätzlich verhindert eine Konsistenz-Regel,
dass ein Skill aus einem fremden Mandanten angehängt wird.

### Entscheidung D4 — Doppelzuordnungen und Wiederholläufe

Ein Skill kann über mehrere Wege passen (z. B. Methode *und* Querschnitt). Es wird
pro Projekt genau einmal geführt; die Herkunft ist der **erste** Treffer in der
Reihenfolge Methode → Projekttyp → Querschnitt. Ein zweiter Abgleich lässt
bestehende Zuordnungen unangetastet — dadurch kann eine manuelle Zuordnung nie von
einem Automatismus überschrieben werden, ohne dass es dafür eine Sonderregel
braucht. Ein entfernter Skill wird bei einem späteren Abgleich wieder angeboten;
der PM entscheidet erneut. Bewusst *kein* dauerhaftes „nie wieder vorschlagen"-
Merkmal — das wäre Zustand, den niemand pflegt.

### Komponenten-Struktur

```
Wizard (Projektanlage)
+-- Schritt "Skills"  (neu, nach "Detail-Fragen")
|   +-- Vorschlagsliste (Karten: Name, Kategorie-Badge, Beschreibung,
|   |                    Herkunft "Methode: Scrum", Auswahl-Haken)
|   +-- Aktion "Aus Katalog hinzufügen" (Mehrfachauswahl-Dialog, Tag-Filter)
|   +-- Leer-Hinweis "Noch keine Skills für diese Kombination"
|       (+ Deep-Link für Admins in den Katalog)
+-- Schritt "Review"
    +-- Zusammenfassungs-Karte "Skills (n)"

Projektraum
+-- Sidebar-Eintrag "Projekt-Skills"   (CORE — alle Projekttypen)
    +-- Liste zugeordneter Skills (Kategorie, Beschreibung, Herkunft)
    |   +-- Badge "inaktiv" für zwischenzeitlich deaktivierte Skills
    +-- Aktion "Hinzufügen" (Katalog-Dialog)
    +-- Aktion "Entfernen"  (mit Rückfrage)
    +-- Aktion "Skills abgleichen" (additiver Vorschlags-Dialog)
```

Der Sidebar-Eintrag heißt **„Projekt-Skills"**, nicht „Skills" — der Name „Skills"
ist in der Hauptnavigation bereits durch den tenant-weiten Katalog belegt.

### Datenmodell (Klartext)

Eine neue Verknüpfungstabelle **Projekt-Skill-Zuordnung**. Pro Eintrag:

- zu welchem Mandanten und Projekt die Zuordnung gehört
- welcher Skill zugeordnet ist
- **Herkunft**: automatisch über Methode / über Projekttyp / als Querschnitt,
  oder manuell durch PM bzw. Admin
- wann und von wem zugeordnet

Regeln: jeder Skill höchstens einmal pro Projekt; ein Skill kann nicht gelöscht
werden, solange er noch zugeordnet ist (er wird stattdessen deaktiviert — das
regelt PROJ-76). Wird ein Projekt gelöscht, verschwinden seine Zuordnungen mit.

**Bewusst nicht gebaut:** kein Änderungs-Verlauf auf der Zuordnung selbst — eine
Zuordnung wird angelegt und entfernt, nie bearbeitet. Der Nachweis entsteht über
die beiden Ereignisse.

### Abgrenzung — was hier *nicht* passiert

Das Feature ordnet Skills nur **zu**. Es prüft und erzwingt **nichts** davon zur
Laufzeit: welche Aktionen ein Skill ausführen darf, bleibt vollständig PROJ-82/83
überlassen (dort bewusst „fail-closed" gelockt). Für PROJ-82 wichtig und hier
schon berücksichtigt: die Rangfolge mehrerer Skills leitet sich später aus der
**Kategorie** ab, nicht aus der Herkunft (eine manuelle Zuordnung trägt keine
Kategorie-Information), und der Zuordnungszeitpunkt bleibt bei Wiederholläufen
stabil, damit eine spätere Reihenfolge-Logik nicht springt.

### Risiken und Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| Geteilte Audit-Bausteine — eine Parallel-Session hat hier real schon einen Zweig zerstört | Nur additiv erweitern, immer aus der *laufenden* Definition heraus, mit Abbruch bei fehlendem Ankerpunkt und anschließender Verifikation. Berechtigung danach erneut setzen. |
| Nav- und Wizard-Registry sind Konfliktpunkte mit 4 Parallel-Slices | Genau ein Eintrag an genau einer Stelle; Wizard-Schritt ohne Signatur-Änderung an der bestehenden Sichtbarkeits-Funktion |
| Leerer Katalog beim Piloten (heute hat kein Mandant getaggte Skills) | Der Leerfall ist der *Normalfall*, kein Fehler: freundlicher Hinweis + Deep-Link, Wizard bleibt abschließbar |
| Zuordnung schlägt beim Anlegen fehl | Projekt entsteht trotzdem, sichtbarer Hinweis, im Projektraum nachholbar |

### Abhängigkeiten (Pakete)

Keine. Die benötigten Oberflächen-Bausteine (Karte, Auswahlhaken, Dialog, Badge,
Rückfrage-Dialog) sind vorhanden.

### Offene Punkte → Nachverfolgung

- **PROJ-Y-78a** — echter Methodenwechsel (eigener, schwerer Slice: Sprints,
  Phasen, Navigation hängen daran)
- **PROJ-Y-78b** — Projekttyp nachträglich änderbar machen (Voraussetzung für
  eine typbasierte Neu-Auflösung)
- **PROJ-Y-78c** — Massen-Zuordnung über mehrere Projekte (Spec: „Out of Scope")
- **PROJ-Y-78d** — Empfehlungen („könnte auch passen")

## Implementation Notes

### Backend (2026-08-07)

**Migration:** `supabase/migrations/20260807120000_proj78_project_skills.sql`
→ in Prod registriert als Version **`20260807205228`** (`proj78_project_skills`).
Versions-Drift zum Repo-Dateinamen ist **benign** und PROJ-134-Domäne: die
Migration ist durchgängig idempotent (`create table if not exists`,
`create index if not exists`, `create or replace function`,
`drop policy/trigger if exists` + create, beide DO-Blöcke mit Early-Return-
Guard) → `supabase db push` kann sie gefahrlos erneut abspielen.
`npm run check:migration-naming`: **0 errors** (83 vorbestehende Warnungen).

**Gebaute DB-Fläche**
- Tabelle `project_skills` (+ 3 Indizes, Unique `(project_id, skill_id)`,
  `skill_id` FK **ON DELETE RESTRICT**, `project_id`/`tenant_id` CASCADE).
- Trigger `project_skills_tenant_consistency` — Projekt, Skill und `tenant_id`
  müssen zusammengehören (blockt mandantenfremde Skills, 22023).
- RLS: SELECT = `is_tenant_member AND is_project_member`;
  INSERT/DELETE zusätzlich `is_tenant_admin OR has_project_role('lead')`;
  **keine UPDATE-Policy** (default-deny — es gibt keinen UPDATE-Pfad).
- RPC `assign_project_skills(uuid, jsonb) → jsonb` (SECURITY DEFINER,
  kein actor-Param → `auth.uid()`, Autoritäts-Gate, Cap 100, aktiv+Tenant-
  Prüfung je Skill, `on conflict do nothing`, expliziter Audit-Insert je
  neuer Zeile, Rückgabe `{assigned, skipped}`).
- RPC `remove_project_skill(uuid, uuid) → void` (Audit **vor** dem DELETE,
  markiert `manual_override=true`, wenn eine `auto_*`-Zuordnung entfernt wird).
- Audit-Verdrahtung **additiv per Anchor-Replace aus der LIVE-Definition**:
  `audit_log_entity_type_check` + `can_read_audit_entry`-Zweig, beide mit
  Early-Return-Idempotenz **und** Regressionsschutz (bricht hart ab, falls
  Zweige der Parallel-Slices fehlen). `grant execute … to authenticated`
  danach erneut gesetzt (PROJ-77-γ-Vorfall). **Kein** `record_audit_changes`-
  Trigger und **kein** `_tracked_audit_columns`-Zweig — bewusst, siehe unten.

**Zwei Design-Entscheidungen, die von der Spec abweichen (beide live belegt)**
1. **Explizites Audit statt Trigger.** `record_audit_changes` ist ein AFTER-
   **UPDATE**-Diff (live verifiziert: liest `OLD`/`NEW`). Zuordnungen werden
   nur angelegt und gelöscht → der Trigger hätte **nie** eine Zeile
   geschrieben und die Audit-ACs wären still unerfüllt geblieben.
2. **`audit_log_entries.entity_id` = `project_id`**, nicht die Junction-
   Zeilen-id. Sonst wäre der `removed`-Eintrag nach dem DELETE über
   `can_read_audit_entry` nicht mehr auflösbar → dauerhaft unlesbares Audit.
   Die Skill-Identität steckt in `old_value`/`new_value`. Pentest-Vektor H
   beweist die Lesbarkeit.

**Tag-Semantik:** **leeres Tag-Array = „gilt für alle"** (PROJ-76-Vokabular
aus `src/app/api/skills/_schema.ts`). Die wörtliche Spec-Regel
(„method_tags contains method") hätte den Leer-Fall nie getroffen und das
dokumentierte Katalog-Vokabular gebrochen.

**TS-Fläche**
- `src/types/project-skill.ts` — Typen, Labels, `isAutoSource()`.
- `src/lib/project-skills/resolve.ts` — **reine** Funktionen
  `resolveSkillsForProject` + `resolveNewCandidates` (additiv).
- `src/lib/project-skills/api.ts` — Client-Wrapper.
- Routen: `GET|POST /api/projects/[id]/skills`,
  `DELETE /api/projects/[id]/skills/[skillId]`,
  `GET /api/projects/[id]/skills/resolve`.
  Alle über den **session-gebundenen** User-Client (nie service-role);
  Lesen `view`, Schreiben `manage_members`; RPC-Fehlercodes gemappt
  (42501→403, P0002→404, 22023→422).
- Wizard-Finalize (`…/finalize/route.ts`) Schritt **4.4**: liest
  `draft.data.skills.assignments`, ruft die RPC **best-effort** und pusht bei
  Fehler `warnings[{code:'skill_assign_failed'}]` — spiegelt den
  PROJ-141-γ2-Lock (kein Rollback; ein Projekt ohne Skills ist funktionsfähig
  und im Projektraum reparierbar).

**Live-Nachweise (alle gegen Prod, rolled back, 0 Residue verifiziert)**
- `tests/sql/PROJ-78-project-skills-pentest.sql` — **14/14 PASS**
  (Happy-Path + Audit-Zeilen · Idempotenz · manual_pm überlebt auto-Replay ·
  Viewer-Block 42501 · Cross-Tenant 42501 · inaktiv 22023 · Remove +
  `manual_override` · Audit-Lesbarkeit des removed-Events · Viewer-DELETE
  0 rows · Stranger 0 rows + Audit-Read false · anon-EXECUTE revoked ·
  Tenant-Mismatch-Trigger).
- Regressionen: **PROJ-141-α1 8/8 PASS**, **PROJ-141-α3/α4 11/11 PASS**,
  **PROJ-76 RLS 10/11 verbatim** (P11 s. Finding F-1) + 3/3 scoped
  Re-Verifikation der Kern-Semantik.
- Supabase-Advisors: **0 ERROR** / 127 WARN. Meine 2 RPCs erzeugen genau die
  bekannte `authenticated_security_definer_function_executable`-Klasse (wie
  die 120 vorbestehenden RPCs); **keine** `function_search_path_mutable`-
  und **keine** `anon_*`-Warnung.

**F-1 (Low, VORBESTEHEND, nicht durch PROJ-78 verursacht):**
`tests/sql/PROJ-76-skill-framework-rls-pentest.sql` Vektor **P11** prüft eine
**absolute** Skill-Anzahl (`expect 2`) im Tenant `329f…`. Seit dem
2026-08-04 existiert dort ein echter, über die deployte PROJ-76-UI angelegter
Skill („Scrum Coach", inaktiv) → P11 liefert 3 und schlägt fehl. Das Gate
selbst ist intakt (scoped re-verifiziert: Admin sieht beide geseedeten,
Member nur den aktiven, der vorbestehende inaktive bleibt für Member
unsichtbar). **Fix gehört zu PROJ-76**: P11 auf die geseedeten IDs
einschränken statt auf `count(*) where tenant_id = …`. → PROJ-Y-78e.

## QA Test Results

**QA-Durchlauf 2026-08-07/08 — 0 Critical / 0 High → PRODUCTION-READY**
(kein `/deploy` in diesem Lauf; Branch `proj-78/skill-project-assignment`.)

### AC-Matrix

| Bereich | Ergebnis | Nachweis |
|---|---|---|
| Datenmodell (`project_skills`, Unique, FK RESTRICT) | ✅ PASS | Migration + Live-DDL-Verifikation |
| Auto-Auflösung (Kategorie-Regeln, Dedup, Leer = kein Fehler) | ✅ PASS | 14 Unit-Tests `resolve.test.ts` |
| Priorität method → project_type → cross_cutting | ✅ PASS | Unit-Test „de-duplicates and keeps the FIRST match" |
| Wizard-Step „Skills" (Karten, Katalog-Dialog, 0 Skills erlaubt, Leer-Hinweis + Deep-Link) | ✅ PASS | `step-skills.tsx`; `validateStep("skills") → true` |
| Persistenz bei Wizard-Abschluss | ✅ PASS | Finalize-Schritt 4.4 + 5 Route-Tests |
| Projektraum-Tab, Herkunfts-Anzeige, „inaktiv"-Badge, Hinzufügen/Entfernen | ✅ PASS | `project-skills-page.tsx` |
| Entfernen einer `auto_*`-Zuordnung wird als Übersteuerung auditiert | ✅ PASS | Pentest-Vektor G (`manual_override=true`) |
| ~~Re-Resolution bei Methoden-/Typ-Wechsel~~ → additiver Abgleich | ✅ PASS (umgeschrieben) | Live widerlegt, s. Tech Design D1 |
| Audit-Ereignisse `assigned` / `removed` | ✅ PASS | Pentest A2 + G; explizit in den RPCs |
| Multi-Tenant / RLS | ✅ PASS | Pentest E, I, K |

### Live-Sicherheitstests (alle gegen Prod, rolled back, **0 Residue** verifiziert)

`tests/sql/PROJ-78-project-skills-pentest.sql` — **14/14 PASS**:
A/A2 Happy-Path + 3 Audit-Zeilen · B Idempotenz (0/3, Audit unverändert) ·
C `manual_pm` überlebt auto-Replay · D **Viewer-Zuordnung geblockt (42501)** ·
E **Cross-Tenant-Skill geblockt (42501)** · F inaktiver Skill geblockt (22023) ·
G Entfernen + `manual_override` · **H `removed`-Audit bleibt lesbar** (der Grund
für `entity_id = project_id`) · I Nicht-Mitglied sieht 0 Zeilen und darf das
Audit nicht lesen · J **anon-EXECUTE auf beiden RPCs revoked** ·
K Tenant-Mismatch-Trigger · L/L2 Viewer-DELETE 0 rows, SELECT weiterhin erlaubt.

### Regressionen (Live gegen Prod)

| Suite | Ergebnis |
|---|---|
| PROJ-141-α1 (skill_versions-RLS) | **8/8 PASS** |
| PROJ-141-α3/α4 (activate/discard + Audit) | **11/11 PASS** |
| PROJ-77-α (Draft-Immutability) | **4/4 PASS** |
| PROJ-76 (Skill-Framework-RLS) | **10/11 verbatim** — P11 s. F-1; Gate scoped **3/3 PASS** |

### Automatisierte Gates

| Gate | Ergebnis |
|---|---|
| Vitest (voll) | **2641/2641** (339 Dateien) |
| `tsc --noEmit` | **13** = Baseline, **0 neue**, 0 in der PROJ-78-Fläche |
| `npm run build` | clean; 4 neue Routen registriert |
| `check:migration-naming` | **0 errors** |
| Supabase-Advisors | **0 ERROR** (meine 2 RPCs nur die übliche `authenticated_security_definer_function_executable`-Klasse) |
| ESLint | **0 errors** (exit 0) — nach Rebase auf main nativ ohne Shim, s. **F-3** |
| Playwright `PROJ-78-project-skills.spec.ts` | **6/6** chromium |
| Playwright Voll-Suite (chromium, warm) | Branch **353 passed / 7 failed / 11 skipped** vs. main **350 / 7 / 7** — kein PROJ-78-Regress, s. **F-4** |

### Findings

- **F-1 (Low, VORBESTEHEND):** PROJ-76-Pentest **P11** prüft eine absolute
  Skill-Anzahl im Tenant `329f…`; seit dem 2026-08-04 liegt dort ein echter,
  über die deployte UI angelegter Skill („Scrum Coach", inaktiv) → erwartet 2,
  gezählt 3. Das Gate selbst ist intakt (scoped 3/3: Admin sieht beide
  geseedeten, Member nur den aktiven, der vorbestehende inaktive bleibt für
  Member unsichtbar). Fix gehört zu PROJ-76 → **PROJ-Y-78e**.
- **F-2 (Low, VORBESTEHEND):** `tests/PROJ-135-clarifying-questions.spec.ts`
  navigierte per Klick auf einen **Stepper-Button** zum KI-Backlog-Schritt.
  Der Stepper aktiviert nur Schritte bis `furthestStep`, ein frischer Wizard
  startet bei `basics` → der Button ist disabled; „Weiter" hilft nicht, weil
  `validateStep` Name und Projekttyp verlangt, die der Test nie füllt. Nie
  aufgefallen, weil PROJ-135 mit **unausgeführtem** authentifiziertem E2E-Layer
  ausgeliefert wurde (INDEX-Deviation D-1). Upload-Hälfte als dokumentiertes
  `test.fixme` isoliert → **PROJ-Y-78f**. Die Zähl-Assertions (6→7 bzw. 7→8)
  wurden korrekt nachgezogen, ebenso in `PROJ-70-epsilon-wizard.spec.ts`.
- **F-3 (Medium, VORBESTEHEND, BLOCKER für den Roh-Gate):** `npx eslint`
  crasht **repo-weit** mit `TypeError: expand is not a function`
  (`brace-expansion@^5` in `overrides` vs. `minimatch@3.1.5`, das die
  v1-Default-Funktion erwartet). Bereits im Basis-Commit `e0337bd`;
  `package.json`/`package-lock.json` von PROJ-78 **unverändert**. Über einen
  reinen In-Memory-Preload-Shim verifiziert: **0 errors, exit 0** (`src` und
  Voll-Repo). **Erledigt 2026-08-08:** nach dem Rebase auf main (PROJ-142 /
  PROJ-Y-142a) läuft `npx eslint . --ext ts,tsx` nativ ohne Shim durch —
  **0 errors, exit 0**. Das Shim-Ergebnis ist damit bestätigt; PROJ-Y-78g
  entfällt.
- **F-4 (Info) — E2E-Vollvergleich, korrigiert 2026-08-08.**
  Die erste Fassung dieses Findings verglich Äpfel mit Birnen: eine
  **Voll-Suite** auf dem Branch (13 failed) gegen einen **7-Dateien-Teillauf**
  auf dem Basis-Commit (7 failed). Beides zusätzlich mit
  `PW_SKIP_WARM_COMPILE=1` auf teils kaltem `.next`-Cache, was
  First-Compile-Timeouts als Fehlschläge zählte. Nachgemessen mit identischem
  Aufruf, **Warm-Compile aktiv**, JSON-Reporter, `retries: 0`, `fullyParallel`:

  | Lauf | passed | failed | skipped | Summe |
  |---|---|---|---|---|
  | Branch `6a379c5` | 353 | **7** | 11 | 371 |
  | main `8824152` | 350 | **7** | 7 | 364 |

  Die Differenz von 7 Tests ist vollständig erklärt: 6 neue
  PROJ-78-Auth-Gate-Tests + 1 Test, der durch das Aufsplitten von
  PROJ-135 AC-135.3 (Zähl-Assertion + `test.fixme`-Upload-Hälfte) entsteht.

  **Identisch in beiden Läufen (6, vorbestehend):** PROJ-137 ×4
  (`class3_blocked` proposal-from-context, `class3_blocked` risk-proposals,
  AC-6 clean-backlog-ohne-Banner, CLEANUP zero-residue) — Live-AI-abhängig;
  PROJ-51 ×2 (Dashboard, Master Data root) — Snapshot-Drift, bereits als
  PROJ-88-QA F-3 dokumentiert.

  **Nur auf main (1):** `PROJ-135 :: clarifying step is absent until a kickoff
  is uploaded (AC-135.3)`. Das ist exakt der unter **F-2** beschriebene
  Defekt — sein Fehlschlag auf main ist der unabhängige Beweis, dass er
  vorbestehend ist und nicht von PROJ-78 verursacht wurde. Auf dem Branch ist
  er behoben/isoliert.

  **Nur auf dem Branch (1):** `PROJ-1-2-live-closure :: PROJ-1 domain claim
  form submits through the browser`. **Nachweislich umgebungsbedingt, nicht
  PROJ-78:** die Ursache ist ein Supabase-Auth-Kontingent —
  `{"code":"invite_failed","message":"email rate limit exceeded"}`. Der Spec
  lädt pro Lauf einen Nutzer per E-Mail ein; meine wiederholten Läufe haben
  das Kontingent aufgebraucht. Kontrollexperiment: isoliert auf main zuerst
  **3/3 bestanden**, danach — nach Aufbrauchen des Kontingents — auf dem
  Branch 2/3 bestanden und anschließend **4/4 mit exakt dieser Meldung
  fehlgeschlagen**, und auf **main ebenso 2/2 fehlgeschlagen** mit identischer
  Meldung. Der Fehlschlag folgt der Aufrufreihenfolge, nicht dem Code.

  **Netto: keine einzige durch PROJ-78 verursachte E2E-Regression**; der
  Branch behebt gegenüber main sogar einen vorbestehenden Fehlschlag.
  Residue nach allen Läufen: **0** (project_skills, Audit, Test-Skills,
  Test-Projekte, ki_runs, context_sources je 0).

### Deviations

- **D-1 (Browser-Abdeckung — alle E2E-Zahlen sind chromium-only):**
  `playwright.config.ts` registriert **genau ein** lauffähiges Projekt,
  `chromium`. `Mobile Safari` wird beim Start deaktiviert (WebKit-Host-Libs
  fehlen, `ldd` meldet ungelöste Shared Objects — PROJ-67/F2), **Firefox ist
  überhaupt nicht konfiguriert**. Es gibt in diesem Repo also keine
  Browser-Dimension, über die sich Fehlschläge verteilen könnten; die
  „Cross-Browser Chrome/Firefox/Safari"-Checkliste ist strukturell nicht
  erfüllbar.
- **D-2:** Kein authentifizierter End-to-End-Durchlauf „Wizard komplett
  ausfüllen → Projekt anlegen → Skills persistiert". Der Persistenzpfad ist
  stattdessen auf zwei Ebenen bewiesen: Finalize-Route-Tests (5 Fälle inkl.
  Best-Effort-Fehlerpfad) und der Live-RPC-Pentest. Grund: derselbe
  Wizard-Fülllauf, den F-2 als unlösbar für PROJ-135 ausweist.
- **D-3:** Beide beauftragten Subagenten (Frontend-Build, unabhängiges
  QA-Review) endeten mit abgeschnittenen Abschlussberichten. Der Code wurde
  daher von mir direkt reviewt; dabei gefunden und behoben: fehlender Import
  `emptySkillsWizardData`, ein Typ-Konflikt im Zod-Resolver, ein fehlender
  Back-Compat-Backfill im Konflikt-Reload-Pfad sowie eine von mir selbst
  eingebaute Syntaxfehler-Falle (deutsches Anführungszeichen mit
  ASCII-Endquote, hätte den Build gebrochen).

### Followups

- **PROJ-Y-78a** — echter Methodenwechsel (`migrate_project_method`-RPC)
- **PROJ-Y-78b** — Projekttyp nachträglich änderbar machen
- **PROJ-Y-78c** — Massen-Zuordnung über mehrere Projekte
- **PROJ-Y-78d** — Skill-Empfehlungen („könnte auch passen")
- **PROJ-Y-78e** — PROJ-76-Pentest P11 auf geseedete IDs einschränken (F-1)
- **PROJ-Y-78f** — PROJ-135 AC-135.3 Upload-Hälfte lauffähig machen (F-2)
- ~~PROJ-Y-78g — ESLint-Bruch durch `brace-expansion`-Override (F-3)~~ — **erledigt** durch PROJ-142/PROJ-Y-142a auf main

## Deployment
_To be added by /deploy._
