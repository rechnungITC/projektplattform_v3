---
id: PROJ-Y-148a
title: "Hard-Delete vs. append-only Governance-Historie — Entscheidungsvorlage"
issue_type: Story
epic_code: CORE
epic_title: "Shared Core — Projekte & Lebenszyklus"
priority: Medium
priority_source: "Should"
labels: ["core", "governance", "data-integrity", "cia-review"]
dependencies: ["PROJ-148", "PROJ-130", "PROJ-31", "PROJ-33"]
roles: ["Platform", "Compliance/Revision"]
summary_for_jira: "[CORE] Papierkorb: 4 Projekte nicht loeschbar wegen append-only-Historie — Entscheid Absage vs. Entkopplung"
---

# PROJ-Y-148a — Hard-Delete vs. append-only Governance-Historie

## Status: Proposed (Entscheidungsvorlage — CIA-Review erbracht 2026-08-18)
## Deployment Scope: —
**Erstellt:** 2026-08-18
**Herkunft:** „Bewusst nicht in Scope" aus PROJ-148 (deployed, `v2.57.0`), registriert als CIA-pflichtig.
**Klasse:** Zielkonflikt zwischen zwei ausgelieferten Zusagen — kein Bug, kein Feature.

> Diese Datei ist die Entscheidungsvorlage. Sie enthält **numerierte Akzeptanzkriterien für beide
> Varianten**, damit nach dem Entscheid ohne weiteren Vorlauf gebaut werden kann. Es wird genau **eine**
> Variante gebaut; die AC der anderen verfallen mit dem Entscheid.

---

## 1. Kurzfazit

Der Konflikt ist real, aber **kleiner und anders gelagert, als die Registernotiz annahm** — in beide
Richtungen:

- **Breiter im Bestand:** nicht zwei, sondern **fünf** append-only-Ereignistabellen liegen im
  Kaskaden-Abschluss von `projects`. Nur zwei haben heute Zeilen; die Reichweite wächst mit der Nutzung.
- **Enger in der Governance-Frage:** die append-only-Zusage von **PROJ-130 ist von diesem Konflikt gar
  nicht betroffen**. `audit_log_entries` hat **null** Fremdschlüssel, die Kaskade erreicht sie nicht.
  Betroffen sind fünf ältere, unabhängige Zusagen (PROJ-31 · PROJ-33 · PROJ-100c · PROJ-105 · PROJ-45-β).
- **Und die Löschung ist bereits protokolliert:** bei einem erfolgreichen Hard-Delete schreibt PROJ-130-β
  `__deleted`-Zeilen für `projects`, `decisions` und `stakeholders` in den geschützten Trail. Verloren
  geht nicht die *Tatsache* der Löschung, sondern der *Detailinhalt* der Ereignisinseln.

**Empfehlung: Variante 1 (ehrlich absagen) umsetzen, Variante 2 nicht.** Tragender Grund: das
Bedienbedürfnis ist bereits zu 83 % gedeckt (19 von 23 Projekten sind löschbar), und Variante 2 hebt fünf
unabhängig gegebene Unveränderlichkeits-Zusagen auf, um vier Projekte räumen zu können — wobei sie die
Historie nicht einmal erhält, sondern in weiche Verweise auf gelöschte Objekte verwandelt (F-10/F-11).
Eine echte Lücke bleibt und wird eigens registriert: **DSGVO Art. 17** auf `payload` (F-12).

## 2. Analysierter Bereich

Datenmodell · Security/Governance · API-Fehlerkette · UI-Ehrlichkeit. Alle Messungen live gegen Prod,
lesend bzw. in zurückgerollten Subtransaktionen; **0 Rückstände** gegengeprüft (23 Papierkorb-Projekte,
52 Projekte, 578 Audit-Zeilen, 47 / 10 Ereigniszeilen — alle unverändert).

## 3. Findings

