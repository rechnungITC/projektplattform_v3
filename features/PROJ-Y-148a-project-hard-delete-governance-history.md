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

## Status: Approved (Variante 1 gebaut + verifiziert 2026-08-19 — 0 Critical / 0 High)
## Deployment Scope: —

> **Entscheid des Nutzers 2026-08-19: Variante 1.** Q-1 ist damit beantwortet. Die AC der Variante 2
> bleiben als verworfene Alternative stehen (Abschnitt 7) und sind **nicht** umgesetzt; sie sind keine
> zurückgestellte Anforderung, sondern der nicht gewählte Ast einer Entweder-oder-Entscheidung.
> Umsetzungsnachweis: Abschnitt 11.
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

## 7. Akzeptanzkriterien — Variante 2 (**nicht umgesetzt**)

> **Nicht umgesetzt — Variante 1 gewählt (Nutzer-Entscheid 2026-08-19).** Die folgenden Kriterien
> bleiben absichtlich stehen: sie dokumentieren den *verworfenen* Ast der Entscheidung, damit ein
> späterer Gegenentscheid nicht wieder von vorn beginnen muss. Sie sind **keine zurückgestellte
> Anforderung** — bei einem Entweder-oder erfüllt die gewählte Variante die Story, und die andere
> verfällt. Deshalb schließen sie einen Deployment-Scope `full` nicht aus (siehe Abschnitt 11).


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

---

# 11. Umsetzung — Variante 1 (2026-08-19)

## 11.1 Was gebaut wurde

Drei Eingriffe, **keine Migration, kein Guard-Trigger, kein Fremdschlüssel, keine neue Route**:

1. **`src/lib/projects/governance-history.ts` (neu)** — eine Registry der fünf append-only-Inseln
   (Tabelle · Elternrelation · FK-Anker · **deutscher Fachbegriff** · zusagende Slice) plus die
   Erkennung, die deren Zeilen zählt, und **genau eine** Formulierung des Satzes, den der Nutzer liest.
   Route und Dialog teilen ihn, damit sie nicht auseinanderlaufen können.
2. **`src/app/api/projects/[id]/route.ts`** — der Hard-Delete-Zweig fragt vor dem Löschen und antwortet
   `422 governance_history_immutable`; die Detail-`GET` bekommt das **opt-in** Flag
   `?hard_delete_check=true`, über das der Dialog dieselbe Frage vorab stellt.
3. **`src/components/projects/hard-delete-confirm-dialog.tsx`** — deutsch, ehrliche Zusage, Absage
   **vor** dem Knopf, Fehlerübersetzung über den stabilen `code`.

## 11.2 Die drei Entwurfsentscheidungen, die nicht offensichtlich waren

**Warum die Vorabprüfung zählt statt zu probieren.** Ein Probe-Delete bräuchte eine Transaktion, aus der
ein Route-Handler nicht zurückrollen kann — er würde also entweder wirklich löschen oder auf eine
Fehlermeldung hin raten. Die Prüfung zählt darum Zeilen (AC-Y148a.V1-4).

**Warum die Vorabprüfung die Autorität ist und nicht der SQLSTATE.** Beim Lesen der fünf Guard-Funktionen
aus der Live-Definition fiel auf, was die Vorlage nicht hatte: **nur zwei der fünf** werfen `23514`
(`stakeholder_profile_audit_events`, `decision_approval_events`); die anderen drei werfen **`42501`**. Eine
Lösung, die — wie AC-Y148a.V1-1 wörtlich vorschlägt — nur `23514` abbildet, hätte drei der fünf Inseln
weiterhin auf 500 laufen lassen, und zwar unsichtbar, weil diese drei heute 0 Zeilen haben. Das Zählen ist
gegenüber dem Fehlercode gleichgültig und deckt alle fünf (AC-Y148a.V1-5). Die `23514`-Abbildung bleibt
als zweite Reihe für das Fenster zwischen Zählen und Löschen.

