---
id: PROJ-119
title: "Vertraulichkeitsgesteuerte Verteilung von Kommunikation"
issue_type: Story
epic_code: H
epic_title: "Kommunikation, Gremien & Stakeholder"
priority: Medium
priority_source: "Should"
labels: ["ma-platform", "epic-h", "should-have"]
dependencies: ["H2", "L2", "L3", "B4"]
roles: ["Deal Lead", "Communications Lead", "Executive Sponsor", "Legal Counsel"]
summary_for_jira: "[H3] Vertraulichkeitsgesteuerte Verteilung von Kommunikation"
---

# PROJ-119: Vertraulichkeitsgesteuerte Verteilung von Kommunikation

## Status: Deployed (2026-08-11)
## Deployment Scope: full

> **Scope-Klassifikation (PROJ-Y-145b, Tranche 3, 2026-08-20):** QA 2026-08-11: **4/4 AC**, 2/2 DoD, **7/7 Härtungskriterien**, 0 Critical/High/Medium/Low; Live-Pentest A–N 14/14 + Red-Team O/P/Q/S/T gegen Prod, 0 Rückstände.

**Deployed:** 2026-08-11 — Closure-Deploy nach QA PASS, Tag `v2.45.0-PROJ-119`. Code lag seit `c020ff8` (#302) auf main, alle drei Migrationen seit `/backend` in Prod → kein Runtime-Deploy nötig (Vercel deployt automatisch von main). Post-Deploy-Smoke gegen Prod: `/api/projects/{id}/communication-entries` → 307 Auth-Gate. Kein Env/Secret. QA-Verdikt und Red-Team-Supplement siehe unten.
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic H — Kommunikation, Gremien & Stakeholder)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **REUSE** · Andockpunkt: PROJ-13 + PROJ-129 Klassifikation. Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** H — Kommunikation, Gremien & Stakeholder  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should  
> **Labels:** `ma-platform` · `epic-h` · `should-have`  
> **Abhängigkeiten:** `H2`, `L2`, `L3`, `B4`

**User Story:**

Als Deal Lead möchte ich sicherstellen, dass Kommunikationsentwürfe und vorbereitete Inhalte nur den im Need-to-know-Prinzip definierten Personen sichtbar sind, damit Vertraulichkeit vor Signing und Closing gewahrt bleibt.

**Beschreibung / Kontext:**

Das Modell macht das Need-to-know-Prinzip zur Pflichtgrundlage. Kommunikationsentwürfe (z. B. ein vorbereiteter Mitarbeiter-Brief) müssen vor Signing strikt vertraulich behandelt werden. Die Plattform muss dies technisch durchsetzen.

**Akzeptanzkriterien:**

- [x] Pro Kommunikationseintrag (H2) kann eine Vertraulichkeitsstufe gesetzt werden (siehe L2), die die Sichtbarkeit auf einen festgelegten Personenkreis einschränkt.
- [x] Versuche, Inhalte herunterzuladen oder zu drucken, werden je nach Stufe protokolliert oder unterbunden.
- [x] Eine 'Inner Circle'-Markierung beschränkt Sichtbarkeit auf eine explizit benannte Personenliste, unabhängig von Workstream-Rollen.
- [x] Vor dem Statuswechsel 'freigegeben → versandt' prüft die Plattform, ob das Embargodatum erreicht ist (falls gesetzt).

**Abgrenzungen (Out of Scope):**

- Kein Digital Rights Management außerhalb der Plattform.
- Keine Wasserzeichen auf Exporten (offene Frage – siehe L2).

**Offene Fragen:**

- Sollen exportierte Dokumente Wasserzeichen mit Empfänger und Zeitstempel tragen?
- Soll der 'Inner Circle' durch den Sponsor pflichthaft bestätigt werden?

**Definition of Ready:**

- [x] Klassifikationsstufen aus L2 sind definiert.
- [x] Sicht-/Aktionsregeln je Stufe sind dokumentiert.

**Definition of Done:**

- [x] Sichtbarkeit, Embargo und Inner-Circle-Logik funktionieren.
- [x] Audit-Trail erfasst jeden Zugriff auf 'inner-circle'-Inhalte.

**Abhängigkeiten:**

- H2
- L2
- L3
- B4

**Betroffene Rollen:**

