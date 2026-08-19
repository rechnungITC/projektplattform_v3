---
id: PROJ-Y-143n
title: "Der Modulschalter `organization` hält nur zur Hälfte, was er verspricht"
issue_type: Bug
epic_code: HYGIENE
epic_title: "Hygiene & Supply-Chain"
priority: Medium
priority_source: "Should"
labels: ["hygiene", "backend", "ux", "tenant-settings"]
dependencies: ["PROJ-17", "PROJ-62", "PROJ-63", "PROJ-Y-143f", "PROJ-Y-143k"]
roles: ["Platform"]
summary_for_jira: "[HYGIENE] Modulschalter `organization` ist nur auf dem CSV-Import wirksam"
---

# PROJ-Y-143n: der Modulschalter `organization` hält nur zur Hälfte, was er verspricht

## Status: Approved
## Deployment Scope: —
<!-- Scope stays empty until the merge: `general.md` allows a value only on
     `Deployed`. From the evidence below `full` is the classification the deploy
     run should record — all 12 applicable criteria are met with measured
     evidence and nothing is deferred out of the slice. The one item that cannot
     be closed before the merge is the second half of AC-Y143n.11 (the
     post-deploy read vector on the production tenant); the pre-deploy half is
     measured. -->
**Created:** 2026-08-18
**Origin:** Abweichung D-Y143k.3 aus PROJ-Y-143k — dort bewusst nicht mitentschieden, weil eine
Kennzeichnung im UI das fehlende Server-Tor nicht ersetzt und die Nachrüstung API-Verhalten ändert.

---

## Der Befund — und eine Korrektur an der Vorgeschichte

PROJ-Y-143k hat den Schalter als „vollständig wirkungslos" protokolliert und dabei zwei Aussagen
gemacht: **keine** der Organisations-Routen rufe `requireModuleActive`, und **keine** UI-Stelle lese
`isModuleActive(settings, "organization")`. Die zweite Aussage stimmt. Die erste stimmt **nicht**.

Gemessen (Suche über `src/` nach dem Schlüssel `"organization"` als Modul-Argument): es gibt in
Produktivcode genau **eine** Aufrufstelle, und sie ist echt —
`src/app/api/organization-imports/_helpers.ts:48-53` ruft
`requireModuleActive(supabase, tenantId, "organization", { intent })`, und **alle fünf** CSV-Import-Routen
aus PROJ-63 gehen durch diesen Helfer (`requireOrganizationImportAdmin`). Der Schalter ist also nicht
wirkungslos, sondern **halb wirksam**: er schließt den Import und lässt die Kernfläche offen.

Das ist der schlechtere von zwei Zuständen. Ein durchgehend toter Schalter wäre eine unerfüllte Zusage;
ein halber Schalter ist eine **widersprüchliche** Zusage, und der Widerspruch ist in vier von sechs
Mandanten heute live: `/stammdaten/organisation` funktioniert vollständig, während
`/stammdaten/organisation/import` einen **roten Fehlerkasten** rendert
(`src/components/organization/organization-import-page-client.tsx:134-137`, gespeist aus
`src/hooks/use-organization-imports.ts:66-68` — der Hook hat kein `unavailable`-Feld und macht aus dem
404 des Modul-Tors einen Fehler). Damit fällt dieser Fläche zugleich der Befund aus **PROJ-Y-143f** zur Last: ein
deaktiviertes Modul ist ein Zustand, kein Fehler.

### Die Schuld ist drei Monate alt und hat einen Namen

Der Befund ist keine Neuentdeckung, sondern eine **Wiederentdeckung von Bug M2-Re aus PROJ-62** (QA
2026-05, `features/PROJ-62-organization-master-data-tree-view.md:1029`):

> „API routes do not call `requireModuleActive(tenantId, 'organization', …)`. Module-Toggle is
> **declared** (key in TOGGLEABLE_MODULES + backfilled) but **not enforced** at the API layer. […]
> **Acceptable for V1 production** — the module is default-on for all current tenants; the gate is a
> soft feature-flag. Wire `requireModuleActive` in a follow-up PROJ-62-Polish slice or PROJ-55-style
> hardening."

Diese Folge-Slice wurde nie gebaut. Zugleich hat PROJ-62 den Schalter **nicht nur im Typ-Katalog**
versprochen, sondern in der Datenbank verankert — Abschnitt 10 der Migration
`supabase/migrations/20260509220000_proj62_organization_master_data.sql:478-500` heißt wörtlich
„Module-toggle: register `organization` + idempotent backfill", trägt den Schlüssel per Backfill in
**jeden** bestehenden Mandanten und setzt ihn in die Vorgabeliste von `tenant_bootstrap_settings`, mit der
**jeder neue Mandant** startet. Das dazugehörige Akzeptanzkriterium (PROJ-62, Zeile 97) lautet:

> „Modul-Toggle gilt: `organization` als TOGGLEABLE_MODULES-Key, default-on, idempotent backfilled […]
> `requireModuleActive(tenant, 'organization', { intent: 'read'|'write' })` gatet alle UI- und API-Pfade."