**Warum ein Prüffehler nicht als Absage gilt.** Die Guards in der Datenbank bleiben die Durchsetzung.
Fällt die Zählung aus, läuft der Löschversuch weiter: verlieren kann dabei nichts gehen, während eine
Absage auf eine fehlgeschlagene Zählung hin ein Löschen blockiert hätte, für das es keinen Grund gibt. Im
`GET`-Pfad ist es umgekehrt — dort ist die Zählung die ganze Antwort, also wird der Fehler als 500
gemeldet statt eine der beiden Auskünfte zu erfinden.

## 11.3 Nachweise je Akzeptanzkriterium (Variante 1)

| AC | Ergebnis | Nachweis |
|---|---|---|
| **V1-1** 422 + stabiler `code` statt 500 | ✅ *(mit Abweichung D-1: 422, nicht 409)* | `route.test.ts` „AC-Y148a.V1-1/V1-2…" → `422` / `governance_history_immutable`; Rot-Grün: Entfernen des Zweigs macht genau diesen Fall rot |
| **V1-2** keine rohe DB-Meldung, kein Tabellenname, Fachbegriff | ✅ | derselbe Test prüft **negativ** gegen alle fünf Tabellennamen und gegen `append-only`; `governance-history.test.ts` prüft jedes Label gegen seinen Tabellennamen; Dialog-Test prüft `document.body.textContent` |
| **V1-3** Absage **vor** dem Bestätigen, Knopf nicht aktiv | ✅ | Dialog-Test „a blocked project explains itself and offers no button" — der Knopf ist **nicht vorhanden** (nicht bloß deaktiviert), und das Bestätigungsfeld entfällt |
| **V1-4** serverseitig, kein Probe-Delete | ✅ | `GET …?hard_delete_check=true`; `route.test.ts` prüft `adminDeleteChain.delete` wurde **nicht** aufgerufen |
| **V1-5** alle **fünf** Inseln, Liste eingefroren | ✅ *(im Sinn; siehe 11.12)* | `governance-history.test.ts` „covers exactly the five measured append-only islands" (gepinnt, nicht abgeleitet) + „freezes which islands actually refuse the cascade"; Fall „refuses on an island whose guard raises 42501". **Abgedeckt heißt entschieden, nicht abgelehnt:** die fünfte Insel blockt gemessen **nicht** und darf darum keine Absage erzeugen (F-14) |
| **V1-6** Falschaussage „full lifecycle history" korrigiert | ✅ | Dialog-Test „no longer claims the history will be removed" — negativ auf die alte Zusage, positiv auf `Änderungsprotokoll` |
| **V1-7** deutsch, kein „pending implementation" | ✅ | Dialog-Test „German throughout, no leftover implementation notice"; `translateDeleteError`-Tests für 404/403/`delete_failed` |
| **V1-8** kein Regress für löschbare Projekte | ✅ | `route.test.ts` „no regress"; **live gegen Prod** in zurückgerollter Transaktion: „Anna Test" gelöscht, `rows_left=0`; zusätzlich der bestehende authentifizierte Live-Lauf in `tests/PROJ-1-2-live-closure.spec.ts` |
| **V1-9** keine Migration, kein Guard, kein FK angefasst | ⚠️ **erfüllt für diese Slice, aber die Prämisse des AC stimmt nicht mehr** — siehe 11.5 | `git diff --stat`: kein `supabase/migrations/**`; die fünf Guards wurden **vor** dieser Slice fremd verändert (Fund F-13) |
| **V1-10** Route-Test deckt `23514`, wäre vorher rot | ✅ | Rot-Grün beidseitig ausgeführt, siehe 11.4 |

## 11.4 Rot-Grün-Gegenprobe (ausgeführt, nicht behauptet)

Über eine Dateikopie zurückgesetzt, **nie** per `git checkout` — der Vorfall aus PROJ-130-δ2 (F-3), bei dem
ein `git checkout` uncommittete Slice-Arbeit gelöscht hat.