- Deal Lead
- Communications Lead
- Executive Sponsor
- Legal Counsel

---

## Tech Design (Solution Architect)

**Architected:** 2026-08-07 · **Klasse:** EXTEND auf PROJ-118 · **CIA-reviewed** (5 Forks, Verdikt „Umsetzen") · **Kein neues Dep** · **1 Migration**

### Ausgangslage (live verifiziert, nicht aus dem Gedächtnis)

PROJ-118 hat mehr geliefert, als die 119er-Spec annimmt: Kommunikationseinträge tragen **bereits** eine Vertraulichkeitsstufe und werden **bereits** durch das produktweite Need-to-know-Tor gefiltert. **AC1 ist damit im Kern schon erfüllt.** Der echte Zuwachs von PROJ-119 sind drei Dinge, die es heute nicht gibt: der *Inner Circle*, das *Embargo* und die *Zugriffsprotokollierung*.

Bei der Bestandsaufnahme sind zwei Lücken im deployten PROJ-118 aufgefallen, die vorher niemand gesehen hat. Beide sind **live in der Produktivdatenbank bestätigt** und blockieren PROJ-119, weil sie genau die Schutzwirkung aushebeln, die diese Story verspricht:

- **B1 (Schreibpfad umgeht die Vertraulichkeit).** Die Schreib-Operationen prüfen die Berechtigung gegen die Stufe „Standard" statt gegen die **tatsächlich gespeicherte** Stufe des Eintrags. Folge: Wer Projektleitung ist, aber *keine* Freigabe für „Streng vertraulich" hat, kann einen streng vertraulichen Eintrag heute trotzdem ändern, löschen und auf „versendet" setzen. Lesen kann er ihn nicht — schreiben schon. Wird in dieser Slice mitgeschlossen.
- **B2 (Inhalt wird ungeprotokolliert ausgeliefert).** Die Listenansicht liefert den Nachrichtentext **jedes** Eintrags schon beim Öffnen der Seite mit. Eine Protokollierung, die nur das Öffnen der Detailansicht erfasst, wäre damit sachlich unwahr — der Inhalt wäre längst beim Nutzer. Deshalb wird die Auslieferung geändert, nicht nur das Protokoll ergänzt.

### Die vier Bausteine

**1. Inner Circle — eine benannte Personenliste, die alles andere überstimmt (AC3)**

Ein Eintrag kann als „Inner Circle" markiert werden. Dann sehen ihn ausschließlich die namentlich hinterlegten Personen — unabhängig von Projektrolle, Workstream oder Freigabestufe. Das gilt **auch für Tenant-Administratoren**, die sonst überall Vollzugriff haben. Genau das ist der fachliche Sinn: Der Adressat des Schutzes ist oft die IT-Administration, nicht das Deal-Team.

Damit das nicht zur Falle wird, drei Sicherungen:
- Die Markierung ist **opt-in**. Ohne sie verhält sich alles exakt wie heute — Bestandsdaten und die PROJ-118-Tests bleiben unberührt.
- Wer den Kreis setzt, und die verantwortliche Person, werden **automatisch** Mitglied. Das letzte Mitglied lässt sich nicht entfernen — ein Eintrag kann nicht verwaisen.
- Als Notausgang darf ein Tenant-Administrator den Kreis **auflösen** — aber nicht heimlich mitlesen. Die Auflösung erzeugt einen Audit- **und** einen Zugriffsprotokoll-Eintrag. Ein Administrator kommt also an den Inhalt, aber nur **laut und nachweisbar**. Die Oberfläche sagt das offen.

**2. Zugriffsprotokoll — „jeder Zugriff", und zwar wörtlich (AC2 + DoD)**

Lesezugriffe lassen sich in der Datenbank nicht per Automatik mitschreiben (Leseregeln dürfen keine Nebenwirkungen haben). Das Protokoll entsteht deshalb in der Anwendungsschicht — und damit es *stimmt*, wird die Auslieferung angepasst: Für Inner-Circle-Einträge liefert die Liste **keinen Nachrichtentext** mehr, sondern nur die Information *dass* einer existiert. Den Text holt eine eigene Detail-Abfrage, und **jede** solche Abfrage schreibt genau eine Protokollzeile.

Protokolliert werden nur qualifizierte Vorgänge — Inhalt ansehen, exportieren, Druckansicht öffnen, Kreis auflösen — je mit Ergebnis (gewährt/verweigert). Das bloße Laden der Liste wird nicht protokolliert, weil sie nach der Änderung keinen geschützten Inhalt mehr transportiert. Das Protokoll ist **nur anfügbar**: es gibt keinen Weg, Einträge zu ändern oder zu löschen.

**3. Export und Druck — die ehrliche Grenze (AC2)**

Browser-Druck, Screenshot und Abschreiben sind technisch **nicht** verhinderbar. CSS, das den Druckbutton versteckt, ist Sicherheitstheater und wird bewusst **nicht** gebaut. Stattdessen eine klare, im ADR fixierte Regel:

| Stufe | Export / Druckansicht | Protokoll |
|---|---|---|
| Standard | erlaubt | nein |
| Vertraulich | erlaubt | ja (gewährt) |
| Streng vertraulich **oder** Inner Circle | **abgelehnt** | ja (verweigert) |

Damit ist „je nach Stufe protokolliert *oder* unterbunden" wörtlich erfüllt. Die Autorität liegt beim Server; dass die Schaltfläche in der Oberfläche verschwindet, ist reine Bequemlichkeit, kein Schutz. Am Eintrag steht sichtbar, dass Zugriffe protokolliert werden — das ist der real wirksame Teil (Abschreckung + Nachweisbarkeit).

**4. Embargo (AC4)**

Ein Eintrag kann einen Embargo-Zeitpunkt tragen — **mit Uhrzeit und Zeitzone**, nicht nur Datum, weil Signing-Embargos stundengenau sind. Solange er nicht erreicht ist, lässt sich der Eintrag nicht auf „versendet" setzen; der Versuch wird mit dem konkreten Zeitpunkt abgewiesen. Es gibt bewusst **keinen** „trotzdem senden"-Knopf: Der legitime Weg ist, das Embargo zu ändern — und *diese* Änderung wird feldgenau im Änderungsverlauf festgehalten, was forensisch deutlich mehr wert ist als eine Freitext-Begründung.

### Datenmodell (Klartext)

Ergänzt an **bestehenden** Kommunikationseinträgen:
- eine Ja/Nein-Markierung „Inner Circle" (Standard: nein)
- ein Embargo-Zeitpunkt (optional, mit Uhrzeit/Zeitzone)

Neu, zwei Tabellen:
- **Inner-Circle-Mitgliedschaft** — welcher Eintrag, welche Person, wer hat sie hinzugefügt, wann.
- **Zugriffsprotokoll** — Mandant, Projekt, Eintrag, Person, Art des Zugriffs, Ergebnis, Zeitpunkt. Keine Inhalte. Nur anfügbar. Lesbar für Projektleitung mit passender Freigabe.

### Technische Entscheidungen (und warum)

- **Das produktweite Berechtigungstor wird nicht angefasst.** Der Inner Circle wird als *zusätzliche* Hürde ausschließlich auf der Kommunikationstabelle ergänzt. Postgres verknüpft solche Hürden mit UND — semantisch exakt „eine Bedingung mehr". Der Alternativweg (Tor selbst erweitern) hätte 15+ Tabellen und alle bestehenden Sicherheitstests im Wirkungsradius. Der Beweis, dass nichts angefasst wurde, ist Teil der Abnahme: die Regressionstests von PROJ-100a/100b/118 müssen unverändert grün bleiben.
- **Es wird keine zweite Rechteengine gebaut.** Die Erklär-Sichten leiten sich aus demselben Prädikat ab, das auch entscheidet.
- **Kein neuer Navigationspunkt.** Die bestehende Kommunikationsmatrix-Seite wird erweitert; Inner-Circle-Verwaltung und Zugriffsprotokoll leben in einem Seitenbereich an der jeweiligen Zeile. Nebeneffekt: kein Merge-Konflikt mit den vier parallel laufenden Slices.
- **Das Zugriffsprotokoll bleibt aus dem allgemeinen Änderungsverlauf heraus.** Dessen Semantik ist „Feld hat sich von A zu B geändert" — Lesezugriffe passen dort nicht hinein und würden die Verlaufsansicht fluten.

### Bewusst nicht in diesem Slice (Followups)

- **Wasserzeichen** mit Empfänger/Zeitstempel (offene Spec-Frage) → PROJ-Y. Ohne serverseitiges PDF-Rendering nicht seriös umsetzbar; laut Spec ohnehin out of scope.
- **Pflichtbestätigung des Inner Circle durch den Sponsor** (offene Spec-Frage) → PROJ-Y. Das wäre ein zweiter Genehmigungs-Workflow und würde den Slice verdoppeln. Kompromiss jetzt: Der Sponsor wird beim Setzen der Markierung als Mitglied **vorgeschlagen**, nicht erzwungen.
- **Aufbewahrungsfristen/Löschung** des Zugriffsprotokolls → PROJ-Y.
- Kein DRM außerhalb der Plattform (Spec).

### Blockierende Hardening-Kriterien (Abnahmebedingung)

- **H1** Live-Sicherheitstest gegen Produktion (mit Rollback, 0 Rückstände): Admin außerhalb des Kreises sieht nichts · Mitglied sieht · Nicht-Projektmitglied sieht nichts · fremder Mandant sieht nichts · Stufenordnung unverändert.
- **H2** Aggregat-Leck-Probe: Zähler, Filter, Export und Kacheln dürfen Inner-Circle-Einträge nicht in Summen durchscheinen lassen.
- **H3** Schreibpfad geschlossen (B1): alle Schreib-Operationen prüfen gegen die **gespeicherte** Stufe und den Inner Circle.
- **H4** Kein Aussperren: letztes Mitglied nicht entfernbar; Auflösung schreibt Audit **und** Zugriffsprotokoll.
- **H5** Anonymer Zugriff auf alle neuen Operationen entzogen; Zugriffsprotokoll ohne Änderungs-/Löschrechte.
- **H6** Regressionen byte-identisch grün: PROJ-100a, PROJ-100b, PROJ-118.
- **H7** Die Listenantwort enthält für Inner-Circle-Zeilen keinen Nachrichtentext (B2).

---

## Implementation Notes

**Gebaut:** 2026-08-07/08 · Branch `proj-119/confidential-distribution` · **kein neues Dependency** · 2 Migrationen (+1 Hardening-Nachtrag), alle in Prod

### Was gebaut wurde

**Datenbank** — Migration `20260807130000_proj119_confidential_distribution.sql` (in Prod registriert als `20260807205744_proj119_confidential_distribution`; Versions-Drift ist die bekannte MCP-Eigenheit und hier benign, weil die Migration durchgängig idempotent ist — `add column if not exists`, `create table if not exists`, `create or replace function`, `drop policy if exists`; PROJ-134-Domäne):

- `communication_matrix_entries` + `is_inner_circle boolean not null default false` und `embargo_at timestamptz`
- `communication_entry_inner_circle` (Mitgliedschaft, unique `(entry_id, user_id)`)
- `communication_access_log` (append-only; **kein** FK auf `entry_id`, damit das Protokoll das Löschen des Eintrags überlebt — analog `audit_log_entries.entity_id`)
- 2. RESTRICTIVE SELECT-Policy `comm_entries_inner_circle_gate` **nur** auf `communication_matrix_entries`
- Helfer `_comm_in_inner_circle` (für die Policy, rekursionsfrei) und `_comm_entry_visible` (gatet die zwei neuen Tabellen mit exakt demselben Prädikat)
- Guard `_comm_entry_guard` — der B1-Fix; 5 deployte RPCs (`update`/`delete`/`submit`/`respond`/`mark_sent`) darauf umgestellt
- 7 neue RPCs: `set_communication_inner_circle`, `add_`/`remove_communication_inner_circle_member`, `dissolve_inner_circle`, `set_communication_embargo`, `log_communication_access`, `read_communication_content`
- `_tracked_audit_columns` per **Anchor-Replace aus der LIVE-Definition** um `is_inner_circle` + `embargo_at` erweitert, danach `grant execute … to authenticated` erneuert. `can_read_audit_entry` und `audit_log_entity_type_check` bewusst **nicht** angefasst (`communication_matrix_entries` steht dort bereits; ein Recreate hätte das Grant-Drop-Risiko aus dem PROJ-114-Vorfall).

**API** — 6 neue Routen unter `…/communication-entries/[entryId]/`: `content`, `inner-circle` (GET/POST/PUT/DELETE), `dissolve`, `embargo`, `export`, `access-log`; plus B2-Fix in der Listen-Route und EM001-Behandlung in `mark-sent`.

**UI** — kein neuer Navigationseintrag: die bestehende Kommunikationsmatrix-Seite bekommt Inner-Circle- und Embargo-Badges, einen geschützten Botschafts-Platzhalter, eine „Inhalt anzeigen (wird protokolliert)"-Aktion und ein neues Sheet „Vertraulichkeit & Zugriff" mit den drei Tabs Inner Circle / Embargo / Protokoll.

### Zwei Bestandsfunde aus PROJ-118 — live bestätigt und mitgeschlossen

- **B1 (sicherheitsrelevant).** `delete_communication_entry` und `mark_communication_sent` prüften hartkodiert gegen `'standard'`, `update_communication_entry` coalescte darauf, `submit_`/`respond_` prüften **gar keine** Freigabestufe. Weil alle RPCs `SECURITY DEFINER` sind und damit an RLS vorbeischreiben, konnte eine Projektleitung ohne Freigabe einen `strict`-Eintrag ändern, löschen und auf „versendet" setzen — lesen konnte sie ihn nicht. Verifiziert gegen die Produktivdatenbank vor dem Fix; geschlossen durch `_comm_entry_guard`. Pentest-Fälle E + F.
- **B2.** Die Listenantwort lieferte `message` für **jeden** Eintrag. Eine Protokollierung, die nur das Öffnen der Detailansicht erfasst, wäre damit sachlich unwahr gewesen. Jetzt wird der Text für Inner-Circle-Zeilen serverseitig entfernt (`has_message` bleibt als Existenzhinweis) und ausschließlich über die protokollierte `/content`-Route geliefert.

### Bewusste Abweichungen

- **D-1 — Eigene RPCs statt erweiterter Signaturen.** Der CIA-Vorschlag, Inner Circle und Embargo über `create_`/`update_communication_entry` zu führen, hätte deren deployte 12/13-Argument-Signaturen erweitert und damit Overload-Mehrdeutigkeit für bestehende Aufrufer erzeugt. Stattdessen dedizierte Governance-RPCs — gleiche Audit-Wirkung (der UPDATE-Trigger hängt an der Tabelle, nicht am Aufrufweg), deutlich kleinerer Blast-Radius auf einer geteilten Produktivdatenbank.
- **D-2 — Kein CSS-Druckblocker.** Bewusst nicht gebaut. Serverseitig durchgesetzt wird die Herausgabe des Inhalts; Bildschirmfoto und Abtippen bleiben möglich und werden in der Oberfläche offen benannt. Genau deshalb sind Inner-Circle-Inhalte gar nicht erst exportierbar.
- **D-3 — SQLSTATE `EM001` statt `P0004`.** Der erste Entwurf nutzte `P0004`; das ist plpgsqls `assert_failure`, das `WHEN OTHERS` per Definition **nicht** fängt — jeder generische Fehler-Handler hätte es durchgereicht. Im Pentest aufgefallen, auf eine nicht-standardisierte, fangbare Klasse umgestellt.
- **D-4 — Export nur pro Eintrag.** AC2 zielt auf das Herunterladen von *Inhalten*; eine matrixweite CSV hätte pro ausgelassener Zeile eine Protokollzeile erzeugt, ohne forensischen Mehrwert.
- **D-5 — Zugriffsprotokoll auch für Kreis-Governance.** Mitgliedschaftsänderungen landen im Zugriffsprotokoll statt im allgemeinen Änderungsverlauf; das vermeidet eine Erweiterung des `audit_log_entity_type_check`, der geteilter Zustand mit vier parallel laufenden Slices ist.

### Nachweise

| Prüfung | Ergebnis |
|---|---|
| Live-Pentest `tests/sql/PROJ-119-confidential-distribution-pentest.sql` | **A–N 14/14 PASS** gegen Prod, 0 Rückstände |
| Regression PROJ-118 | **A–I 9/9 PASS** |
| Regression PROJ-100a | **7/7 PASS** |
| Regression PROJ-100b | **A–H 8/8 PASS** |
| `can_access_classified` unberührt (H6) | strukturell bewiesen: die Migration definiert die Funktion nirgends neu, sie ruft sie nur auf |
| Vitest | **2631/2631** (Baseline 2605 → +26) |
| `tsc --noEmit` | 13 Fehler = Baseline, **0 neue** |
| `npm run build` | clean, alle 6 neuen Routen registriert |
| `check:migration-naming` | **0 Fehler** (187 Migrationen) |
| Supabase-Advisors | **0 ERROR** |

**Hardening-Nachtrag:** die Advisors zeigten, dass Supabase über Default-Privilegien jeder neuen Funktion `EXECUTE` an `authenticated` gibt — `revoke … from public/anon` allein genügt also nicht. Der interne `_comm_entry_guard` (dessen `p_require_manager`-Flag aufruferkontrolliert ist) wurde deshalb zusätzlich von `authenticated` entzogen und ist damit nicht mehr über `/rest/v1/rpc/` erreichbar. Pentest-Fall N prüft das jetzt mit.

### Blocker / offene Punkte

- **ESLint kann in diesem Worktree nicht laufen** — und zwar bereits auf dem unveränderten Basis-Commit `e0337bd`, also unabhängig von dieser Slice. Ursache: `package.json` erzwingt repo-weit `brace-expansion@^5.0.9`, während `minimatch@3.1.5` (transitiv unter `@eslint/config-array`) `^1.1.7` erwartet; die v5-Exportform ist nicht mehr aufrufbar → `TypeError: expand is not a function`, noch bevor eine einzige Datei gelesen wird. Repo-weit, gehört zu PROJ-142 (Supply-Chain). Kein Workaround möglich, ohne `node_modules` anzufassen — das ist hier eine Hardlink-Kopie, die mit anderen Worktrees geteilt wird.
- **Dieser Blocker ist erledigt (2026-08-11).** PROJ-142 hat die Ursache repo-weit behoben (versions-scoped Override `"minimatch@3": { "brace-expansion": "^1.1.18" }`); `npm run lint` läuft auf main `265cccb` mit **0 Problemen** durch. Gegengeprüft im Rahmen des Closure-Deploys.
- **Weiterhin offen für den Deployed-Stempel:** formaler `/qa`-Abschluss. Der Code ist seit `c020ff8` (PR #302) live und die Sicherheitsnachweise sind stark (Live-Pentest A–N 14/14, Regressionen PROJ-100a/100b/118 grün, Advisors 0 ERROR), aber es fehlen (a) das Abhaken der beiden Akzeptanzkriterien, (b) ein Playwright-Auth-Gate-Spec für die 6 neuen Routen analog den Schwester-Slices, (c) ein formales QA-Verdikt. Post-Deploy-Smoke im Closure-Lauf: `/api/projects/{id}/communication-entries` → 307 Auth-Gate. Status bleibt daher bewusst **In Review** — kein Deployed-Stempel ohne QA.

### Followups (PROJ-Y)

- Wasserzeichen mit Empfänger/Zeitstempel auf Exporten (offene Spec-Frage; braucht serverseitiges PDF-Rendering)
- Pflichtbestätigung des Inner Circle durch den Sponsor (zweiter Genehmigungs-Workflow der PROJ-100c/105-Klasse; der Sponsor wird heute nur vorgeschlagen)
- Aufbewahrungsfrist/Löschung für `communication_access_log`
- Denselben `authenticated`-Entzug für PROJ-118s `_comm_project_authority` und `_comm_validate_links` prüfen (gleiche Klasse, außerhalb des Scopes dieser Slice)

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · H — Kommunikation, Gremien & Stakeholder_

---

## QA Test Results

**Getestet:** 2026-08-11 · **Tester:** QA Engineer (AI) · **Basis:** main `ebae5ac` · **Ergebnis: PASS — 0 Critical / 0 High → Approved**

### Warum dieser Lauf nötig war

Der Code war seit `c020ff8` (#302) live und die Nachweise stark, aber es existierte kein formales QA-Verdikt und keines der Akzeptanzkriterien war abgehakt. Der Closure-Lauf vom 2026-08-11 hat den Deployed-Stempel deshalb bewusst zurückgehalten. Dieser Lauf schließt die Lücke.

**Korrektur zur damaligen Closure-Begründung:** dort wurde als Rückstand „kein Playwright-Auth-Gate-Spec für die 6 neuen Routen" genannt. **Das war falsch.** `tests/PROJ-119-confidential-distribution.spec.ts` existiert seit #302 mit 11 Fällen, und `proj119.test.ts` liefert 26 Route-Unit-Tests inklusive der vollständigen AC2-Export-Matrix. Zustande kam der Fehlschluss, weil die Nachweis-Tabelle dieser Spec beides nicht auflistete und nur die SQL-/Vitest-Ebene nannte. Hier nachgetragen.

### Akzeptanzkriterien

| AC | Ergebnis | Nachweis |
|---|---|---|
| **AC1** Vertraulichkeitsstufe je Eintrag beschränkt Sichtbarkeit | **PASS** | Pentest **C** (freigegebener Außenstehender sieht 0) + **M** (Bestandsverhalten unverändert); Stufe stammt aus PROJ-118, Tor aus PROJ-100a |
| **AC2** Download/Druck je Stufe protokolliert **oder** unterbunden | **PASS** | 6 Route-Unit-Tests der Export-Matrix: standard = Export ohne Protokoll · confidential = Export **und** `granted` · strict = 403 + `denied` · Inner Circle = 403 selbst auf `confidential` · Druckansicht protokolliert `print_view` · versteckter Eintrag = 404, Versuch trotzdem protokolliert |
| **AC3** Inner Circle überstimmt Rollen und Freigaben | **PASS** | Pentest **B** (Tenant-Admin außerhalb sieht 0 — Admin-Bypass überstimmt), **C**, **O** (kein stiller Selbst-Eintritt) |
| **AC4** Embargo-Prüfung vor „freigegeben → versandt" | **PASS** | Pentest **I** (blockt mit `EM001`, gibt nach Anpassung frei) + Route-Test (EM001 → 422, Versuch protokolliert) + **S** (Grenzfall) |

**Definition of Done:** Sichtbarkeit/Embargo/Inner-Circle funktionieren ✅ · Audit-Trail erfasst jeden Zugriff auf Inner-Circle-Inhalte ✅ (Pentest **K**: Inhalt gelesen → 1× `granted`, verweigert → 1× `denied`).

### Blockierende Hardening-Kriterien

| | Ergebnis | Nachweis |
|---|---|---|
| **H1** Live-Sicherheitstest, 0 Rückstände | **PASS** | A–N 14/14 gegen Prod re-verifiziert; Cross-Tenant über alle drei Tabellen (**L**) |
| **H2** Aggregat-Leck | **PASS** | **D**: Mitgliedschaft und Zugriffsprotokoll außerhalb des Kreises unsichtbar (0/0), innerhalb 2 |
| **H3** Schreibpfad geschlossen (B1) | **PASS** | **E** (UPDATE) + **F** (DELETE/MARK_SENT/SUBMIT) je `42501` für Projektleitung ohne Freigabe |
| **H4** Kein Aussperren | **PASS** | **A** (Ersteller + Verantwortliche automatisch), **G** (letztes Mitglied nicht entfernbar, `23514`), **H** (Auflösung schreibt Zugriffsprotokoll **und** Feld-Audit) |
| **H5** Anon entzogen, Protokoll nur anfügbar | **PASS** | **J** (INSERT `42501`, UPDATE/DELETE 0 Zeilen), **N** (anon auf allen 10 Funktionen entzogen, interner Guard auch für `authenticated` nicht erreichbar), **P** |
| **H6** Regressionen unverändert | **PASS** | **M** behavioral + strukturell live: `can_access_classified` kennt `inner_circle` nicht, **genau eine** neue RESTRICTIVE-Policy und nur auf `communication_matrix_entries` |
| **H7** Listenantwort ohne Nachrichtentext | **PASS** | `redactInnerCircleContent` + 3 Unit-Tests (strippt Inner-Circle-Text, lässt normale Zeile unberührt, `has_message` bei leerem Text) |

### Red-Team-Supplement (neu in diesem Lauf)

Fünf Vektoren, die A–N **nicht** abdeckte — live gegen Prod, zurückgerollt, 0 Rückstände:

| | Angriff | Ergebnis |
|---|---|---|
| **O** | Tenant-Admin **außerhalb** des Kreises fügt sich per `add_communication_inner_circle_member` **selbst** hinzu — ein stiller Weg hinein, der den lauten Break-Glass umgehen würde | **PASS** — blockiert; die Auflösung mit Protokoll- und Audit-Eintrag bleibt der einzige Zugang. Das ist der Kern der Story: der Administrator kommt an den Inhalt, aber nur nachweisbar. |
| **P** | Fremder Mandant schreibt Zeilen ins Zugriffsprotokoll eines Eintrags, den er nicht sehen darf (Audit-Verfälschung) | **PASS** — 0 gefälschte Zeilen. Zusätzlich strukturell: `log_communication_access(p_entry_id, p_action, p_outcome)` hat **keinen** Nutzer-Parameter, der Akteur kommt aus `auth.uid()` — Zuschreibungs-Fälschung ist ausgeschlossen. |
| **Q** | Cross-Tenant-Inhaltsabruf über die SECURITY-DEFINER-RPC `read_communication_content` | **PASS** — kein Inhalt |
| **S** | Embargo-Grenzfall: Zeitpunkt **exakt** `now()` | **INFO** — gilt als erreicht, Versand erlaubt (inklusive Grenze). Sinnvoll und hier dokumentiert, damit es niemand später „korrigiert". |
| **T** | Gewöhnliches Kreis-Mitglied (Rolle `editor`) erweitert den Kreis auf einen Außenstehenden | **INFO** — blockiert (`42501`); Erweitern erfordert Manager-Rechte. Strenger als der Prosa-Text der Spec vermuten lässt. |

### Automatisierte Suiten

| Prüfung | Ergebnis |
|---|---|
| Vitest (voll) | **2746/2746** |
| Playwright `PROJ-119-confidential-distribution.spec.ts` | **11/11** chromium (alle 6 neuen Routen + Druckansicht + Protokoll + „unauthentifizierter Export leakt nie Inhalt") |
| Route-Unit-Tests `proj119.test.ts` | **26** (Redaktion, `/content`, Inner-Circle-CRUD, Auflösung, Embargo, `mark-sent` unter Embargo, AC2-Matrix) |
| ESLint | **0 Probleme** |
| `npm run build` | clean |
| `check:migration-naming` | 0 Errors |
| Supabase-Advisors | **0 ERROR**; keine der 131 WARN ist PROJ-119 zuzuordnen (alle sechs neuen Funktionen tragen `search_path=public, pg_temp`) |

### Befunde

**F-1 — Nachweis-Tabelle war unvollständig (Info, in diesem Lauf behoben).** Playwright-Spec und die 26 Route-Unit-Tests fehlten in der Auflistung. Reale Folge: der Closure-Lauf hielt die Slice mit einer teils falschen Begründung zurück. Kein Produktfehler, aber ein Dokumentationsfehler mit Entscheidungswirkung — deshalb hier als Befund geführt.

**F-2 — Embargo-Grenze ist inklusiv (Info).** `embargo_at == now()` gilt als erreicht. Bewusst dokumentiert, kein Handlungsbedarf.

**F-3 — Kreis-Erweiterung ist manager-gebunden (Info).** Ein `editor` im Kreis kann niemanden aufnehmen. Der Prosa-Abschnitt „Die vier Bausteine" liest sich offener; das Verhalten ist die sicherere Variante und bleibt.

Keine Critical-, High-, Medium- oder Low-Befunde.

### Nicht getestet (und warum)

- **Cross-Browser:** Mobile Safari übersprungen — WebKit-Host-Bibliotheken fehlen auf diesem Host (vorbestehend, PROJ-67/F2). Chromium vollständig.
- **Responsive 375/768/1440:** nicht Teil dieses Laufs; die Slice fügt der bestehenden Kommunikationsmatrix-Seite Badges und ein Sheet hinzu, beide aus vorhandenen shadcn-Primitiven ohne eigenes Layout.
- **Wasserzeichen / Sponsor-Pflichtbestätigung / Protokoll-Aufbewahrung:** bewusste Followups (siehe oben), nicht im Scope.

### Production-Ready

**JA.** 4/4 Akzeptanzkriterien, 2/2 Definition-of-Done, 7/7 Hardening-Kriterien, 3 neue Angriffsvektoren abgewehrt, 0 Critical/High.
