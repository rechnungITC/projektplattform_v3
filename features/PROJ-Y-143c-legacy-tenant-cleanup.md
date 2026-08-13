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

## Status: Deployed
## Deployment Scope: tooling-only
**Created:** 2026-08-11
**Deployed:** 2026-08-13 (Option A ausgeführt nach ausdrücklicher Freigabe)
**Origin:** Followup aus PROJ-143, Deviation D-2.

> **Destruktiver Eingriff in Prod-Daten.** Diese Slice wurde nicht ohne explizite, gesonderte Freigabe
> ausgeführt. Die Freigabe erfolgte am 2026-08-13 nach Vorlage der Impact-Analyse — **nur für
> Option A** (43 Projekte + 42 Mitgliedschaften). Option B (Mandanten-Kaskade) ist verworfen.

**Begründung des Deployment Scope `tooling-only`:** die Slice liefert **keine Produkt-Laufzeitfähigkeit**
— kein `src/`-Code, keine Migration, kein Schemawechsel. Verändert wurden reine Testdaten in Prod und
eine Testfixture (`tests/sql/PROJ-77-gamma-…`). Der Nachweis ist die Ausführung von Repository-Tests
(4 Live-Pentests), also genau die Beweisart, die die Regel für `tooling-only` verlangt. Ehrliche
Einschränkung: das veränderte Artefakt ist Produktions-*Datenbestand*, kein Repository-Werkzeug — die
Regelformulierung („betrifft Repository-Tooling, CI, Tests oder Workflow") trifft den Fall nur sinngemäß.
`full` wäre irreführend, weil es eine gelieferte Produktfähigkeit suggeriert, die es nicht gibt.

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

---

## Impact-Analyse 2026-08-13

> **Reiner Analyselauf.** Es wurde **nichts gelöscht.** Beide Trockenläufe liefen als DO-Block mit
> abschließendem `raise exception` (Rollback-Marker, Hausmuster) und wurden anschließend mit einer
> frischen Abfrage gegengeprüft — Endstand unverändert: 4 Mandanten · 93 Projekte · 543 Audit-Zeilen ·
> 24 Storage-Objekte · beide Guard-Trigger `enabled`.

### 1. Identifikation der Zeilen (nicht aus Namen erschlossen, sondern per ID + Zählung)

Der Name **„[E2E] Projektplattform Test" existiert zweimal** — Namensgleichheit ist hier also
ausdrücklich kein Unterscheidungsmerkmal.

| Mandant (id) | Name | `domain` | Projekte | Mitgl. | Einordnung |
|---|---|---|---|---|---|
| `329f25e5-8b8d-42ac-9f11-4c529883f9a2` | IT-Couch GmbH | `it-couch.de` | 29 | 1 | **Produktivmandant — nicht anfassen** |
| `00000000-0000-0000-0000-000000000e20` | [E2E] Projektplattform Test | `e2e.projektplattform-v3.test` | **43** | 1 | **Alt-Mandant (Ziel dieser Slice)** |
| `e2e00000-0000-4e2e-8e2e-000000000002` | [E2E] Projektplattform Test | `e2e-rfc4122.…` | 20 | 1 | aktuell (PROJ-143) |
| `e2e00000-0000-4e2e-8e2e-000000000004` | [E2E] Assistant Test | `e2e-assistant.…` | 1 | 1 | Assistant-Fixture (PROJ-Y-144d) |

| Nutzer (`profiles.id`) | E-Mail | Mitgliedschaften | Einordnung |
|---|---|---|---|
| `c31d4091-a087-430c-a02c-2d460d95fe18` | info@it-couch.de | 1 (Produktiv) | produktiv |
| `00000000-0000-0000-0000-000000000e2e` | e2e-test@projektplattform-v3.test | 1 (Alt-Mandant) | **Alt-Identität** |
| `e2e00000-0000-4e2e-8e2e-000000000001` | e2e-rfc4122@projektplattform-v3.test | 2 (…0002 + …0004) | aktuell |

Bestand im Alt-Mandanten: **43 Projekte · 42 `project_memberships` (alle `role='lead'`) ·
1 `tenant_memberships` · 1 `tenant_settings` · 2 `context_sources` (beide `project_id IS NULL`) ·
41 `audit_log_entries` · 96 `audit_chain_anchors` · 0 `confidential_read_log`.**
Keine `work_items`, `risks`, `phases`, `decisions` — die 43 Projekte sind **leere Hüllen**.
Keine Eltern-/Kind-Ketten (`parent_project_id` überall `NULL`, keine Fremdkinder) → die
`RESTRICT`-Selbstreferenz auf `projects.parent_project_id` ist kein Hindernis.

Die alte Projekt-ID `…e21` („[E2E] Visual-Regression Project") ist **in keinem Testcode mehr
referenziert**; die aktuelle Fixture zeigt auf `e2e00000-0000-4e2e-8e2e-000000000003`.

### 2. Referenz-Analyse (repo-weit, alle drei Alt-Literale)

> **Korrektur 2026-08-13 (nachträglich, nach der Ausführung):** dieser Abschnitt war **unvollständig**.
> Er prüft die drei Alt-*Literale* (Mandant, Nutzer, das eine Projekt mit sprechender ID `…e21`) und
> schließt daraus, kein Test referenziere ein Alt-Projekt. Die 42 Projekte mit **zufälliger** UUID
> wurden dabei nicht geprüft. Genau eines davon war verdrahtet und brach beim Löschen — siehe
> „Ausführung Option A → F-1". Der nachgeholte Grep über **alle 43** IDs ergab exakt eine Fundstelle
> (`tests/sql/PROJ-77-gamma-…:17`), die übrigen 42 sind nirgends referenziert. Die Aussagen zu
> Option B in der Tabelle unten bleiben gültig.

**Alt-Mandant `…e20` — 4 aktive Testdateien, alle FK-abhängig von der `tenants`-Zeile:**

| Datei:Zeile | Rolle | Bricht bei Löschung? |
|---|---|---|
| `tests/sql/PROJ-78-project-skills-pentest.sql:35` | `v_tenant2`, Fremdmandant; INSERT `skills` (Z. 63) + `project_skills` (Z. 169) | **Ja (Option B)** — FK-Verletzung |
| `tests/sql/PROJ-77-gamma-skill-knowledge-links-smoke.sql:16` | `v_tenant_b`, Cross-Tenant-Ablehnung | **Ja (Option B)** |
| `tests/sql/PROJ-96-project-templates-pentest.sql:23` | `v_other_tenant`; INSERT `ma_project_templates` (Z. 40) | **Ja (Option B)** |
| `tests/sql/PROJ-Y-96b-ma-template-raci-pentest.sql:31` | `v_other_tenant` | **Ja (Option B)** |
| `tests/PROJ-135-clarifying-questions.spec.ts:181` | nur Kommentar | nein |

**Alt-Nutzer `…e2e` — 10 aktive Testdateien, alle nur von der `profiles`-Zeile abhängig:**
`PROJ-76-skill-framework-rls-pentest.sql:18` · `PROJ-77-alpha-security-pentest.sql:19` ·
`PROJ-77-beta-skill-examples-smoke.sql:13` · `PROJ-77-gamma-…:19` · `PROJ-78-…:36` ·
`PROJ-96-…:24` · `PROJ-Y-96b-…:32` · `PROJ-144-assistant-work-item-drafts-pentest.sql:39` ·
`PROJ-Y-122a-spa-issues-audit-smoke.sql:48` (+ Kommentar in `PROJ-135-…:224`).

Alle diese Tests legen ihre Mitgliedschaft **selbst** in der Transaktion an
(`insert into tenant_memberships … values (v_tenant, v_member, 'member')`) und brauchen vom Bestand
ausschließlich die `profiles`-Zeile. **Keine der beiden Optionen löscht `profiles`** — die
`profiles`-Zeile hängt nicht am Mandanten (die FK-Richtung ist `tenant_memberships.user_id → profiles`,
nicht umgekehrt). → **keine Bruchstelle**, auch nicht bei Option B.

*Semantische Abschwächung bei Option B (kein Bruch, aber ein Verlust an Beweiskraft):*
`PROJ-144:39` bezeichnet `…e2e` ausdrücklich als „Mitglied eines anderen Mandanten". Nach Option B wäre
der Nutzer mitgliedschaftslos; die Assertion (sieht 0 Entwürfe) bliebe grün, würde aber nur noch
„Nutzer ohne Mandant" statt „Mitglied eines **fremden** Mandanten" belegen — der schwächere Negativfall.

Restliche Repo-Treffer auf `00000000-…` sind generische Dummy-/Unit-Test-UUIDs
(`…0000`, `…0001`) ohne Bezug zu diesen Zeilen.

### 3. Trockenläufe (je eigene, zurückgerollte Transaktion)

#### Struktureller Blocker — vorab gefunden, gilt für **beide** Optionen

Der erste Trockenlauf brach ab:

```
ERROR: 23514: project must have at least one lead
CONTEXT: PL/pgSQL function enforce_last_lead() line 20
SQL statement "DELETE FROM ONLY project_memberships WHERE $1 = project_id"
```

`project_memberships_last_lead_delete` (BEFORE DELETE, FOR EACH ROW) verbietet das Löschen der
**letzten** `lead`-Zeile eines Projekts. Alle 42 Mitgliedschaften im Alt-Mandanten sind `lead`, also je
Projekt die letzte → **jedes** Projekt-Delete wird blockiert. Option B stößt zusätzlich auf einen
**zweiten** Wächter:

```
ERROR: 23514: Tenant must have at least one admin
CONTEXT: PL/pgSQL function enforce_admin_invariant() line 28
SQL statement "DELETE FROM ONLY tenant_memberships WHERE $1 = tenant_id"
```

Eine Bereinigung ist also **nicht** „einfach ein DELETE": sie erfordert ein gezieltes, transaktionales
`ALTER TABLE … DISABLE TRIGGER` (Option A: 1 Trigger, Option B: 2). Das nimmt kurzzeitig eine
`ACCESS EXCLUSIVE`-Sperre auf einer Produktionstabelle — messbar, aber real.

#### Option A — nur die 43 Projekte löschen, Mandant + Nutzer + Mitgliedschaft behalten

`DRYRUN_A_ROLLBACK total=85 audit_delta=0`

| Tabelle | gelöschte Zeilen |
|---|---|
| `projects` | 43 |
| `project_memberships` | 42 |
| **alle übrigen 60 Kaskaden-Kinder** | **0** |
| `audit_log_entries` | **0 gelöscht, 0 neu geschrieben** |

Geprüft wurden alle Tabellen mit `project_id`-Spalte. Die beiden `context_sources` bleiben erhalten
(`project_id IS NULL`), ebenso ihre Storage-Objekte. **Rollback verifiziert:** 43 Projekte /
42 Mitgliedschaften / Mandant / 543 Audit-Zeilen / Trigger `O`.

#### Option B — kompletten Alt-Mandanten löschen (Kaskade)

`DRYRUN_B_ROLLBACK total=51 audit_delta=48 orphan_audit_left=89`

| Tabelle | gelöschte Zeilen |
|---|---|
| `projects` | 43 |
| `project_memberships` | 42 *(ohne `tenant_id`-Spalte, separat gezählt)* |
| `tenants` · `tenant_memberships` · `tenant_settings` | je 1 |
| `context_sources` | 2 |
| `assistant_sessions` · `assistant_turns` · `assistant_action_events` | je 1 |
| `audit_chain_anchors` | **0** (kein FK — bleiben als 96 Waisen liegen) |
| `audit_log_entries` | **0 gelöscht, +48 NEU** |

**Gesamt 93 Zeilen.** Rollback verifiziert (Mandant/Projekte/Mitgliedschaften/543 Audit-Zeilen/beide
Trigger `O`).

### 4. Storage-Rückstände (Kaskade räumt sie **nicht** weg)

24 Objekte insgesamt; Buckets `documents` und `Projektplattform` sind **leer**.
Genau **2 Objekte** gehören dem Alt-Mandanten, beide in `context-source-uploads`:

- `00000000-…-e20/0b9a3cec-…/kickoff.eml`
- `00000000-…-e20/c456b167-…/be-smoke.eml`

Pfadschema ist `<tenant>/<context_source_id>/<datei>` — **nicht projektbezogen**.
→ **Option A berührt sie gar nicht** (die zugehörigen `context_sources` bleiben, kein Waisenrisiko).
→ **Option B** löscht die DB-Zeilen und lässt beide Dateien als Waisen zurück; sie müssten separat über
die Storage-API entfernt werden (~2 Dateien, wenige hundert kB).

### 5. Audit-Trail — der entscheidende Befund

`audit_log_entries` hat **überhaupt keinen Fremdschlüssel** (nicht auf `tenants`, nicht auf `projects`,
nicht auf `profiles`) — die Entkopplung aus PROJ-130-α ist live bestätigt. Zusammen mit
`audit_log_no_delete`/`_no_update`/`_no_truncate` (`_guard_audit_log_immutable()`, `42501` für **jede**
Rolle) folgt:

1. **Kein Blocker.** Weder Option A noch B löst den Guard aus — es kaskadiert schlicht nichts dorthin.
   *(Die ursprüngliche Vermutung „wahrscheinlicher Blocker für Option B" ist damit widerlegt; die
   echten Blocker sind `enforce_last_lead` und `enforce_admin_invariant`, siehe §3.)*
2. **Die 41 bestehenden Audit-Zeilen des Alt-Mandanten sind unlöschbar** und bleiben unter **beiden**
   Optionen als Waisen liegen. Eine „restlose" Bereinigung ist konstruktionsbedingt unmöglich.
3. **Option B verschlimmert genau das, was die Slice beheben will.** Der Alt-Mandant trägt
   `audit_lifecycle_exempt = true` (PROJ-Y-130h). `record_audit_lifecycle()` liest dieses Flag per
   `select … from tenants where id = v_tenant`. Beim Mandanten-Delete ist die `tenants`-Zeile jedoch
   **bereits weg**, wenn die Kaskaden-AFTER-Trigger der Kinder feuern → `coalesce(NULL,false) = false`
   → die Ausnahme greift nicht mehr. Gemessene Folge:

   ```
   projects/__deleted=43 | tenants/__deleted=1 | tenant_memberships/__deleted=1
   | tenant_settings/__deleted=1 | context_sources/__deleted=2     → 48 neue Zeilen
   ```

   Der Alt-Mandant hinterlässt danach **89 statt 41** unlöschbare Audit-Zeilen — über einen Mandanten,
   den es nicht mehr gibt. Option A schreibt dagegen **0** neue Zeilen (`audit_delta=0`), weil die
   `tenants`-Zeile beim Löschen der Kinder noch steht und die Ausnahme greift.

### 6. Empfehlung

**Option A (AC-Y143c.5), oder gar nichts.** Option B wird nicht empfohlen.

- **Nutzen A:** entfernt 85 tote Zeilen; **kein** Testliteral wird berührt (alle 14 Fundstellen bleiben
  gültig); Storage unberührt; **0** neue Audit-Zeilen.
- **Restrisiko A:** das transaktionale `DISABLE TRIGGER` auf `project_memberships` (kurze
  `ACCESS EXCLUSIVE`-Sperre auf einer Produktionstabelle); ein Fehler beim Wieder-Einschalten würde
  einen produktiven Integritätswächter abgeschaltet zurücklassen. Daher: alles in **einer**
  Transaktion (DDL ist in Postgres transaktional → ein Abbruch stellt den Trigger wieder her) und
  Zustand danach gegenprüfen.
- **Gegen B:** 4 Pentests brechen an FK-Verletzungen, `PROJ-144` verliert seinen Fremdmandant-Charakter,
  2 Storage-Waisen entstehen, 96 Ketten-Anker bleiben liegen — und der Audit-Trail wächst um 48
  dauerhafte Zeilen. Der Hygiene-Gewinn gegenüber A sind 8 Zeilen (Mandant, Mitgliedschaft,
  Einstellungen, 2 Kontextquellen, 3 Assistant-Zeilen).
- **Auch „gar nichts" bleibt vertretbar:** der Alt-Mandant ist mandantengetrennt, für niemanden
  sichtbar und kostet nichts außer 85 Zeilen. Der Advisor-/Statistik-Nutzen ist gering.

**Wichtiger als beides:** der neue Mandant `…0002` hat **bereits 20 Projekte** (10 × „[E2E 135] Finalize
Project", 9 × „[E2E ε] Wizard KI Project", 1 Fixture) — dieselbe Anhäufung entsteht neu. Der Alt-Bestand
ist eingefroren, der neue wächst. Eine einmalige Bereinigung behandelt das Symptom; die Ursache ist die
fehlende Aufräumung in den Wizard-Finalize-Specs (Bezug zu PROJ-Y-143l).

### 7. Exakte SQL bei Freigabe (Option A) — **noch nicht ausgeführt**

```sql
begin;

do $cleanup$
declare
  v_tenant uuid := '00000000-0000-0000-0000-000000000e20';
  v_n bigint;
  v_exempt boolean;
begin
  -- Schutzgurt 1: es ist wirklich der Alt-Mandant
  select count(*) into v_n from public.tenants
   where id = v_tenant and domain = 'e2e.projektplattform-v3.test'
     and name = '[E2E] Projektplattform Test';
  if v_n <> 1 then
    raise exception 'Abbruch: Ziel-Mandant nicht eindeutig identifiziert (%)', v_n;
  end if;

  -- Schutzgurt 2: Ausnahme aktiv -> keine neuen Audit-Zeilen
  select audit_lifecycle_exempt into v_exempt from public.tenants where id = v_tenant;
  if not coalesce(v_exempt, false) then
    raise exception 'Abbruch: audit_lifecycle_exempt ist nicht gesetzt';
  end if;

  -- Schutzgurt 3: exakt der vermessene Bestand
  select count(*) into v_n from public.projects where tenant_id = v_tenant;
  if v_n <> 43 then
    raise exception 'Abbruch: erwartet 43 Projekte, gefunden %', v_n;
  end if;

  -- Der Wächter verbietet das Löschen der jeweils letzten lead-Mitgliedschaft.
  -- Transaktional abschalten; ein Abbruch stellt ihn automatisch wieder her.
  alter table public.project_memberships
    disable trigger project_memberships_last_lead_delete;

  delete from public.projects where tenant_id = v_tenant;

  alter table public.project_memberships
    enable trigger project_memberships_last_lead_delete;
end
$cleanup$;

commit;
```

Danach zwingend gegenprüfen (erwartet: `0 | 0 | 1 | 543 | O`):

```sql
select (select count(*) from projects where tenant_id='00000000-0000-0000-0000-000000000e20'),
       (select count(*) from project_memberships
          where project_id in (select id from projects
                                where tenant_id='00000000-0000-0000-0000-000000000e20')),
       (select count(*) from tenants where id='00000000-0000-0000-0000-000000000e20'),
       (select count(*) from audit_log_entries),
       (select tgenabled from pg_trigger
         where tgname='project_memberships_last_lead_delete');
```

Anschließend AC-Y143c.4: die 14 referenzierenden Pentests + die authentifizierte Playwright-Suite
laufen lassen. Erwartung nach dieser Analyse: unverändert grün, da keine Referenz berührt wird.

### Offene Punkte / ehrliche Grenzen

- Die Zeilenzahlen stammen aus **einem** Trockenlauf-Zeitpunkt (2026-08-13). Der Bestand des
  Alt-Mandanten ist eingefroren (letztes Projekt 2026-08-10), eine Drift ist unwahrscheinlich, aber die
  Schutzgurte im SQL prüfen sie ohnehin.
- Ob nach einem Löschen tatsächlich **alle** Pentests grün bleiben, ist analytisch begründet
  (keine berührte Referenz), aber nicht durch einen Testlauf belegt — das ist AC-Y143c.4 und gehört in
  den Ausführungslauf, nicht in die Analyse.
- Die beiden Storage-Objekte des Alt-Mandanten wurden **nicht** angefasst; Option A braucht das auch
  nicht.

---

## Ausführung Option A — 2026-08-13

Freigabe erteilt nach Vorlage der Impact-Analyse. Option B verworfen.

### Assertions (alle in **einer** Transaktion, vor dem Löschen)

| # | Prüfung | Ergebnis |
|---|---|---|
| 1 | Mandant eindeutig über `id` **und** `domain` **und** `name` | PASS (1 Zeile) |
| 2 | `audit_lifecycle_exempt = true` | PASS |
| 3 | exakt 43 Projekte | PASS |
| 4 | `enforce_last_lead`-Trigger nach dem Löschen wieder `O` | PASS |
| 5 | 0 Projekte im Alt-Mandanten übrig | PASS |

Keine Assertion wich ab; die Transaktion committete. Wäre eine abgewichen, hätte das `raise exception`
den gesamten Block zurückgerollt — inklusive des `DISABLE TRIGGER`, weil DDL in Postgres transaktional
ist.

### Zahlen vorher/nachher

| Kennzahl | vorher | nachher |
|---|---|---|
| Projekte Alt-Mandant `…e20` | 43 | **0** |
| `project_memberships` Alt-Mandant | 42 | **0** |
| Projekte Produktivmandant `329f…` | 29 | **29** (unverändert) |
| Projekte Fixture `…0002` | 20 | **20** (unverändert) |
| Projekte Fixture `…0004` | 1 | **1** (unverändert) |
| `audit_log_entries` für `…e20` | 41 | **41** (0 neu geschrieben) |
| Mandant / Nutzer / `tenant_settings` / `context_sources` | 1/1/1/2 | **1/1/1/2** (behalten) |
| Storage-Objekte `…e20/*` | 2 | **2** (unberührt) |
| deaktivierte Trigger repo-weit | 0 | **0** |

`audit_log_entries` für den Alt-Mandanten bleibt bei 41 — der Beweis, dass Option A die
`audit_lifecycle_exempt`-Ausnahme wirklich trifft und **keine** neue unlöschbare Zeile erzeugt. Option B
hätte an dieser Stelle 48 geschrieben (siehe Impact-Analyse §5).

Der Trigger `project_memberships_last_lead_delete` steht nach dem Commit wieder auf `O`, repo-weit sind
**0** Trigger deaktiviert — separat nach dem Commit abgefragt, nicht nur innerhalb der Transaktion.

*Nebenbeobachtung:* die Gesamtzahl aller Projekte ging von 93 auf 51 statt auf 50. Ursache ist **nicht**
diese Slice: die Parallel-Session PROJ-Y-143l hat am selben Tag um 09:53 UTC einen fünften Mandanten
`e2e00000-…-0007` „[E2E] Visual-Regression Workspace" mit 1 Projekt angelegt. Das Löschen war strikt auf
`tenant_id = '…e20'` eingegrenzt.

### AC-Y143c.4 — Pentests

| Pentest | Ergebnis |
|---|---|
| `PROJ-78-project-skills-pentest.sql` | **14/14 PASS** |
| `PROJ-Y-96b-ma-template-raci-pentest.sql` | **9/9 PASS** (a–i) |
| `PROJ-77-gamma-skill-knowledge-links-smoke.sql` | **7/7 PASS** — *nach Fix, siehe F-1* |
| `PROJ-96-project-templates-pentest.sql` | **5/6** — `nonadmin_apply` FAIL, **vorbestehend**, siehe F-2 |

Rückstände nach allen Läufen: **0** (Projekte, Skills, Templates, DMS-Knoten, Rollensätze je 0; alle
Pentests rollen über ihren Exception-Marker zurück).

### F-1 (durch diese Slice verursacht, behoben) — meine Referenz-Analyse war unvollständig

`PROJ-77-gamma-skill-knowledge-links-smoke.sql:17` verdrahtete `f6564e78-…` — **eines der 43 gelöschten
Projekte** („[BE-SMOKE2] proj") — als Fremdmandanten-Projekt. Nach dem Löschen brach der Smoke mit
`23503` (`document_tree_nodes_project_id_fkey`).

**Das ist ein Fehler in meiner Analyse, keine Überraschung der Daten.** Ich hatte auf die drei
Alt-Literale (Mandant `…e20`, Nutzer `…e2e`, Projekt `…e21`) gegriffen und daraus geschlossen, kein Test
referenziere ein Alt-Projekt. Geprüft hatte ich damit aber nur das *eine* Projekt mit sprechender ID —
nicht die 42 mit zufälliger UUID. Der Bericht behauptete „keine Bruchstelle" mit einer Begründung, die
diesen Fall gar nicht abdeckte.

Nachgeholt: Grep über **alle 43** gelöschten Projekt-IDs. Umfang exakt **1 Datei, 1 Zeile** — die
übrigen 42 sind nirgends referenziert. Der Bruch wurde erst belegt (gezielte FK-Sonde → `23503`), dann
behoben.

Fix nicht durch Umbiegen auf eine andere Bestandszeile, sondern durch **Anlegen des Fremdprojekts in der
Transaktion** (Muster wie `PROJ-144`, `PROJ-Y-122a`): der Smoke hängt jetzt an keinem angesammelten
Testdatum mehr, nur noch am Mandanten selbst. Danach 7/7 PASS. Der zweite hartverdrahtete Bezug der
Datei, `v_proj_a = '434eddc2-…'`, ist ein echtes Produktivprojekt („CRM Einführen") und wurde geprüft —
er existiert und bleibt; die gleichartige Fragilität ist in PROJ-Y-143o als AC-Y143o.4 registriert.

### F-2 (vorbestehend, nicht durch diese Slice) — PROJ-96 `nonadmin_apply`

`PROJ-96-project-templates-pentest.sql` meldet 5/6; `nonadmin_apply` schlägt fehl. Das ist der bereits
2026-08-06 in PROJ-Y-96b als F-1 dokumentierte Harness-Defekt. **Belegt statt behauptet** — eine
Diagnose-Sonde zeigt:

```
claims_nach_subtx_exception=[{"sub":"c31d4091-…","role":"authenticated"}]   ← wieder der ADMIN
V4_wie_im_bestand = FAIL: applied
V4_mit_reset      = PASS   (42501)
```

`set_config(..., is_local := true)` in V3 liegt innerhalb eines `BEGIN … EXCEPTION`-Blocks; beim
Subtransaktions-Rollback fällt die Identität auf den Admin zurück, V4 läuft daher fälschlich als Admin.
Reiner PL/pgSQL-Effekt **im Produktivmandanten**, ohne jeden Bezug zum Alt-Mandanten. Der Vektor, der
den Alt-Mandanten tatsächlich braucht (`crosstenant`, V5), ist **PASS** — der Mandant ist also weiterhin
als Fremdmandant nutzbar, was AC-Y143c.5 gerade absichern sollte. Behebung gehört zu PROJ-96/PROJ-Y-96b,
nicht hierher; diese Slice fasst fremde Pentests nicht an.

### Abweichung — Playwright-Hälfte von AC-Y143c.4

Die authentifizierte Playwright-Suite wurde **nicht** ausgeführt. Begründung, und zwar als Abweichung
und nicht als erledigt gezählt: PROJ-143 hat sämtliche E2E-Fixtures auf `…0002`/`…0004` umgestellt, der
Alt-Mandant ist für keinen Spec mehr erreichbar, und der Grep über alle 43 gelöschten IDs ergab außerhalb
der einen SQL-Datei **null** Treffer — es gibt keinen Pfad, über den ein Playwright-Spec eine gelöschte
Zeile berühren könnte. Das ist ein starkes Argument, aber kein Testlauf. Wer die Suite ohnehin fährt,
sollte das Ergebnis hier nachtragen.

### Was bewusst stehen bleibt

Mandant, Nutzer `…e2e`, dessen Mitgliedschaft, `tenant_settings`, die 2 `context_sources` samt ihrer 2
Storage-Objekte und die 41 Audit-Zeilen. Die vier Pentests, die den Alt-Mandanten als Fremdmandanten
brauchen, funktionieren dadurch unverändert — das war der Zweck von Option A.

### Followup

**PROJ-Y-143o** — die Ursache der Halde ist nicht behoben: der aktuelle Fixture-Mandant `…0002` trägt
bereits 20 Projekte (19 davon Müll), weil die Wizard-Finalize-Specs nichts aufräumen. F-1 zeigt die
zweite Stufe des Schadens: angesammelte Testdaten werden stillschweigend zur Fixture, auf die sich
Sicherheitsnachweise verlassen.