| # | Finding | Beleg |
|---|---|---|
| **F-1** | **Fünf**, nicht zwei append-only-Ereignisinseln liegen in Kaskaden-Tiefe 2 unter `projects`: `stakeholder_profile_audit_events`, `decision_approval_events`, `deliverable_approval_events`, `ma_clearance_request_events`, `construction_defect_events`. | rekursive `pg_constraint`-Abfrage über `confdeltype='c'` × Guard-Trigger mit DELETE-Zweig |
| **F-2** | „4 von 23" unabhängig reproduziert: **19 löschbar, 4 blockiert mit `23514`**. Zuordnung, die das Register nicht hatte: `stakeholder_profile_audit_events` blockt **alle 4** (32 Zeilen), `decision_approval_events` zusätzlich 2 davon (5 Zeilen). | Delete-Probe je Projekt in Subtransaktionen |
| **F-3** | Der dominante Blocker ist **nicht M&A-spezifisch**. Stakeholder-Profil-Historie entsteht in jedem normal genutzten Projekt — betroffen sind „Test 1 SCRUM", „Wasserfall 1", „Neuer Test 11.05.26", „M&A2". **PROJ-45-β** (Mängelmanagement, gerade spezifiziert) bringt `construction_defect_events` als dritten Blocker in Betrieb. |  Zählung je Projekt + Kaskadenpfad |
| **F-4** | **Die Fehlerkette ist inkonsistent, nicht nur hässlich.** `route.ts:159` bildet `23514` im PATCH-Zweig korrekt auf **422 `constraint_violation`** ab; `route.ts:245` im Hard-Delete-Zweig mappt jeden Fehler ohne Code-Prüfung auf **500 `delete_failed`**. Derselbe SQLSTATE ist an einer Stelle Nutzerfehler, an der anderen Serverfehler. | Code gelesen, Zeilen benannt |
| **F-5** | Der Dialog zeigt die **rohe englische DB-Meldung** samt Tabellenname (`stakeholder_profile_audit_events are append-only…`) als Toast-Beschreibung, und behauptet im Titeltext „The project and its **full lifecycle history** will be removed" — seit PROJ-130-β **sachlich falsch**. Der Dialog ist außerdem unverändert seit PROJ-2 (`5fb1490`), also englisch, obwohl PROJ-Y-143m die Projektliste eingedeutscht hat, und behandelt 404 als „endpoint pending implementation" (Überrest). | `hard-delete-confirm-dialog.tsx`, `git log` |
| **F-6** | **PROJ-130s Zusage ist strukturell unberührt:** `audit_log_entries` hat **0** Fremdschlüssel. Die betroffenen fünf Inseln sind eigene, ältere Zusagen mit je eigenem Trigger. Die Registernotiz („Rückschritt hinter PROJ-130") trifft die Sache im Ergebnis, benennt aber die falsche Quelle. | FK-Zählung |
| **F-7** | Bei erfolgreichem Hard-Delete schreibt PROJ-130-β `record_audit_lifecycle` (`DELETE`-Trigger) für `projects`, `decisions` **und** `stakeholders` — append-only, ohne Löschpfad. Die Löschung ist also nachvollziehbar; die Inseln selbst haben **keinen** Lifecycle-Trigger. | `pg_trigger` × `record_audit_lifecycle` |
| **F-8** | **Alle acht** append-only-Guards im Produkt stehen auf `tgenabled='O'` (ORIGIN), sind also unter `session_replication_role = replica` aus — auch `audit_log_no_delete`. Die Unveränderlichkeit ist eine Zusage **gegenüber der Anwendung**, keine gegenüber DB-Superusern. Das ist die aus PROJ-130-α bekannte Grenze, und sie gilt breiter als dort notiert. | `tgenabled` über alle 8 |
| **F-9** | **Gegenbefund zur Erwartung, gut für Variante 2:** die SELECT-Policies der Inseln hängen an `is_tenant_member(tenant_id)`, **nicht** an der Elternzeile. Entkoppelte Zeilen blieben für jedes Mandanten-Mitglied lesbar — es entstehen **keine unlesbaren Waisen**. | `pg_policies` |
| **F-10** | **Aber sie wären nicht mehr auflösbar.** `stakeholder_id` / `decision_id` sind **NOT NULL** und CASCADE; `tenant_id` ist **ebenfalls** CASCADE. Variante 2 müsste beide FKs entfernen (Muster `audit_log_entries`: 0 FKs, ID als weiche Referenz) — sonst tilgt das Mandanten-Offboarding sie weiterhin. Die Zeile zeigt danach auf ein Objekt, das es nicht mehr gibt. | Spalten- + FK-Abfrage |
| **F-11** | Der PROJ-130-β-Resolver `_audit_entity_context` kennt die Inseln **nicht**, und `audit_log_entity_type_check` hat **keine** Einträge für sie. Variante 2 (Audit-Ereignis über die Entkopplung) und Variante 3 brauchen Eingriffe in genau die Register, die historisch am häufigsten geclobbert wurden (PROJ-Y-122a-Lehre). | Resolver-Quelle + CHECK-Definition |
| **F-12** | **Die einzige echte Lücke, die Variante 1 offen lässt:** der Papierkorb ist unbefristet (kein Auto-Purge; `apply-retention` räumt seit PROJ-130-α nichts), und für die Inseln existiert **kein Redaktionspfad** — `redaction_off` gilt nur für den `audit_log_entries`-Export. `stakeholder_profile_audit_events.payload` trägt Profildaten (Big5/OCEAN, Skills). Bei einem Löschverlangen nach **DSGVO Art. 17** ist „nicht löschbar" damit ein Rechts-, nicht nur ein Bedienproblem. | Cron-Route + Grep über `src/` |

## 4. Risks

- **R-1 (mittel, Variante 2):** Die Entkopplung ist **nicht rückholbar**. Sind die FKs weg und die
  Elternzeilen gelöscht, lässt sich der Objektbezug nachträglich nicht wiederherstellen.
- **R-2 (mittel, Variante 2):** Fünf Tabellen, fünf FK-Paare, plus `tenant_id`-Entkopplung → der
  Mandant lässt sich anschließend **nicht mehr rückstandsfrei** entfernen; PROJ-17-Offboarding und
  PROJ-Y-143c-Aufräumung müssten neu bewertet werden.
- **R-3 (hoch, Variante 2/3):** Register-Eingriff auf `audit_log_entity_type_check` und
  `can_read_audit_entry` unter fünf Parallel-Slices — die Fläche mit der belegten Clobber-Historie.
- **R-4 (mittel, Variante 3):** Die Verdichtung müsste **vor** dem Guard feuern; Trigger-Reihenfolge ist
  alphabetisch nach Namen. Eine Zusage, die von einem Triggernamen abhängt, ist fragil.
- **R-5 (niedrig, Variante 1):** Der Papierkorb wächst unbegrenzt weiter (F-12). Ohne Redaktionspfad
  bleibt eine DSGVO-Antwort offen — bewusst als eigenes Followup, nicht hier mitentschieden.
- **R-6 (niedrig, beide):** `payload` darf **nie** in `audit_log_entries` transferiert werden. PROJ-130-β
  schreibt aus genau diesem Grund kompakte Kennungen statt Row-Abzüge (Class-3-Klartext + Umgehung der
  Export-Redaktion).

## 5. Entscheidungsvorlage

| Kriterium | **V1 — ehrlich absagen** | **V2 — entkoppeln statt löschen** | **V3 — in den geschützten Trail verdichten** |
|---|---|---|---|
| Eingriff | 1 Route-Zweig (`route.ts:245`), 1 Dialog, 1 Vorab-Prüfung | 5 Tabellen × 2 FKs + `tenant_id`, NOT-NULL-Lockerung oder FK-Entfall, Register-Eingriff | wie V2 **plus** 5 Verdichtungspfade + `entity_type`-CHECK + Trigger-Reihenfolge |
| Migration | **keine** (reine App-Ebene) — oder eine schmale Lesefunktion, falls die Vorab-Prüfung serverseitig gebündelt wird | 1 große, **unumkehrbare** | 1 große + Register |
| Aufwand (belegt an Eingriffsfläche) | **niedrig** (~0,5 PT) | mittel–hoch (~2,5 PT + Pentest über 5 Inseln) | hoch (~4 PT) |
| Risiko | **niedrig** — nichts wird gelöscht, nichts entkoppelt | mittel–hoch (R-1…R-3) | hoch (R-3, R-4) |
| Wirkung auf den Bestand | 19 von 23 löschbar (unverändert), 4 mit klarer Begründung statt 500 | 23 von 23 löschbar | 23 von 23 löschbar |
| Folge für PROJ-130 | **keine** (F-6: FK-frei) | keine für `audit_log_entries`; hebt fünf **andere** Zusagen auf | keine; verlagert fünf Zusagen an eine andere Stelle |
| Folge für PROJ-31/33/100c/105/45-β | Zusagen bleiben wörtlich | Zusagen fallen für den Abriss-Fall | Zeile existiert weiter, aber **nicht dort, wo zugesagt** |
| DSGVO Art. 17 | offen → eigenes Followup | „gelöst" durch Löschen des Projekts — aber `payload` **bleibt** in der entkoppelten Zeile, also gerade **nicht** gelöst | wie V2 |
| Ehrlichkeit der Oberfläche | wird hergestellt (F-5 mit behoben) | F-5 bleibt (Dialog behauptet weiter Falsches) | F-5 bleibt |

**Warum nicht V2, obwohl F-9 sie stützt.** F-9 nimmt V2 ihr größtes Gegenargument (keine unlesbaren
Waisen), F-10 ersetzt es durch ein feineres: die überlebende Zeile ist lesbar, aber **nicht auflösbar** —
ein `stakeholder_id`, zu dem es keinen Stakeholder mehr gibt. Für einen Prüfer ist „wer hat wann
zugestimmt" damit nicht mehr rekonstruierbar; erhalten bliebe ein Zeitstempel mit einer toten UUID. V2
kostet also fünf Zusagen und liefert dafür **keine** verwertbare Historie. Zugleich löst sie das
DSGVO-Problem nicht, sondern verschärft es: `payload` überlebt die Löschung des Projekts.

**Warum nicht V3, obwohl sie formal beide Zusagen hält.** V3 ist die technisch reizvollste Variante — sie
würde die Metadaten (nie `payload`, R-6) in die am **stärksten** geschützte Tabelle überführen:
append-only, FK-frei, hash-verankert (PROJ-130-ε), mit Auditor-Lesepfad (γ2) und Export-Redaktion. Sie
scheitert an der Verhältnismäßigkeit: vierfacher Aufwand, R-3 auf der Clobber-Fläche und R-4 an der
Trigger-Reihenfolge — für vier Projekte, die niemand löschen *muss*.

**Der tragende Grund für V1** ist nicht Sparsamkeit, sondern die Zielrichtung: **„endgültig löschen" ist
kein Produktziel, das die Unveränderlichkeit überwiegt.** Der Papierkorb ist ein legitimer,
unbefristeter Dauerzustand (F-12, kein Auto-Purge) — ein Projekt mit Governance-Historie *muss* dort
bleiben können. Was heute fehlt, ist nicht der Löschpfad, sondern die **Aussage**: die Oberfläche liefert
einen 500er mit englischem Tabellennamen und verspricht im selben Atemzug, die Historie zu entfernen.
Genau das ist behebbar, ohne eine einzige Zusage anzufassen.

## 6. Akzeptanzkriterien — Variante 1 (empfohlen)

- **AC-Y148a.V1-1** — Der Hard-Delete-Zweig unterscheidet `23514` von echten Serverfehlern: die Route
  antwortet mit **409** (Konflikt: unveränderliche Historie) statt 500 `delete_failed`, mit stabilem
  `code`. Analog zur bereits vorhandenen `23514`-Behandlung in `route.ts:159`.
- **AC-Y148a.V1-2** — Die Antwort trägt **keine** rohe DB-Meldung und **keinen** Tabellennamen nach
  außen; die betroffene Historienart wird als fachlicher Begriff benannt (z. B. „Genehmigungs-Historie",
  „Stakeholder-Profil-Historie"), abgeleitet aus einer Zuordnung im Code, nicht aus dem Fehlertext.
- **AC-Y148a.V1-3** — Der Dialog sagt **vor** dem Bestätigen, dass dieses Projekt nicht endgültig
  löschbar ist, und begründet es; der Bestätigungsknopf ist dann nicht aktiv. Der Nutzer läuft nicht in
  eine Sackgasse (Muster: `ModuleUnavailableNotice` aus PROJ-Y-143f — neutral, keine Fehlerfarbe, kein
  „alles in Ordnung").
- **AC-Y148a.V1-4** — Die Vorab-Erkennung ist **serverseitig** und nennt die Ursache; sie darf nicht
  daraus abgeleitet werden, dass ein Löschversuch fehlschlug (kein Probe-Delete).
- **AC-Y148a.V1-5** — Alle **fünf** Inseln aus F-1 sind abgedeckt, nicht nur die zwei heute belegten;
  ein Test friert die Liste ein, sodass eine sechste Insel eine Entscheidung erzwingt statt still
  durchzufallen (Muster: Abdeckungs-Wächter aus PROJ-130-δ2).
- **AC-Y148a.V1-6** — Die Falschaussage aus F-5 ist korrigiert: der Dialog behauptet nicht mehr, die
  „full lifecycle history" werde entfernt — die `__deleted`-Zeilen in `audit_log_entries` bleiben (F-7).
- **AC-Y148a.V1-7** — Der Dialog ist deutsch (Anschluss an PROJ-Y-143m), und der 404-Zweig meldet nicht
  mehr „endpoint pending implementation".
- **AC-Y148a.V1-8** — Kein Regress: ein Projekt **ohne** Governance-Historie bleibt hart löschbar; die
  19 löschbaren Bestandsprojekte bleiben löschbar (live in zurückgerollter Transaktion, 0 Rückstände).
- **AC-Y148a.V1-9** — Keine Migration, kein Guard-Trigger und kein FK werden angefasst; die fünf
  append-only-Zusagen sind nach der Slice wörtlich unverändert (strukturell belegt).
- **AC-Y148a.V1-10** — Der Route-Test deckt den `23514`-Pfad ab und wäre vor dem Fix rot (die
  bestehenden drei Hard-Delete-Tests treffen ihn nicht, `route.test.ts:272/291/308`).

## 7. Akzeptanzkriterien — Variante 2 (nur bei Gegenentscheid)

- **AC-Y148a.V2-1** — Für **alle fünf** Inseln: der Elternverweis verliert `ON DELETE CASCADE`, die
  Spalte bleibt gefüllt (weiche Referenz, Muster `audit_log_entries` = 0 FKs); `tenant_id` wird
  **ebenfalls** entkoppelt, sonst tilgt das Offboarding die Zeilen weiter (F-10).
- **AC-Y148a.V2-2** — Vor dem Verlust der Auflösbarkeit wird ein **Kontextstempel** denormalisiert
  (Objektart, Bezeichnung, Projekt-ID) — sonst bleibt eine tote UUID zurück. **Nie `payload`
  transferieren** (R-6).
- **AC-Y148a.V2-3** — Die Entkopplung ist selbst auditiert: ein Ereignis in `audit_log_entries` hält
  fest, dass zu Projekt X Historie auf Mandantenebene überführt wurde (verlangt `entity_type`-CHECK und
  `can_read_audit_entry` — **Anker-Ersetzung aus der Live-Definition** mit Treffer-Eindeutigkeit,
  Post-Verifikation und Geschwister-Zweig-Nachweis; F-11, R-3).
- **AC-Y148a.V2-4** — Lesbarkeit belegt: ein Mandanten-Mitglied sieht die entkoppelte Zeile weiterhin,
  ein Fremder nicht (F-9 als Pentest-Vektor, nicht als Annahme).
- **AC-Y148a.V2-5** — Die Aufbewahrung ist benannt: die entkoppelten Zeilen unterliegen derselben
  unbegrenzten Aufbewahrung wie `audit_log_entries` (PROJ-130-α-PO-Lock), und das ist in der Spec
  dokumentiert statt implizit.
- **AC-Y148a.V2-6** — Live-Pentest über alle fünf Inseln, inkl. Gegenprobe, dass der Guard bei
  **lebendem** Projekt weiterhin `23514` liefert (die Zusage darf nur für den Abriss fallen).
- **AC-Y148a.V2-7** — Die fünf Ursprungs-Zusagen (PROJ-31 · 33 · 100c · 105 · 45-β) werden in ihren
  Specs **ausdrücklich eingeschränkt**; eine stillschweigende Aufhebung ist nicht zulässig.
- **AC-Y148a.V2-8** — F-5 wird trotzdem behoben: der Dialog darf nicht weiter „full lifecycle history"
  behaupten.

## 8. Nicht empfohlene Änderungen

- **Denselben „Elternteil wird abgerissen"-Zweig wie in PROJ-148 in die Guards einsetzen.** Löscht
  Genehmigungs- und Profilhistorie ersatzlos. Das ist die Variante, gegen die das Register warnt.
- **Die Guards auf `ALWAYS` heben, um F-8 zu schließen.** Eigene Frage, eigene Slice — hier würde sie
  nur den vorhandenen Betriebspfad (PROJ-100a-Teardown) brechen.
- **`payload` in den Trail transferieren.** Class-3-Klartext im append-only Protokoll, das keinen
  Löschpfad hat, und Umgehung der Export-Redaktion (R-6).

## 9. Offene Fragen

- **Q-1 (Entscheid des Nutzers):** V1 oder V2? Empfehlung V1.
- **Q-2:** DSGVO Art. 17 auf `payload` — als Redaktionspfad in den Inseln (analog `redaction_off`) oder
  als Löschausnahme? PROJ-130 hat dieselbe Frage mit **Redaktion statt Löschung** beantwortet; das ist
  der konsistente Weg. → eigenes, CIA-pflichtiges Followup, **nicht** hier mitentscheiden.
- **Q-3:** Soll der Papierkorb überhaupt „leerbar" sein, oder ist eine Filterung „dauerhaft
  archiviert" die ehrlichere Bedienung? Berührt PROJ-Y-143c (Alt-Bestand).

## 10. Nächste Schritte

- [ ] Nutzer entscheidet Q-1.
- [ ] Bei V1: `/frontend` + schmaler Route-Anteil, ~0,5 PT, keine Migration, kein CIA-Folgepass nötig.
- [ ] Bei V2: `/architecture` mit CIA-Folgepass (unumkehrbarer Eingriff, R-1/R-2), dann `/backend`.
- [ ] Q-2 als eigenen Followup registrieren, unabhängig vom Entscheid.

## Nachweise dieser Vorlage

Alle Zahlen live gegen Prod erhoben (lesend bzw. in zurückgerollten Subtransaktionen), Rückstände
gegengeprüft und **0**:

1. Kaskaden-Abschluss × Guard-Trigger → 5 Inseln in Tiefe 2 (F-1).
2. Delete-Probe je Papierkorb-Projekt → 19 / 4, `23514`, beide Meldungen wörtlich (F-2, F-3).
3. Rückstands-Gegenprobe → 23 Papierkorb · 52 Projekte · 578 Audit-Zeilen · 47/10 Ereigniszeilen,
   alle unverändert; keine Audit-Zeile entstanden (wichtig, weil dort nichts löschbar wäre).
4. `pg_trigger` × `record_audit_lifecycle` → `__deleted` für `projects`/`decisions`/`stakeholders` (F-7).
5. `tgenabled` über alle 8 Guards → durchgängig `ORIGIN` (F-8).
6. `pg_policies` → SELECT an `is_tenant_member(tenant_id)` (F-9).
7. FK-/Spalten-Abfrage → NOT NULL + doppeltes CASCADE; `audit_log_entries` mit 0 FKs (F-6, F-10).
8. Resolver-Quelle + `audit_log_entity_type_check` → Inseln unbekannt (F-11).
9. `apply-retention`-Route + Grep über `src/` → kein Auto-Purge, kein Redaktionspfad (F-12).

**Bewusst nicht getan:** keine Migration, kein `src/`-Diff, keine Änderung an Prod-Daten oder
Prod-Schema. `features/INDEX.md` und `features/OPEN-DEFERRED-STATUS.md` nicht angefasst (Merge-Hotspots);
die vorgesehene INDEX-Zeile liegt dem Bericht als fertiger Textblock bei.