| Eingriff | Erwartung | Ergebnis |
|---|---|---|
| `deleteError.code === "23514"`-Zweig entfernt | genau der V1-10-Fall rot | **1 failed / 32 passed** — „AC-Y148a.V1-10: maps a 23514 from the delete itself to 422, not 500" |
| Vorabprüfung im Delete-Zweig entfernt | die beiden Absage-Fälle rot | **2 failed / 31 passed** — V1-1/V1-2 und V1-5 |
| beides zurückgesetzt | grün | **33 passed** |

Zusätzlich hat der Bestands-Test „hard delete: admin path runs" beim Einbau **von selbst** angeschlagen
(die Vorabprüfung verbraucht fünf weitere Abfragen aus der Mock-Warteschlange) — ein unabhängiger Beleg,
dass die Prüfung im Löschpfad wirklich läuft und nicht nur danebensteht.

## 11.5 Fund F-13 (hoch, **fremdverursacht**, vor dieser Slice) — Prod trägt eine nicht gemergte Variante 3

Beim Lesen der fünf Guard-Funktionen aus der Live-Definition — statt sie aus der Vorlage zu übernehmen —
zeigte sich, dass **keine** von ihnen mehr so aussieht, wie diese Vorlage sie am 2026-08-18 beschrieben
hat. Alle fünf tragen inzwischen einen „Elternteil wird abgerissen"-Ausweg, vier davon gekoppelt an einen
neuen Sitzungsschalter `_project_teardown_active()`. Erhoben:

- Migration **`20260814170000_projy148a_governance_teardown_tombstone`** ist seit **2026-08-14** in Prod
  (registriert als `20260814131244`).
