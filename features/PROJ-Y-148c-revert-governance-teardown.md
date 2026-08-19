# PROJ-Y-148c — Rückbau der nie gemergten „Variante 3" (Governance-Teardown mit Grabstein)

## Status: Approved
## Deployment Scope: —
<!-- Scope bleibt leer bis zum Merge: `general.md` erlaubt einen Wert erst bei
     `Deployed`. Aus den Belegen ist `full` die Klassifikation. -->

**Created:** 2026-08-19
**Origin:** Fund F-13 aus PROJ-Y-148a, dort bewusst nicht mitbehoben — ein Rückbau wäre eine
Migration außerhalb des Auftrags gewesen und hätte eine Entscheidung getroffen, die dem Nutzer gehört.
**Entschieden:** Rückbau (Nutzer-Entscheid für PROJ-Y-148a Variante 1 vom 2026-08-19 macht diesen
Weg gegenstandslos).

---

## Der Befund

Prod trug seit dem **2026-08-14** eine Migration, die es in `supabase/migrations/` **nie gegeben hat**:
registriert als `20260814131244`, gebaut auf dem WIP-Zweig `proj-y-148a/governance-teardown-wip`
(Commit `72cfecd`, Betreff „Entscheidung offen"). Der Zweig liegt **nur lokal** und ist nicht auf
`origin` — versehentlich mergen konnte ihn also niemand, aber angewendet war er trotzdem.

Sie tat zwei Dinge:

1. **Vier append-only-Guards** bekamen einen „Elternteil wird abgerissen"-Ausweg, gekoppelt an den
   Sitzungsschalter `app.project_teardown` (gelesen über `public._project_teardown_active()`):
   `enforce_approval_event_immutability` · `enforce_stakeholder_profile_audit_immutability` ·
   `enforce_deliverable_approval_event_immutability` · `enforce_clearance_event_immutability`.
2. **Eine RPC `public.hard_delete_project(uuid)`**: `SECURITY DEFINER`, intern nur
   `is_tenant_admin`-gegatet, **`EXECUTE` an `authenticated`**. Sie schrieb einen
   `__governance_purged`-Grabstein in `audit_log_entries`, setzte den Schalter und riss dann das
   Projekt samt Historie ab.

## Die Sicherheitseinordnung — eine Korrektur an PROJ-Y-148a

PROJ-Y-148a hielt fest: „Kein `src/`-Code ruft sie … über die Anwendung ist der Weg also unerreichbar
— **kein offenes Loch**." Diese Schlussfolgerung trägt nicht. Die Angriffsfläche einer Supabase-RPC ist
nicht, *was die Anwendung aufruft*, sondern *wer `EXECUTE` hat*: der anon key steht im Browser-Bundle,
ein angemeldeter Nutzer hat ein gültiges JWT, und `supabase.rpc()` erreicht jede Funktion mit
`authenticated`-EXECUTE. Das einzige Gate war `is_tenant_admin` — und der Produktivmandant
`IT-Couch GmbH` hat **genau ein Mitglied, und das ist Admin**.

**Live bewiesen** (zurückgerollt, Gegenprobe 0 Rückstände): unter den Claims dieses einen gewöhnlichen
Nutzers liefert `hard_delete_project` `ok: true`, die Stakeholder-Profil-Historie des Projekts geht von
**2 auf 0**, und der Grabstein wird geschrieben. Die Unveränderlichkeits-Zusagen von **PROJ-31 · 33 ·
100c · 105** galten in Prod damit nicht wörtlich, ohne dass eine Slice das dokumentiert hätte.

**Was es nicht war:** kein Cross-Tenant-Leck, keine Rechteausweitung über den eigenen Mandanten hinaus,
kein Datenabfluss. Und der Grabstein hätte die *Tatsache* der Tilgung erhalten. Der Befund ist eine
**nicht autorisierte Fähigkeit zur Tilgung von Compliance-Historie**, erreichbar für jeden
Mandanten-Admin über den öffentlichen Client — für ein Produkt, dessen PRD „100 % der formalen
Entscheidungen mit nachvollziehbarem Audit-Trail" als Erfolgsmetrik führt, ist das relevant.

## Die zweite Divergenz, mit geschlossen

`search_path` ist bei `enforce_deliverable_approval_event_immutability` (PROJ-105) und
`enforce_clearance_event_immutability` (PROJ-100c) in Prod gesetzt, in ihren **Repo-Migrationen aber
nicht**. Ein wörtliches Zurückschreiben der Repo-Form hätte diese Härtung verloren und zwei neue
Advisor-Warnungen erzeugt. Die Rückbau-Migration führt daher die kanonische Semantik (immer `raise`,
kein Ausweg) **mit** `search_path` — danach stimmen Prod und Dateien in **beiden** Punkten überein.

## Bewusst nicht angetastet

`enforce_construction_defect_event_immutability` (PROJ-45-β) trägt ebenfalls einen Ausweg, aber **ohne**
Schalter und aus einer echten Repo-Migration (`20260818104358`). Er ist dort begründet —
`construction_defects` hat keine DELETE-Policy, über die Anwendung ist der Zweig unerreichbar — und
Gegenstand des eigenen Followups **PROJ-Y-148d**. Eine fremde, gerade gelandete Slice nebenbei
umzubauen wäre genau der Fehler, den PROJ-Y-148a vermieden hat. Ein Pentest-Vektor stellt sicher, dass
der Rückbau ihn nicht mitgenommen hat.

Bemerkenswert: PROJ-45-β **erwähnt** den Schalter, nur um zu begründen, warum es ihn *nicht* benutzt
(„den erzeugt KEINE Migrationsdatei … ein Aufruf würde die Migration im frisch aus den Dateien gebauten
Schema-Drift-Wächter brechen"). Diese Notiz war der Beleg, dass der Rückbau keine Repo-Abhängigkeit
verletzt.

---

## Akzeptanzkriterien

- [x] **AC-Y148c.1** — Die vier Guards verweigern `UPDATE`/`DELETE` **ausnahmslos**; kein Zweig prüft
      noch `app.project_teardown`. Meldungstexte und SQLSTATEs sind unverändert
      (`check_violation` für `decision_approval_events`/`stakeholder_profile_audit_events`, `42501`
      für die beiden anderen) — die Vorabprüfung aus PROJ-Y-148a und die Bestands-Pentests hängen daran.
- [x] **AC-Y148c.2** — `hard_delete_project(uuid)` und `_project_teardown_active()` existieren nicht mehr.
- [x] **AC-Y148c.3** — Der Exploit ist nachweislich unmöglich: derselbe Aufruf, der vorher die Historie
      tilgte, scheitert jetzt mit `42883 undefined_function`.
- [x] **AC-Y148c.4** — Ein gesetzter `app.project_teardown` bleibt **wirkungslos** (Löschversuch → `23514`).
      Der Vektor setzt den Schalter ausdrücklich; ohne das würde er nur prüfen, dass Löschen verboten
      ist — was auch vorher galt.
- [x] **AC-Y148c.5** — **PROJ-148 ist unbeschädigt:** ein Papierkorb-Projekt ohne Governance-Historie
      bleibt löschbar. Der Rückbau darf die Gegenrichtung nicht brechen.
- [x] **AC-Y148c.6** — **PROJ-Y-148a ist unbeschädigt:** ein Projekt mit Historie scheitert weiter mit
      `23514`, die 422-Absage der Route greift unverändert.
- [x] **AC-Y148c.7** — Der legitime Teardown-Weg bleibt: die Guards stehen auf `ORIGIN`, unter
      `session_replication_role = replica` räumen sie weiter ab. Darauf stützen sich die
      Fixture-Teardowns (PROJ-100a, PROJ-Y-130h).
- [x] **AC-Y148c.8** — PROJ-45-βs Guard ist unberührt und behält seinen anders begründeten Ausweg.
- [x] **AC-Y148c.9** — Die `search_path`-Härtung der vier Guards ist erhalten; keine neue
      Advisor-Warnung.
- [x] **AC-Y148c.10** — Prod und `supabase/migrations/` stimmen für diese Objekte überein; eine frisch
      aus den Dateien gebaute Datenbank erzeugt dieselben Guards. Nachgewiesen durch den
      Schema-Drift-Wächter im PR.
- [x] **AC-Y148c.11** — Kein Rückstand in Prod: Projekt-, Papierkorb-, Ereignis- und Grabstein-Zählungen
      vor und nach allen Läufen identisch; 0 deaktivierte Trigger.

## Definition of Done

- [x] Migration in Prod **und** in `supabase/migrations/`, inhaltlich identisch, `name` = Dateiname-Stamm
      (PROJ-134).
- [x] Post-Conditions in der Migration selbst, fail-loud — sie hätte geworfen, wenn ein Guard den
      Schalter behalten, ein Trigger sich gelöst oder die fremde Slice sich verändert hätte.
- [x] Pentest als Datei im Repo, live gegen Prod ausgeführt, 0 Rückstände.
- [x] Gates: ESLint · tsc = Baseline · vitest · Build · `check:migration-naming` · `check:index-scope`.
- [x] Buchführung: Spec, `features/INDEX.md`, `features/OPEN-DEFERRED-STATUS.md` stimmen überein.

---

## Nachweise

**Migration:** `supabase/migrations/20260819100000_projy148c_revert_governance_teardown.sql`,
in Prod als `20260819100000_projy148c_revert_governance_teardown`.

**Pentest:** `tests/sql/PROJ-Y-148c-revert-governance-teardown-pentest.sql`, **12/12 PASS** gegen Prod,
**0 Rückstände**.

| Vektor | Ergebnis |
|---|---|
| A | `hard_delete_project` — 0 Vorkommen im Katalog |
| B | `_project_teardown_active` — 0 Vorkommen |
| C | Ausweg in den vier Guards — 0 Vorkommen |
| D | `search_path` auf allen vier Guards gesetzt — 4/4 |
| E | Immutability-Trigger weiter verdrahtet — 6/6 |
| F | PROJ-45-βs Guard unberührt — 1/1 |
| G | Alle vier Tabellen-Trigger auf `ORIGIN` — 0 abweichend |
| H | Exploit-Aufruf → **`42883 undefined_function`** |
| I | Löschversuch **mit gesetztem Schalter** → **`23514`** |
| J | Projekt **mit** Historie → `23514` (PROJ-Y-148a intakt) |
| K | Projekt **ohne** Historie → gelöscht (**PROJ-148 unbeschädigt**) |
| L | `session_replication_role = replica` → räumt weiter ab |

**Vor-Zustand (Exploit, zurückgerollt):** `is_admin=t`, Stakeholder-Historie **2 → 0**, Grabstein
geschrieben, `ok: true`.
**Gegenprobe nach allen Läufen:** 52 Projekte · 23 im Papierkorb · 47 + 10 Ereigniszeilen ·
**0** Grabsteine · **0** deaktivierte Trigger — identisch zum Ausgangsstand.

## Abweichungen

- **D-Y148c.1** — Die vier Guards wurden **vollständig neu geschrieben** statt per Anker-Ersetzung
  gepatcht. Die Hausnorm („replace from live, never retype") schützt Funktionen mit über Slices
  **akkumulierten Zweigen** (`can_read_audit_entry`, `_tracked_audit_columns`); diese vier sind
  Vier-Zeiler mit genau einem `raise` und ohne Fremd-Bestand. Volles Neuschreiben schließt hier zugleich
  die `search_path`-Divergenz, die eine Anker-Ersetzung offen gelassen hätte.
- **D-Y148c.2** — Die Migration setzt **kein** eigenes `begin;`/`commit;`. Nachgezählt: **0 von 218**
  Bestandsmigrationen tun das, `apply_migration` wickelt selbst. Die erste Fassung hatte es und wäre
  die einzige Ausnahme im Repo gewesen.
- **D-Y148c.3** — Der WIP-Zweig `proj-y-148a/governance-teardown-wip` wird **nicht gelöscht**: er ist
  der Beleg für den Befund und liegt nur lokal, nicht auf `origin`. Ein Löschen fremder Arbeit ist
  nicht Teil dieses Auftrags.
- **D-Y148c.4** — Kein CIA-Pass. Der Rückbau vollzieht eine bereits getroffene Nutzer-Entscheidung
  (Variante 1) und **entfernt** eine Fähigkeit; er trifft keine neue Architekturentscheidung. Für die
  Gegenrichtung — den Grabstein-Weg nachträglich zu beschließen — wäre ein CIA-Pass Pflicht gewesen.

## Was offen bleibt

- **PROJ-Y-148d** — PROJ-45-βs Mängel-Guard weicht ungegated aus.
- **PROJ-Y-148b** — DSGVO Art. 17 auf `payload` der Governance-Inseln, CIA-pflichtig.
- **Kein Wächter gegen die Wiederholung.** Diese Slice räumt einen Einzelfall auf; sie verhindert nicht,
  dass eine künftige Session erneut eine Migration in Prod anwendet, die nie ins Repo kommt. Der
  Schema-Drift-Wächter vergleicht nur `SELECT`-Spalten, nicht Funktionskörper oder Grants — PROJ-Y-130f
  hat dieselbe Klasse Lücke aus anderer Richtung beschrieben. Ein Wächter, der Prod-Funktionsdefinitionen
  gegen den Datei-Replay vergleicht, wäre die eigentliche Vorbeugung; das ist eine eigene Slice.