PROJ-63 hat für seinen Teil dasselbe als Randfall notiert (Zeile 169: „Modul `organization` deaktiviert:
403 vor Upload-Stage") — und es als einziges **umgesetzt**, das Kästchen aber nie abgehakt.

---

## Was gemessen wurde

### Die Routen und ihr Ist-Zustand

**Ohne Modul-Tor — 12 Handler in 8 Dateien** (Zeilen = Handler-Signatur bzw. das greifende Gate):

| Datei | Handler | Was heute wirklich gatet |
|---|---|---|
| `src/app/api/organization-units/route.ts` | `GET` :38 | Auth :39 · `resolveActiveTenantId` :42 · `requireTenantMember` :45 |
| `src/app/api/organization-units/route.ts` | `POST` :58 | + `requireTenantAdmin` :65 |
| `src/app/api/organization-units/[id]/route.ts` | `PATCH` :42 | Tenant **aus der Zeile** :49 · `requireTenantAdmin` :55 |
| `src/app/api/organization-units/[id]/route.ts` | `DELETE` :123 | Tenant aus der Zeile :130 · `requireTenantAdmin` :136 |
| `src/app/api/organization-units/[id]/move/route.ts` | `POST` :25 | **nur** Auth :27 — kein Tenant-/Admin-Gate; es gatet allein die RPC `move_organization_unit` :47 |
| `src/app/api/organization-units/tree/route.ts` | `GET` :46 | Auth · resolve :50 · `requireTenantMember` :53 |
| `src/app/api/organization-units/combobox/route.ts` | `GET` :33 | Auth · resolve :37 · `requireTenantMember` :40 |
| `src/app/api/locations/route.ts` | `GET` :27 | Auth · resolve :31 · `requireTenantMember` :34 |
| `src/app/api/locations/route.ts` | `POST` :47 | + `requireTenantAdmin` :54 |
| `src/app/api/locations/[id]/route.ts` | `PATCH` :31 | Tenant aus der Zeile :38 · `requireTenantAdmin` :44 |
| `src/app/api/locations/[id]/route.ts` | `DELETE` :105 | Tenant aus der Zeile :112 · `requireTenantAdmin` :118 |
| `src/app/api/organization-landscape/route.ts` | `GET` :14 | Auth · resolve :18 · `requireTenantMember` :21 |

**Mit Modul-Tor — 5 Handler in 5 Dateien**, alle über `organization-imports/_helpers.ts:48-53`:
`organization-imports/route.ts` `GET` :10 (read → 404) · `upload/route.ts` `POST` :36 (write → 403) ·
`[id]/preview/route.ts` `GET` :14 (read) · `[id]/commit/route.ts` `POST` :21 (write) ·
`[id]/rollback/route.ts` `POST` :20 (write).

**Außerhalb des Umfangs:** `src/app/api/cron/cleanup-organization-imports-preview/route.ts` — Bearer-Cron,
mandantenübergreifend, kennt keinen Aufrufer-Mandanten.

Zwei Eigenheiten, die eine Nachrüstung berühren würden und die das etablierte Muster **nicht** hat:
die vier `[id]`-Handler lösen den Mandanten aus der geladenen Zeile statt über `resolveActiveTenantId`,
und `move` hat auf Routen-Ebene überhaupt keinen Mandantenbezug.

### Der Mandanten- und Datenstand (live gegen Prod, nur lesend)

| Mandant | `organization` aktiv | `organization_units` | `locations` | `organization_imports` |
|---|---|---|---|---|
| `IT-Couch GmbH` (Produktiv) | **ja** | 3 | 1 | 0 |
| `[E2E] Projektplattform Test` (`00000000-…-0e20`, Alt) | **ja** | 0 | 0 | 0 |
| `[E2E] Projektplattform Test` (`e2e00000-…-0002`) | nein | 0 | 0 | 0 |
| `[E2E] Assistant Test` (`…-0004`) | nein | 0 | 0 | 0 |
| `[E2E] Visual-Regression Workspace` (`…-0007`) | nein | 0 | 0 | 0 |
| `[E2E] Bau Test` (`…-0009`) | nein | 0 | 0 | 0 |

Ferner **0** gesetzte Verweise auf `organization_unit_id` in `stakeholders`, `resources` und
`tenant_memberships` über **alle** Mandanten — die drei Fremdschlüssel aus PROJ-62 sind nirgends belegt.

### Der Fakt, der die Folgenabschätzung trägt

Der Audit-Trail kennt **23** Änderungen an `tenant_settings.active_modules` und darunter
**0 Entfernungen** von `organization` — nur **2 Hinzufügungen**, beide der PROJ-62-Backfill vom
2026-05-09. **Kein Mandanten-Administrator hat den Schalter jemals ausgeschaltet.** Die vier Mandanten,
in denen er fehlt, sind Test-Fixtures, deren Seed die Liste explizit schreibt (`tests/fixtures/`,
`E2E_VISUAL_ACTIVE_MODULES` u. a.) und damit die Bootstrap-Vorgabe überstimmt — der Audit-Trigger ist
UPDATE-only und sieht diesen Erst-INSERT nicht, weshalb die Zahl 0 belastbar und nicht bloß leer ist.

### Die Fläche ist vollständig in sich geschlossen

Alle vier Hooks (`use-organization-units`, `use-organization-tree`, `use-locations`,
`use-organization-landscape`) und beide Auswahlfelder (`org-unit-combobox`, `location-select`) werden
**ausschließlich** innerhalb von `src/components/organization/` verwendet; Einstieg ist genau eine Seite
(`src/app/(app)/stammdaten/organisation/page.tsx`) plus die Unterseite `…/import`. Es gibt **keinen**
Eintrag in der globalen Navigation und **keinen** Projektraum-Tab. Kein anderes Feature liest
Organisationsdaten über die API; die Lesesicht `tenant_organization_landscape`
(`20260509220000_…:451-475`) verbindet `organization_units` mit `vendors`, wird aber nur von derselben
Seite konsumiert.

### Testabdeckung

**Keine** Playwright-Spec berührt die Fläche (Suche über `tests/` nach `organisation`,
`organization-units`, `organization-imports`, `organization-landscape`: 0 Treffer). Route-Unit-Tests gibt
es genau einen: `src/app/api/organization-units/route.test.ts`. Eine Nachrüstung des Tors kostet also
nicht das Nachziehen bestehender Tests, sondern verlangt **neue** — so wie PROJ-45-α für jede der sieben
`construction`-Routen einen ausdrücklichen Tor-Test mitgeliefert hat.

---

## Das etablierte Muster für ein *wirksames* Tor

`src/lib/tenant-settings/server.ts:36-67` — `requireModuleActive` gibt `null` zurück, wenn das Modul
aktiv ist, sonst eine weiterreichbare Fehler-Antwort: **Lese-Absicht → 404** („no existence leak"),
**Schreib-Absicht → 403**. Fehlt die `tenant_settings`-Zeile, fällt das Tor **offen** zurück (:53-54).

Referenz-Aufrufstelle `src/app/api/construction-trades/route.ts:28-36`:

```
const tenantId = await resolveActiveTenantId(userId, supabase)
if (!tenantId) return apiError("forbidden", "No tenant membership.", 403)
const moduleDenial = await requireModuleActive(supabase, tenantId, "construction")
if (moduleDenial) return moduleDenial
```

Das Tor steht **vor** der Abfrage und **nach** der Mandantenauflösung, mit `{ intent: "write" }` auf
schreibenden Handlern (:59-61).

Die UI-Hälfte hat PROJ-Y-143f festgelegt: der Hook führt ein `unavailable`-Feld, die Fläche rendert
`ModuleUnavailableNotice` (neutral, Schloss, **nicht** `destructive`), Aktionen, die nur 403 erzeugen
könnten, verschwinden — und der Text benennt den Grund nur dort, wo die Aufrufstelle genau **einen**
404-Pfad hat.

Das Gegenmuster für Variante B ist `RESERVED_MODULES` (`src/types/tenant-settings.ts:53-55`) mit heute
genau einem Eintrag: `connectors`. Es trägt ein Label und wird in
`src/components/settings/tenant/modules-section.tsx:251-256` als deaktivierte Zeile („Demnächst")
gerendert.

---

## User Stories

- **ST-01 (Mandanten-Administrator):** Wenn ich den Schalter „Organisation" ausschalte, will ich, dass er
  wirkt — die ganze Fläche, nicht nur der CSV-Import. Solange er nur halb wirkt, weiß ich nach dem
  Umschalten nicht, was mein Workspace tut.
- **ST-02 (Mandanten-Administrator):** Wenn das Modul aus ist und ich die Fläche dennoch aufrufe, will ich
  „nicht aktiv" lesen und wissen, wo ich es einschalte — keinen roten Fehlerkasten, der wie ein Defekt
  aussieht.
- **ST-03 (Mandanten-Administrator):** Wenn eine Fähigkeit nicht abschaltbar sein *soll*, will ich den
  Schalter gar nicht sehen, statt einen zu bedienen, der nichts oder nur die Hälfte tut.
- **ST-04 (Projektmitglied ohne Admin-Rechte):** Ich will, dass an der Organisations-Fläche nichts
  aufweicht — wer heute nichts ändern darf, darf auch nach der Änderung nichts ändern.
- **ST-05 (Plattform-Entwickler):** Ich will, dass „Schlüssel steht in `TOGGLEABLE_MODULES`" verlässlich
  „es gibt ein Server-Tor" bedeutet, damit UI-Kennzeichnungen wie in PROJ-Y-143k ohne Einzelfallprüfung
  gebaut werden können.

---

## Acceptance Criteria

Die Kriterien sind so geschrieben, dass sie **beide** Varianten des offenen Forks abdecken; welche
Kriterien greifen, ist je Variante ausgewiesen. Über den Fork entscheidet der Nutzer, nicht diese Spec.

### Gemeinsam (gelten in jeder Variante)

- **AC-Y143n.1** — Nach der Slice gilt für **jeden** Schlüssel in `TOGGLEABLE_MODULES` genau eine der
  beiden Aussagen, nachweisbar: entweder jede zugehörige Nutzer-erreichbare Route ruft
  `requireModuleActive` mit diesem Schlüssel, oder der Schlüssel steht nicht mehr in
  `TOGGLEABLE_MODULES`. Für `organization` ist der Nachweis zu führen; für die übrigen Schlüssel ist der
  Ist-Zustand zu **erheben und zu protokollieren** (Fund, nicht Sanierung — siehe Abgrenzung).
- **AC-Y143n.2** — Der halbe Zustand ist beseitigt: es gibt keinen Mandanten-Zustand mehr, in dem
  `/stammdaten/organisation` funktioniert **und** `/stammdaten/organisation/import` zugleich verweigert
  (oder umgekehrt). Live gegen einen Testmandanten mit ausgeschaltetem Modul geprüft, in **beiden**
  Schalterstellungen.
- **AC-Y143n.3** — Kein Rechte-Regress: `requireTenantMember` / `requireTenantAdmin` und die RLS-Gates
  bleiben an **jeder** der 17 Handler-Stellen unverändert wirksam; ein Nicht-Administrator kann nach der
  Änderung nichts, was er vorher nicht konnte. Nachweis über einen Live-Vektor je Rolle (Mitglied lesend,
  Mitglied schreibend → abgewiesen, Administrator schreibend) und keine Änderung an
  `route-helpers.ts`/RLS-Policies.
- **AC-Y143n.4** — Die Aussage von PROJ-Y-143k über `organization` ist in dessen Spec und in
  `features/OPEN-DEFERRED-STATUS.md` **korrigiert**: „vollständig wirkungslos" wird zu „nur auf den
  fünf CSV-Import-Routen wirksam", mit Verweis auf `organization-imports/_helpers.ts:48-53`. Eine falsche
  Befundprosa nicht zu korrigieren, wäre dieselbe Fäule wie der Befund selbst.
- **AC-Y143n.5** — Der Zustand der Fläche in der Visual-Regression ist bewusst entschieden und, wenn er
  sich ändert, im geladenen Zustand **im Bild geprüft** neu gezogen (nicht per `--update-snapshots`, das
  unterhalb der Toleranz ein stiller No-op ist). Betroffen ist mindestens `stammdaten.png`, weil der
  Visual-Mandant das Modul aus hat.
- **AC-Y143n.6** — Der bisher unabgehakte Randfall aus PROJ-63 (Zeile 169) wird in dessen Spec als
  erfüllt markiert, mit dem Fundort des Tors; die Buchführung von PROJ-62 (M2-Re, Zeile 1029/1054) wird
  auf den in dieser Slice erreichten Stand nachgezogen.

### Nur bei Variante A (Tor nachrüsten)

- **AC-Y143n.7** — Alle **12** in der Tabelle genannten Handler rufen `requireModuleActive(…,
  "organization", …)`: Lese-Handler ohne `intent` (→ 404), schreibende mit `{ intent: "write" }` (→ 403),
  jeweils **nach** der Mandantenauflösung und **vor** der ersten Datenabfrage. Nachweis: je Handler ein
  Test, der bei ausgeschaltetem Modul den erwarteten Status liefert — nicht ein Sammeltest.
- **AC-Y143n.8** — Die beiden Sonderfälle sind ausdrücklich gelöst und begründet: die vier
  `[id]`-Handler leiten den Mandanten weiterhin aus der geladenen Zeile ab (kein zweiter
  Auflösungspfad), und `move` erhält den Mandantenbezug, den es heute nicht hat — ohne dass die RPC
  `move_organization_unit` ihre eigene Prüfung verliert.
- **AC-Y143n.9** — Bei ausgeschaltetem Modul zeigen **beide** Seiten den dritten Zustand nach
  PROJ-Y-143f: `ModuleUnavailableNotice` statt roter Fehlerkasten, keine Aktionen, die nur 403 erzeugen
  können. Der Hook `use-organization-imports` bekommt dafür das fehlende `unavailable`-Feld; die
  Wortwahl nennt den Grund nur, wo die Aufrufstelle genau einen 404-Pfad hat.
- **AC-Y143n.10** — Die Stammdaten-Kachel „Organisation" trägt jetzt `requiresModule: "organization"`
  (`src/lib/master-data/stammdaten-sections.ts`), und der Kommentarblock, der die Auslassung begründet
  hat (:16-18, :76-91 der 143k-Spec), wird auf den neuen Stand gebracht. Damit ist die
  143k-Invariante „nur mit echtem Server-Tor" ohne Ausnahme erfüllt.
- **AC-Y143n.11** — Der Produktivmandant ist **nicht** betroffen: `organization` bleibt dort aktiv, die
  drei Organisationseinheiten und der Standort bleiben erreichbar; nachgewiesen durch einen Lesevektor
  vor und nach dem Deploy. Es wird **keine** Mandanten-Einstellung durch die Slice verändert.
- **AC-Y143n.12** — Abweichung von PROJ-62 Zeile 156 („403") ist dokumentiert: die Hausnorm
  (`server.ts:60-67`, PROJ-17 ST-02) verlangt für Lese-Absicht **404**, nicht 403, damit das Tor nicht
  verrät, was es verbirgt. Die literale AC-Formulierung von PROJ-62 wird als überholt gekennzeichnet
  statt umgeschrieben.

### Nur bei Variante B (Schlüssel als reserviert kennzeichnen)

- **AC-Y143n.13** — `organization` wandert von `TOGGLEABLE_MODULES` nach `RESERVED_MODULES`
  (`src/types/tenant-settings.ts:36-55`); die Einstellungsseite rendert den Schlüssel damit nur noch als
  deaktivierte Zeile, wie `connectors` heute.
- **AC-Y143n.14** — Die fünf CSV-Import-Routen verlieren ihr Tor **nicht** stillschweigend: entweder
  bleibt es (dann ist zu benennen, dass ein reservierter Schlüssel weiterhin gatet — ein Widerspruch,
  der eigens zu begründen ist), oder es wird entfernt, und dann ist die Folge für die vier Mandanten
  mit heute geschlossenem Import ausgewiesen.
- **AC-Y143n.15** — Der aufgegebene Anspruch ist sichtbar dokumentiert: PROJ-62 AC (Zeile 97) und
  Randfall (Zeile 156) sowie PROJ-63 (Zeile 169) werden als **zurückgenommen** markiert, nicht als
  erfüllt; die Bootstrap-Vorgabe in `tenant_bootstrap_settings`
  (`20260509220000_…:499`) wird bewertet — ein reservierter Schlüssel in der Startliste jedes neuen
  Mandanten ist erklärungsbedürftig.
- **AC-Y143n.16** — Bestandsdaten bleiben unangetastet: der Schlüssel wird **nicht** aus
  `active_modules` bestehender Mandanten entfernt (Migrationen sind append-only und ein Backfill wäre ein
  zweiter, unnötiger Eingriff in Kundendaten).

---

## Definition of Done

- [ ] Der Fork ist vom Nutzer entschieden; die gewählte Variante steht mit Begründung in dieser Spec.
- [ ] Alle gemeinsamen Kriterien (.1–.6) sowie die Kriterien der gewählten Variante sind erfüllt und je
      Kriterium mit Nachweis belegt (Datei:Zeile, Testname, oder Live-Abfrage).
- [ ] Live gegen Prod geprüft, in **beiden** Schalterstellungen, in einem **Test**mandanten — nicht im
      Kundenmandanten; keine Rückstände, Gegenabfrage dokumentiert.
- [ ] Neue Tests: je betroffener Route ein Tor-Test; mindestens ein Playwright-Auth-Gate-Test für die
      bislang völlig untestete Fläche.
- [ ] Gates: ESLint 0 · tsc = Baseline / 0 neu · vitest grün · Build clean · `check:index-scope` ohne
      Fehler · bei Migration zusätzlich `check:migration-naming`.
- [ ] Visual-Regression: entweder unverändert grün, oder Baseline begründet und im Bild geprüft neu
      gezogen.
- [ ] Buchführung: `features/INDEX.md`, diese Spec und `features/OPEN-DEFERRED-STATUS.md` stimmen
      überein; die Korrektur an PROJ-Y-143k ist eingetragen.

---

## Offener Fork — die Varianten mit ihren belegten Folgen

### Vorab: eine dritte Variante gibt es hier nicht

Naheliegend wäre, das Muster aus PROJ-Y-143f als dritten Weg zu lesen („Fläche bleibt sichtbar, wird
gekennzeichnet"). Das trägt nicht: 143f behandelt die **Darstellung** eines vorhandenen Tors — sein
Ausgangspunkt war ausdrücklich, dass „der 404 korrektes Verhalten für ein deaktiviertes Modul" ist und
„die API unangetastet bleibt". Hier fehlt das Tor selbst. 143f liefert damit nicht die Alternative zu
Variante A, sondern **deren UI-Hälfte** (AC-Y143n.9). Umgekehrt hat auch Variante B einen UI-Anteil (der
Schalter verschwindet aus der Bedienfläche) — die Entscheidung liegt also nicht zwischen „Server" und
„UI", sondern zwischen **Zusage einlösen** und **Zusage zurücknehmen**.

### Variante A — Tor serverseitig nachrüsten

| | Belegte Folge |
|---|---|
| Umfang | 12 Handler in 8 Dateien; 2 Sonderfälle (`[id]`-Mandant aus der Zeile, `move` ohne Mandantenbezug) |
| Betroffene Mandanten heute | **0.** Der Audit-Trail zeigt 0 Entfernungen bei 23 Änderungen; die 4 Mandanten mit fehlendem Schlüssel sind Test-Fixtures mit **0** Organisationseinheiten, **0** Standorten, **0** Importen |
| Kundenrisiko | Der Produktivmandant hat den Schalter **an** und behält seine 3 Einheiten + 1 Standort (AC-Y143n.11). Danach ist er einen Admin-Klick von einer 404-Fläche entfernt — was der Schalter aber genau bedeutet, admin-only und umkehrbar |
| Querwirkung auf andere Features | **keine.** Alle 4 Hooks und beide Auswahlfelder liegen ausschließlich in `src/components/organization/`; 0 gesetzte `organization_unit_id`-Verweise in `stakeholders`/`resources`/`tenant_memberships` |
| Testkosten | Es gibt nichts nachzuziehen (0 Playwright-Specs, 1 Route-Unit-Test) — es sind **neue** Tests zu schreiben; das ist Gewinn, nicht Kosten |
| Nebenwirkung | `stammdaten.png` bekommt eine dritte gekennzeichnete Kachel (Visual-Mandant hat das Modul aus) |
| Was danach besser ist | Die Regel „Schlüssel in `TOGGLEABLE_MODULES` ⇒ Server-Tor" gilt ausnahmslos; PROJ-Y-143ks Auslassung entfällt; der rote Fehlerkasten auf der Import-Seite verschwindet |

### Variante B — Schlüssel nach `RESERVED_MODULES`

| | Belegte Folge |
|---|---|
| Umfang | 2 Zeilen in `src/types/tenant-settings.ts` — plus die Entscheidung über die 5 bereits gegateten Import-Routen |
| Bricht etwas | Nein — kein Routen- und kein Datenpfad ändert sich |
| Preis 1 | Ein Schlüssel, der **fünf Routen wirksam gatet**, wäre als „nicht gebaut / demnächst" gekennzeichnet. Der `connectors`-Präzedenzfall passt nicht: hinter `connectors` steht **keine** ausgelieferte Fläche, hinter `organization` stehen zwei deployte Features (PROJ-62, PROJ-63) mit 13 Routen und 2 Seiten |
| Preis 2 | Der halbe Zustand bliebe bestehen oder müsste durch **Entfernen** des einzigen funktionierenden Tors aufgelöst werden — eine Verschlechterung gegenüber heute |
| Preis 3 | Zurückgenommen würde eine Zusage, die nicht nur im Typ-Katalog steht, sondern **in der Datenbank**: die PROJ-62-Migration registriert den Schlüssel, backfillt jeden Mandanten und setzt ihn in die Startliste jedes neuen Mandanten (`…:478-500`). Nach B stünde in dieser Startliste ein reservierter Schlüssel |
| Wofür B trotzdem sprechen könnte | Wenn Organisationsdaten produktstrategisch als **Kern** gelten (wie Backlog — vgl. D-144.1: `ModuleKey` hat bewusst keinen Backlog-Schalter), dann ist Abschaltbarkeit gar nicht gewollt, und A würde eine Fähigkeit härten, die es nicht geben soll |

### Entschieden: Variante A (Nutzer-Entscheid 2026-08-19)

Der Fork ist zugunsten von **A** entschieden — das Tor wird nachgerüstet, die
Zusage also eingelöst statt zurückgenommen. Umgesetzt in dieser Slice; die
Nachweise stehen unter „Umsetzung und Nachweise" am Ende dieser Datei. Die
Kriterien .13–.16 (Variante B) sind damit **nicht anwendbar**.

### Empfehlung: Variante A

**Tragender Grund:** die Zusage steht nicht in einer Typ-Liste, die man leise umsortieren kann, sondern in
einer ausgelieferten Migration, die den Schlüssel in **jeden** Mandanten backfillt und in die Startliste
jedes künftigen Mandanten schreibt — begleitet von einem PROJ-62-Akzeptanzkriterium, das
`requireModuleActive` für „alle UI- und API-Pfade" wörtlich verlangt, und von einer QA, die das Fehlen
2026-05 als **Schuld mit Folge-Slice** verbucht hat, nicht als Verzicht. Variante B müsste diese Zusage
zurücknehmen **und** dabei das einzige funktionierende Tor der Fläche entweder abbauen oder als
Widerspruch stehen lassen.

**Der Grund, der B *nicht* trägt, obwohl er zuerst so aussieht:** „A ändert API-Verhalten für
Bestandsmandanten" — gemessen sind das **null** Mandanten. Kein Administrator hat den Schalter je
ausgeschaltet (0 von 23 Änderungen), und die vier Mandanten ohne den Schlüssel sind Test-Fixtures ohne
eine einzige Zeile Organisationsdaten. Der Zeitpunkt ist damit der billigste, den es je geben wird: die
Fläche hat 0 Fremdkonsumenten, 0 belegte Fremdschlüssel und 0 Bestandstests, die man verbiegen müsste.

**Zwei Dinge, die die Empfehlung nicht behauptet.** Erstens ist dies **kein Sicherheitsbefund** — RLS,
`requireTenantMember` und `requireTenantAdmin` greifen unabhängig, es fließt heute nichts ab; falsch ist
die *Zusage*, nicht die Absicherung. Zweitens hängt B an einer Frage, die diese Spec nicht entscheiden
darf: ob Organisationsdaten überhaupt abschaltbar sein *sollen*. Fällt diese Antwort „nein", ist B
richtig und A wäre gehärteter Unsinn. Genau deshalb wird hier nichts implementiert.

---

## Abgrenzung / Out of Scope

- **Keine Implementierung in dieser Stufe.** `/requirements` liefert die Spec; der Fork gehört dem
  Nutzer, weil Variante A das API-Verhalten für Bestandsmandanten ändert und Variante B eine
  dokumentierte Fähigkeit zurücknimmt. Keine Route, keine Migration, kein `src/`-Diff.
- **Die übrigen 11 `TOGGLEABLE_MODULES`-Schlüssel werden nur erhoben, nicht saniert** (AC-Y143n.1).
  Findet die Erhebung weitere halbe oder tote Schalter, werden sie als eigene `PROJ-Y`-Einträge
  registriert — ein Sammel-Refactoring über alle Module wäre ≥ 5 Dateien in fremden Belangen und damit
  CIA-pflichtig.
- **Der fehlende Mandanten-/Admin-Bezug in `move/route.ts`** wird nur so weit angefasst, wie das Tor es
  verlangt (AC-Y143n.8). Ob die Route darüber hinaus ein eigenes Routen-Gate braucht, obwohl die RPC
  prüft, ist eine getrennte Frage.
- **Kein Backfill an `active_modules`.** Weder Hinzufügen noch Entfernen; die Slice verändert keine
  Mandanten-Einstellung (AC-Y143n.11 / .16).
- **Die englischen Texte der Import-Seite** („Organization CSV Import",
  `organization-import-page-client.tsx:125`) sind ein PROJ-Y-143m-Rest und gehören nicht hierher.
- **`tenant_organization_landscape` und das `vendor`-Modul.** Die Lesesicht verbindet
  `organization_units` mit `vendors`; ob eine Fläche zwei Modulschalter lesen müsste, ist eine eigene
  Frage und wird hier nur benannt.
- **Kein CIA-Pflicht-Pass erwartet**, solange Variante A dem etablierten `requireModuleActive`-Muster
  folgt (spec-folgende Umsetzung, kein neues Dep, kein neues Persistenzmuster). Fällt die Entscheidung
  auf B, ist der Fall anders: das Zurücknehmen einer dokumentierten Produktfähigkeit ist eine
  produktstrategische Entscheidung im Sinne von `.claude/rules/continuous-improvement.md` Nr. 4.

---

## Dependencies

- **Requires PROJ-17** (Modul-Toggle, `requireModuleActive`, ST-02-Statuskonvention) — Deployed.
- **Requires PROJ-62** (Organisations-Stammdaten; Ursprung der Zusage und des Bugs M2-Re) — Deployed.
- **Requires PROJ-63** (CSV-Import; das einzige heute wirksame Tor) — Deployed.
- **Requires PROJ-Y-143f** (dritter Zustand, `ModuleUnavailableNotice`, Wortwahl-Regel) — Deployed.
- **Requires PROJ-Y-143k** (Kachel-Kennzeichnung; Ursprung dieses Followups, Aussage zu korrigieren) — Deployed.
- **Berührt PROJ-Y-143l** (Visual-Mandant hat das Modul aus → `stammdaten.png`) und **PROJ-51**
  (Baseline-Toleranzen).

---

## Umsetzung und Nachweise (Variante A, 2026-08-19)

### Was gebaut wurde

**Server — 12 Handler in 8 Dateien**, jeder mit `requireModuleActive(…,
"organization", …)`: 5 lesende ohne `intent` (→ **404**), 7 schreibende mit
`{ intent: "write" }` (→ **403**). Kein neuer Helfer, kein neues Muster — die
zwei Zeilen stehen so, wie PROJ-45-α sie in seinen sieben `construction`-Routen
stehen hat, und in derselben Reihenfolge wie im PROJ-63-Helfer: **Modul-Tor vor
der Rollenprüfung**.

| Datei | Handler | Absicht | Mandanten-Anker |
|---|---|---|---|
| `organization-units/route.ts` | `GET` · `POST` | read · write | `resolveActiveTenantId` |
| `organization-units/[id]/route.ts` | `PATCH` · `DELETE` | write · write | **geladene Zeile** |
| `organization-units/[id]/move/route.ts` | `POST` | write | **geladene Zeile** (neu) |
| `organization-units/tree/route.ts` | `GET` | read | `resolveActiveTenantId` |
| `organization-units/combobox/route.ts` | `GET` | read | `resolveActiveTenantId` |
| `locations/route.ts` | `GET` · `POST` | read · write | `resolveActiveTenantId` |
| `locations/[id]/route.ts` | `PATCH` · `DELETE` | write · write | **geladene Zeile** |
| `organization-landscape/route.ts` | `GET` | read | `resolveActiveTenantId` |

**Die zwei Sonderfälle, wie gefordert gelöst und begründet (AC-Y143n.8):**

1. **Die vier `[id]`-Handler** behalten die Auflösung aus der geladenen Zeile;
   das Tor sitzt direkt hinter dem Lookup. Ein zweiter Auflösungspfad wäre hier
   nicht bloß redundant, sondern **falsch**: diese Handler wirken bewusst auf
   den Mandanten der Zeile, ein Tor auf dem *aktiven* Mandanten könnte also die
   Einstellungen eines anderen Mandanten befragen als den, in den geschrieben
   wird. Das Tor kann seinem eigenen Anker damit nicht vorausgehen — was es
   garantiert und auch tut: vor ihm wird **nichts mutiert und kein
   Fachinhalt zurückgegeben** (der Vorab-Lookup liest nur Identitätsspalten, und
   eine für den Aufrufer per RLS unsichtbare Zeile hat schon vorher 404
   geantwortet). Zwei Testfälle je Handler nageln das fest: sie lassen
   Zeilen-Mandant und aktiven Mandanten **auseinanderfallen** und prüfen, welchen
   das Tor befragt hat — ein Tor auf dem aktiven Mandanten würde ein naives
   „Modul aus → 403" bestehen und dabei die falschen Einstellungen lesen.
2. **`move`** hatte auf Routen-Ebene **überhaupt keinen** Mandantenbezug; die
   `SECURITY DEFINER`-RPC war das Einzige, was gatete. Die Route lädt jetzt die
   zu verschiebende Einheit — derselbe Anker wie bei den Geschwistern, kein
   neuer. Die RPC verliert **keine** ihrer Prüfungen (sie leitet Mandant, Rolle,
   Same-Tenant-Parent, Zyklen und den Optimistic-Lock intern aus `auth.uid()`
   ab); ein Testfall prüft, dass die RPC bei geschlossenem Tor **gar nicht
   erreicht** wird, und drei weitere, dass ihre eigenen Absagen (`forbidden`,
   `version_conflict`, `cycle_detected`) bei offenem Tor unverändert
   durchkommen.

**Zwei bewusste Verhaltensänderungen an `move`**, beide dokumentiert statt
versteckt: eine per RLS unsichtbare Einheit antwortet nun **404 vor** der RPC
(die DEFINER-RPC sah die Zeile und antwortete 403) — das ist das Verhalten der
Geschwister-Handler und leakt weniger, nicht mehr; und bei geschlossenem Modul
antwortet ein fehlerhafter Body **403 statt 400**, weil das Tor vor der
Validierung läuft, wie auf jeder anderen gegateten Route.

**UI — der dritte Zustand (AC-Y143n.9).** `unavailable` in **fünf** Hooks
(`use-organization-units`, `-tree`, `-locations`, `-landscape`, `-imports`), über
`apiRequestError`/`isUnavailable` aus PROJ-Y-143f; `ModuleUnavailableNotice` auf
beiden Seiten; die Aktionen, die nur 403 erzeugen könnten, verschwinden
(CSV-Import-Knopf, Tabs, Anlegen). Der Grund darf hier überall benannt werden,
weil **jede** dieser fünf Listen-Routen genau **einen** 404-Pfad hat (401 ohne
Sitzung, 403 ohne Mandant/Rolle, 404 nur vom Modul-Tor) — die Wortwahl-Regel aus
143f ist also erfüllt und nicht bloß beachtet. `location-table.tsx` bekommt den
Zustand ebenfalls, weil es seine **eigene** `useLocations`-Instanz hält.

**Der Defekt, für den die Slice geöffnet wurde**, ist damit weg: die
CSV-Import-Seite hat seit PROJ-63 in vier von sechs Mandanten 404 geantwortet
und das als roten Fehlerkasten gezeigt. Das Tor war richtig, die Darstellung
nicht.

**Kachel (AC-Y143n.10).** `requiresModule: "organization"` in
`stammdaten-sections.ts`; der Kommentarblock, der die Auslassung begründete, ist
auf den neuen Stand gebracht. Der pinnende Test trägt jetzt vier Zeilen statt
drei — die Erwartung wurde **erweitert, nicht abgeschwächt** —, plus ein neuer
Fall, der die erste Kachel absichert, die `adminOnly` **und** modul-gegatet ist.

### Nachweise je Kriterium

| AC | Nachweis |
|---|---|
| **.1** | Erhebung über alle `requireModuleActive`-Aufrufstellen (multiline-tolerant, nicht per Zeilen-Grep): **alle 12** `TOGGLEABLE_MODULES`-Schlüssel haben mindestens eine Aufrufstelle — `ai_proposals` 21 · `budget` 18 · `vendor` 15 · `resources` 14 · `construction` 12 · `decisions` 10 · `communication` 8 · `risks` 6 · `output_rendering` 5 · `assistant` 4 · `audit_reports` 2 · **`organization` 12 (vorher 1)**. `connectors` steht in `RESERVED_MODULES`, hat also korrekt keine. **Wichtige Einschränkung, ausdrücklich protokolliert:** „≥ 1 Aufrufstelle" ist **nicht** dasselbe wie „jede Route dieses Moduls gatet" — genau diese Metrik hat `organization` drei Monate lang unauffällig gemacht (1 gegatete, 11 ungegatete Routen sehen im Grep wie Abdeckung aus). Für `organization` ist die vollständige Abdeckung hier handverfolgt und getestet; für die übrigen 11 ist der Ist-Zustand erhoben und **nicht** saniert (Abgrenzung der Spec). Eine Vollprüfung je Schlüssel wäre ein Sammel-Refactoring über fremde Belange → CIA-pflichtig, eigener Eintrag. |
| **.2** | Live gegen Prod-DB + laufenden Server, in **beiden** Schalterstellungen im Testmandanten `e2e00000-…-0002`. **Aus:** Playwright 17/17, darunter beide Seiten mit Hinweis statt Fehlerkasten und `{units:404, tree:404, combobox:404, locations:404, landscape:404, createUnit:403, createLocation:403}`. **An** (einmaliges Experiment, `active_modules` vorher `["risks","decisions","ai_proposals","audit_reports"]`): alle fünf Lesewege **200**, beide Schreibwege **400** (= im Validator, also hinter dem Tor), echter Rundlauf **Anlegen 201 → in der Liste sichtbar → Löschen 204**, beide Seiten rendern die echte Oberfläche. Danach exakt zurückgeschrieben und verifiziert (`RESTORED active_modules = ["risks","decisions","ai_proposals","audit_reports"]`). Der halbe Zustand ist damit beseitigt: in **beiden** Stellungen verhalten sich Kernfläche und Import gleich. |
| **.3** | Drei Ebenen. **(a) Struktur:** `git diff` berührt weder `src/app/api/_lib/route-helpers.ts` noch eine Policy oder Migration; die 12 `requireTenantMember`/`requireTenantAdmin`-Aufrufe stehen unverändert an derselben Stelle. **(b) Live-RLS**, `tests/sql/PROJ-Y-143n-organization-rls-no-regress.sql` gegen Prod, **6/6 PASS, 0 Rückstände** (Rollback-Marker): synthetisierter Nicht-Admin liest 3 Einheiten und 1 Standort, `INSERT` → **42501**, `UPDATE` → **0 Zeilen**, `DELETE` → **0 Zeilen**, und V6 belegt, dass die Identität wirklich kein Admin ist (ohne diesen Vektor wären die vier darüber falsch-grün — in Prod ist jede Mitgliedschaft `admin`). **(c) Unit:** je Sammel-Route ein Fall „Nicht-Admin bleibt bei offenem Modul 403 `forbidden`". Rechte-Regress ist damit gemessen, nicht aus der Diff-Größe geschlossen. |
| **.4** | `features/PROJ-Y-143k-…md` trägt einen ausdrücklichen Korrekturblock: „vollständig wirkungslos" → „nur auf den fünf CSV-Import-Routen wirksam", mit Fundort `organization-imports/_helpers.ts:48-53`, und die Tabellenzeile steht auf „⚠️ **halb**". Die Korrektur benennt auch die **Ursache des Irrtums** (die Frage „gibt es Aufrufstellen?" statt „gatet jede Route?"), weil sonst dieselbe Fehlmessung wiederkommt. `OPEN-DEFERRED-STATUS.md` trug die korrigierte Fassung bereits aus dem Requirements-Lauf; dort ist jetzt der Status nachgezogen. |
| **.5** | Genau **eine** Baseline bewegt sich: `stammdaten.png`, 1796 → **1832 px** (+36 px), 26.966 abweichende Pixel — die Kachel wird zur **dritten** gekennzeichneten, weil der Visual-Mandant das Modul aus hat. Vor der Übernahme **im Bild geprüft** (gestrichelter Rahmen, Schloss statt Chevron, gedämpfter Titel, Modul-Zeile; geladener Zustand, keine Skelette, kein Kompilier-Abzeichen) und per **Löschen der Datei** neu gezogen, nicht per `--update-snapshots`. Danach **3× 9/9** stabil; die anderen acht Baselines waren im selben Lauf grün, also kein Kollateral. Keine Toleranz angefasst. |
| **.6** | PROJ-63 Randfall (Zeile 169) abgehakt **mit Fundort** und mit dem Hinweis, dass dies drei Monate lang die einzige Aufrufstelle im Produktivcode war; PROJ-62 M2-Re in der Fund-Tabelle **und** in der Carry-over-Tabelle auf „behoben" gesetzt, samt der Feststellung, dass die dort angekündigte Polish-Slice nie gebaut wurde. PROJ-62 AC (Zeile 97) auf `[x]` mit der Trennung „Datenbank-Hälfte 2026-05 / Tor-Hälfte 2026-08". |
| **.7** | 12 Gates gezählt (2+2+1+1+1+2+2+1), davon 7 mit `{ intent: "write" }`. **28 neue Route-Unit-Fälle in 7 Dateien plus 4 in der bestehenden** — je Handler eigene Fälle, kein Sammeltest. **Rot-Grün geführt:** mit zurückgenommenen Gates fallen **25 von 53** Fällen, während die 28 Fälle für unverändertes Verhalten grün bleiben (genau die Aufteilung, die man will). |
| **.8** | Siehe „Die zwei Sonderfälle" oben; die tragenden Fälle sind `gates on the row's tenant, not on the active workspace` (4×, mit auseinanderfallenden Mandanten) und `never reaches the RPC when the gate closes`. |
| **.9** | Live im Browser (Playwright, authentifiziert, Modul aus): beide Seiten zeigen „Das Modul „Organisation" ist für diesen Workspace nicht aktiv.", und es ist **weder** der rote Kasten („Daten konnten nicht geladen werden" 0×, „Resource not found." 0×) **noch** eine Leer-Behauptung; CSV-Import-Knopf, Tree-Reiter und Upload-Reiter sind nicht vorhanden. |
| **.10** | `stammdaten-sections.ts` + Kommentarblock; `stammdaten-sections.test.ts` von 9 auf 10 Fälle, gepinnte Liste um `["/stammdaten/organisation", "organization"]` erweitert. |
| **.11** | Produktivmandant `IT-Couch GmbH` **vor und nach** allen Läufen: `organization` **ON**, **3** Organisationseinheiten, **1** Standort — unverändert. Über alle Mandanten: 3 Einheiten / 1 Standort / 0 Importe gesamt, **0** Sonden-Zeilen, **2** Mandanten mit `organization` an (identisch zur Erhebung im Requirements-Lauf). Es wurde **keine** Mandanten-Einstellung dauerhaft verändert; die einzige Änderung war der Testmandant im Experiment, zurückgeschrieben und verifiziert. Zweite Hälfte („nach dem Deploy") gehört in den Deploy-Lauf. |
| **.12** | In PROJ-62 an der Randfall-Zeile dokumentiert: 403 gilt für die sieben schreibenden Handler, die fünf lesenden antworten nach PROJ-17 ST-02 mit **404**. Die literale PROJ-62-Formulierung ist als **überholt gekennzeichnet, nicht umgeschrieben**. |
| **.13–.16** | Nicht anwendbar (Variante B verworfen). |

### Gates

ESLint **0** · tsc **13 = Baseline, 0 neu** (alle 13 in unberührten Dateien) ·
vitest **3109/3109** (393 Dateien, **+52**) · Build clean · `check:index-scope`
0 Fehler · `check:migration-naming` 0 Fehler (keine Migration in dieser Slice) ·
Playwright `PROJ-Y-143n-organization-module-gate.spec.ts` **17/17** chromium ·
Visual **3× 9/9**.

### Funde und Abweichungen

- **F-Y143n.1 (behoben, in der Slice entstanden).** Die neuen Fälle in der
  bestehenden `organization-units/route.test.ts` fielen zunächst mit einer
  irreführenden Meldung: `vi.clearAllMocks()` leert die
  `mockResolvedValueOnce`-Warteschlange **nicht**, und weil Tor-Fälle bewusst
  früh abbrechen, hinterlassen sie eine unverbrauchte Antwort, die der nächste
  Fall als seine Mandanten-Auflösung liest. Behoben mit `mockReset()` und im
  Testcode begründet. Der Bestand war nur zufällig sicher: jeder alte Fall
  verbraucht genau zwei Antworten. Genau deshalb dispatcht die neue
  `src/test/module-gate-harness.ts` auf die **abgefragte Spalte** statt auf die
  Aufrufreihenfolge — eine Kopplung, die still bricht, sobald ein Handler eine
  Abfrage gewinnt oder verliert, also bei genau dieser Art Änderung.
- **D-Y143n.1** — Ein geteilter Test-Harness (`src/test/module-gate-harness.ts`)
  statt acht kopierter Mock-Blöcke. Er mockt ausdrücklich **nicht**
  `requireModuleActive`, sondern nur die `tenant_settings`-Zeile, die es liest:
  der echte Gate-Code läuft in jedem Fall, inklusive der 404/403-Weiche und des
  **fail-open**-Zweigs bei fehlender Settings-Zeile (eigener Testfall). Ein
  weggemocktes Tor hätte den Mock getestet.
- **D-Y143n.2** — Der Beweis für **beide** Schalterstellungen ist ein
  dokumentiertes **Einzel-Experiment**, kein committeter Test. Ein Test, der die
  Modul-Einstellung eines geteilten Fixture-Mandanten umschaltet, würde die
  Specs beeinflussen, die denselben Mandanten nutzen — genau die Kopplung, die
  PROJ-Y-143l eine Slice lang beseitigt hat (dort mit derselben Begründung
  read-only gehalten). Committet ist die read-only Hälfte, und sie **prüft ihre
  eigene Voraussetzung**: der Spec liest `active_modules` per Service-Role und
  schlägt mit einem erklärenden Satz fehl, falls der Mandant das Modul doch an
  hat — sonst würde er nur belegen, dass eine funktionierende Seite keine
  Fehlerseite ist.
- **D-Y143n.3** — „Mitglied schreibend → abgewiesen" ist **live auf der
  RLS-Ebene** und in Unit-Tests belegt, **nicht** über eine echte
  Browser-Sitzung eines Nicht-Admins. Grund: in Prod ist jede Mitgliedschaft
  `admin`, und `enforce_admin_invariant` verhindert das Herabstufen des letzten
  Admins; einen zweiten Auth-Nutzer anzulegen und anzumelden wäre neue
  Fixture-Fläche für eine Aussage, die die Policies bereits messbar tragen.
- **D-Y143n.4** — Aus der Spec-Abgrenzung übernommen und **nicht** angefasst:
  `tenant_organization_landscape` verbindet `organization_units` mit `vendors`,
  also berührt die Lesesicht zwei Modulschalter. Gegatet ist hier nur
  `organization` — das Modul, dem die Route gehört. Ob eine Fläche zwei Schalter
  lesen müsste, bleibt die eigene Frage, die die Spec benannt hat.
- **D-Y143n.5** — Kein CIA-Pass. Spec-folgende Umsetzung des etablierten
  `requireModuleActive`-Musters, kein neues Dependency, kein neues
  Persistenzmuster, keine Migration — der von der Spec vorgesehene Fall.
- **Nicht in dieser Slice, unverändert offen:** die englischen Texte der
  Import-Seite („Organization CSV Import") sind ein PROJ-Y-143m-Rest; die 11
  übrigen Modulschlüssel sind erhoben, nicht saniert; ob `move` über das Tor
  hinaus ein eigenes Routen-Gate braucht, obwohl die RPC prüft, bleibt getrennt.