- Sie liegt **nicht** auf `main` und **nicht** in `supabase/migrations/` — nur auf dem nicht gemergten
  Zweig `proj-y-148a/governance-teardown-wip` (Commit `72cfecd`, Betreff „… Entscheidung offen").
- Sie bringt zusätzlich eine `hard_delete_project(uuid)`-RPC mit: `SECURITY DEFINER`, intern
  `is_tenant_admin`-gegatet, `EXECUTE` an `authenticated`, schreibt vor dem Abriss einen
  `__governance_purged`-Grabstein nach `audit_log_entries` und setzt dann den Teardown-Schalter.
- **Kein `src/`-Code ruft sie** (`grep` über `src` + `tests`: null Treffer). Über die Anwendung ist der
  Ausweg damit unerreichbar — was die Messung bestätigt: ein gewöhnlicher Löschversuch scheitert
  weiterhin, weil die Route den Schalter nicht setzt.

**Warum das hier stehen muss und nicht stillschweigend weggeht:** die Entscheidung des Nutzers für
Variante 1 verwirft Variante 3 — in Prod liegt sie aber gebaut da. Zwei Folgen, beide unangenehm:

1. **Repo/Prod-Divergenz.** Eine aus den Migrationsdateien frisch gebaute Datenbank hat die fünf
   ursprünglichen Guards **ohne** Ausweg, Prod hat sie **mit**. Das ist genau die Klasse Divergenz, die
   PROJ-Y-130f für zwei Audit-Trigger festgehalten hat.
2. **AC-Y148a.V1-9 ist in seiner Prämisse überholt.** Diese Slice fasst keinen Guard an — das ist
   überprüfbar und wahr. Die Zusage „die fünf append-only-Zusagen sind nach der Slice wörtlich
   unverändert" lässt sich aber nicht mehr geben, weil sie **schon vorher** nicht mehr wörtlich galten.
   Der Unterschied ist wichtig genug, um ihn nicht in ein Häkchen zu verwandeln.

Nicht getan, bewusst: die Migration weder rückgebaut noch fortgeschrieben. Ein Rückbau wäre eine
Migration (außerhalb des Auftrags), könnte die Arbeit einer Parallel-Session zerstören und würde eine
Entscheidung über den Grabstein-Weg treffen, die dem Nutzer gehört. Registriert als **PROJ-Y-148c**.

Zweiter Divergenz-Fund am Rand, **während der Slice erledigt**: `construction_defects` /
`construction_defect_events` waren beim Bau ebenfalls in Prod, aber nicht im Repo. Genau deshalb baut die
Prüfung ihre Abfrage aus der Registry statt aus festen Tabellennamen — ein statisches
`.from("construction_defect_events")` hätte den Schema-Drift-Wächter hart fehlschlagen lassen, weil keine
Migrationsdatei die Tabelle herstellte. **Beim Rebase auf `main` (`740b16b`) ist PROJ-45-β gelandet und
bringt die Migration mit**, dieser Teil der Divergenz ist damit geschlossen und die ursprüngliche
Begründung überholt. Der Entwurf bleibt: fünf Tabellen mit einer Abfrageform sind datengetrieben richtig,
und die Registry darf eine Insel aufnehmen, sobald ihr Guard in Prod steht — die Migrationsdateien dürfen
dann einen Merge hinterherhängen. Zur Laufzeit gilt eine fehlende Tabelle (`42P01` / `PGRST205`) als **0**
und blockiert nichts. Preis, ausdrücklich benannt: der Schema-Drift-Wächter validiert diese fünf
`SELECT`s nicht (dynamischer Tabellenname); Registry-Test und Live-Probe tragen das.

## 11.6 Live-Nachweise gegen Prod

Alle in zurückgerollten Transaktionen bzw. lesend; **Rückstände gegengeprüft, nicht angenommen**.

1. **Vollständigkeit der Insel-Liste** — rekursiver `pg_constraint`-Lauf über den `ON DELETE CASCADE`-
   Abschluss von `projects`, geschnitten mit `DELETE`-Triggern: **genau fünf** Funktionen der Form
   `enforce_*_immutability`, alle in Kaskaden-Tiefe 2, alle `tgenabled='O'`. Unabhängig reproduziert.
2. **Bestandsaufnahme** — 23 Papierkorb-Projekte, **4** mit Governance-Historie: „Test 1 SCRUM" 17+4,
   „Wasserfall 1" 10, „Neuer Test 11.05.26" 3+1, „M&A2" 2. Deckt sich mit der Vorlage (32 + 5 Zeilen),
   diesmal über die Zählabfrage der Vorabprüfung selbst erhoben — die Prüfung ist damit gegen die
   unabhängige Delete-Probe der Vorlage geerdet.
3. **Löschprobe** (DO-Block, der am Ende wirft und damit zurückrollt): blockiertes Projekt →
   `sqlstate=23514`, `decision_approval_events are append-only. UPDATE and DELETE forbidden.`; zweites
   blockiertes Projekt → `23514`; unblockiertes Projekt → gelöscht, `rows_left=0`.
4. **PostgREST-Syntax der Vorabprüfung** — mit Service-Role-Schlüssel, rein lesend: die
   Einbettungs-Abfrage liefert **exakt** die Zahlen der SQL-Joins (17 / 4 / 0 / 0 / 0). **Die
   aussagekräftige Hälfte ist die Gegenprobe:** dieselbe Abfrage **ohne** FK-Anker antwortet **HTTP 300**
   (mehrdeutige Einbettung, weil `stakeholder_profile_audit_events` zwei Fremdschlüssel auf `stakeholders`
   hat). Der Anker ist also tragend, nicht schmückend — und das konnte **kein** Unit-Test zeigen, weil
   dort jede Zeichenkette durchgeht. Ohne diese Messung wäre die Vorabprüfung zur Laufzeit still
   ausgefallen und der Dialog hätte dauerhaft „Vorabprüfung nicht möglich" gemeldet.
5. **Rückstände** — vor und nach allen Läufen identisch: 52 Projekte · 23 im Papierkorb · 47 / 10 / 0 / 0 / 0
   Ereigniszeilen · 48 Projektmitgliedschaften · **4 weiterhin blockierte Projekte**. Kundendaten
   unverändert.

**Eine Beobachtung ohne Anspruch:** `audit_log_entries` stand zu Beginn dieses Laufs bei **576**, die
Vorlage nennt für den 2026-08-18 **578**, am Ende sind es wieder **578**. Ein Rückgang ist in einer
append-only-Tabelle ohne Löschpfad nur über den dokumentierten Weg möglich
(`session_replication_role = replica` im Teardown eines Live-Pentests, PROJ-130-α F-8), der Anstieg über
laufende Parallel-Sessions. Beides wurde **nicht** von dieser Slice verursacht — die Probe rollte zurück,
und die Bestandszahlen oben sind unverändert. Welche Session den Rückgang verursacht hat, ist bei fünf
gleichzeitigen Arbeitsbäumen nicht bestimmbar und wird darum nicht behauptet.

## 11.7 Was nicht bewiesen ist

- **Kein authentifizierter Browser-Durchlauf des blockierten Pfads.** Er müsste eine Zeile in eine
  append-only-Insel in Prod schreiben. Die ist danach **nicht entfernbar** — das ist der Gegenstand
  dieser Slice — und das Projekt, das sie trägt, wäre dauerhaft unlöschbar. Die Testvorrichtung wäre der
  Rückstand. Bewiesen sind statt dessen: die DB-Verweigerung live (11.6/3), die Zählabfrage live
  (11.6/4), die Route über Unit-Tests inklusive Rot-Grün, und der Dialog über 15 Komponentenfälle.
- **Die drei `42501`-Inseln sind live leer** (0 Zeilen in Prod), ihre Absage ist daher nur über die
  Registry-Prüfung und den Unit-Test belegt, nicht an echten Daten.
- **Das Rennfenster** zwischen Zählen und Löschen ist für die drei `42501`-Inseln nicht abgedeckt: dort
  bliebe eine Antwort `500`. Bewusst so — ein pauschales `42501 → 422` würde im Service-Role-Pfad auch
  einer fremden Ursache die Aussage „unveränderliche Historie" unterschieben.
- **Der Schema-Drift-Wächter prüft die fünf Zählabfragen nicht** (dynamischer Tabellenname). Die
  eingefrorene Registry und der Live-Lauf tragen diese Abdeckung statt seiner.
- Mobile Safari übersprungen (WebKit-Bibliotheken fehlen, PROJ-67/F2).

## 11.8 Abweichungen

- **D-1 — `422` statt der in AC-Y148a.V1-1 genannten `409`.** Ausdrückliche Vorgabe des Nutzers, und die
  bessere: derselbe SQLSTATE `23514` wird im `PATCH`-Zweig derselben Datei seit je auf **422**
  abgebildet (`route.ts:159`). Der ganze Befund F-4 ist, dass ein Code an zwei Stellen unterschiedlich
  behandelt wird — ihn mit einem *dritten* Status zu beheben hätte die Inkonsistenz verschoben statt
  beseitigt.
- **D-2 — `ModuleUnavailableNotice` nachgeahmt, nicht wiederverwendet.** Die Komponente ist in ihrem
  Dokumentationskopf ausdrücklich als „Fläche, deren Modul nicht aktiv ist" definiert. Sie hier
  einzusetzen hätte diese Aussage falsch gemacht. Übernommen sind ihre drei Prinzipien (kein Fehler,
  kein Leerzustand, keine Warnfarbe) in acht Zeilen im Dialog.
- **D-3 — die Vorabprüfung ist admin-gegatet.** Sie beantwortet eine Frage über eine Handlung, die nur
  Administratoren ausführen können; einem Betrachter zu sagen, ob ein endgültiges Löschen gelingen würde,
  beschriebe eine Fähigkeit, die er nicht hat (Regel aus PROJ-Y-143f). Beide Aufrufstellen des Dialogs
  sind ohnehin admin-gegatet (`projects-trash-client.tsx:46`, `project-detail-client.tsx:119`).
- **D-4 — keine neue Route.** Das Flag hängt an der bestehenden Detail-`GET`; ohne Flag ist deren Antwort
  unverändert (eigener Test prüft die Schlüsselmenge). Begründung: eine Route mehr wäre eine
  Authentifizierungsfläche mehr für eine Frage, die zum Projekt selbst gehört.
- **D-5 — die Papierkorb-Seite bleibt englisch.** `projects-trash-client.tsx` („Projects trash", „No
  active workspace") gehört zum Umfang von PROJ-Y-143m, nicht hierher; nur der Dialog war benannt.
  Registriert in der 143m-Familie statt stillschweigend mitgezogen.
- **D-6 — Prüffehler im Löschpfad gilt nicht als Absage** (Begründung in 11.2).

## 11.9 Gates

Gemessen nach dem Rebase auf `main` (`740b16b`, PROJ-45-β), also am tatsächlich zu mergenden Baum:

ESLint **0** · `tsc` **13 = Baseline / 0 neu** (gegengeprüft: keiner der 13 Fehler liegt in einer Datei
dieser Slice) · vitest **3289/3289** in 397 Dateien (davon +40 dieser Slice: 20 Registry/Erkennung,
15 Dialog, 5 Route; die Gesamtzahl stieg zusätzlich durch PROJ-45-β) · `npm run build` clean ·
`check:index-scope` 174 Zeilen / 0 Fehler · `check:migration-naming` 0 Fehler ·
Playwright **5/5** chromium.

Vor dem Rebase lauteten die Zahlen 3103/3103 in 387 Dateien; hier stehen die späteren, weil nur sie den
Baum beschreiben, der gemergt wird.

## 11.10 Folgearbeit

- **PROJ-Y-148b** (neu, CIA-pflichtig) — DSGVO Art. 17 auf `payload` der Inseln. Q-2 dieser Vorlage,
  ausdrücklich **nicht** hier mitentschieden.
- **PROJ-Y-148c** (neu) — Repo/Prod-Divergenz aus F-13: die nicht gemergte Grabstein-Migration und die
  `hard_delete_project`-RPC in Prod.
- **Q-3 bleibt offen** — ob der Papierkorb überhaupt „leerbar" sein soll oder eine Filterung „dauerhaft
  archiviert" die ehrlichere Bedienung ist. Die Slice macht den Zustand jetzt sichtbar; die Frage ist
  damit besser stellbar, aber nicht beantwortet.

## 11.12 Fund F-14 (mittel, **fremd**, während der Slice entstanden) — die Mängel-Historie ist gar nicht geschützt

Beim Rebase auf `main` (`740b16b`) landete PROJ-45-β und brachte `construction_defect_events` samt Guard
ins Repo. Der Guard sieht anders aus als seine vier Geschwister:

```
if tg_op = 'DELETE'
   and not exists (select 1 from public.construction_defects d where d.id = OLD.defect_id)
then return OLD;
```

Es fehlt die Bedingung `_project_teardown_active()`, an der die anderen vier hängen. Ein Kaskaden-Löschen
entfernt aber genau die Elternzeile **zuerst** — die Ausnahme greift also bei jedem Projekt-Abriss von
selbst. Der Kommentar in der Migration begründet die Ausnahme damit, der Zweig sei „über die Anwendung
ohnehin unerreichbar (keine DELETE-Policy auf `construction_defects`)". Das trifft den direkten Weg, aber
**nicht** den Kaskadenweg: `projects → construction_defects → construction_defect_events` braucht keine
Policy.

**Live gemessen** (Transaktion zurückgerollt, 0 Rückstände): ein Gewerk, eine Projekt-Zuordnung, ein
Mangel und **ein** Ereignis geseedet, dann das Projekt gelöscht → `DELETE=SUCCEEDED`,
`project_rows_left=0`, **`event_rows_left=0`**. Die Mängel-Historie wird mit dem Projekt entfernt.

**Folge für diese Slice — ein echter Defekt in meiner ersten Fassung.** Die Registry hatte alle fünf
Inseln als Blocker geführt. Ein Projekt, dessen **einzige** Governance-Historie Mängel-Ereignisse sind,
wäre damit abgelehnt worden, obwohl die Datenbank es anstandslos löscht: eine **falsche Absage** — die
einzige Richtung, in der diese Slice etwas verschlechtern konnte. Behoben durch ein je Insel **gemessenes**
`blocksHardDelete`; die Erkennung fragt eine nicht blockierende Insel gar nicht erst. Die Liste bleibt
fünfgliedrig, damit sie den Kaskaden-Abschluss vollständig abbildet und eine sechste Insel weiter eine
Entscheidung erzwingt (AC-Y148a.V1-5 im Sinn erfüllt: **abgedeckt** heißt jetzt „entschieden", nicht
„abgelehnt"). Zwei Tests pinnen es: welche Inseln blocken, und dass eine nicht blockierende Insel mit
Zeilen **keine** Absage erzeugt.

**Folge für PROJ-45-β — nicht meine, aber zu melden.** Die Slice gibt für Mängel eine
Unveränderlichkeits-Zusage, die beim Projekt-Löschen nicht hält, während vier Geschwister-Inseln sie
halten. Das ist entweder eine bewusste Entscheidung, die nirgends steht, oder ein übersehener
Kaskadenweg. Registriert als **PROJ-Y-148d**; hier bewusst **nicht** geändert — den Guard einer fremden,
gerade gemergten Slice anzufassen wäre genau der Übergriff, den diese Slice sonst vermeidet.

**Warum das überhaupt auffiel:** weil die Guard-Körper aus der Live-Definition gelesen wurden statt aus
der Entscheidungsvorlage. Dieselbe Gewohnheit hatte zuvor F-13 aufgedeckt und die `42501`-vs-`23514`-
Aufteilung. Eine Vorlage beschreibt den Stand ihres Entstehungstages; bei fünf Parallel-Sessions ist das
zu alt.

## 11.11 Zum Deployment-Scope

Aus den Nachweisen in 11.3 ist **`full`** belegbar: alle zehn Kriterien der Variante 1 sind erfüllt, es
gibt keine zurückgestellte Original-Anforderung, und die Variante-2-Kriterien sind der **verworfene Ast**
einer Entweder-oder-Entscheidung, nicht eine Verschiebung — bei einer Alternativentscheidung erfüllt die
gewählte Variante die Story. Die Restlücke aus 11.10 (DSGVO Art. 17) war schon in der Vorlage
ausdrücklich **nicht** Teil dieser Story, sondern eigens getrennt.

Trotzdem steht hier `—`: `.claude/rules/general.md` erlaubt einen Scope erst bei Lifecycle-Status
`Deployed`, und `npm run check:index-scope` erzwingt das. Der Stempel `full` gehört damit in den
`/deploy`-Lauf — dieselbe Wartestellung, in der PROJ-130 und PROJ-144 standen.

Einschränkend zu benennen ist dabei **F-13**: das AC-Y148a.V1-9 in seinem Wortlaut („die fünf
append-only-Zusagen sind nach der Slice wörtlich unverändert") ist nicht mehr erfüllbar, weil es vor
dieser Slice fremd gebrochen wurde. Diese Slice hält den überprüfbaren Teil (sie fasst keinen Guard, keine
Migration und keinen Fremdschlüssel an); den Rest führt **PROJ-Y-148c**. Wer `full` stempelt, sollte das
mitschreiben, statt es in ein Häkchen zu verwandeln.
