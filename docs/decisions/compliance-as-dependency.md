> **Inherited from V2** — Decision still applies to V3. Stack-specific references (FastAPI, Redis, etc.) are historical; Supabase/Next.js V3 implementations follow the same principle.

# Decision: Compliance & Prozesse sind erstklassige Projekt-Abhängigkeiten

**Datum:** 2026-04-24 · **Status:** aktiv · **Betrifft:** EP-04, EP-07, EP-08, EP-13, neues EP-16

## Kontext

In der bisherigen Planung tauchen Compliance-Themen (ISO 9001, ISO 27001,
DSGVO-Pflichten) und wiederkehrende Unternehmensprozesse
(Microsoft-365-Rollout, Vendor-Auswahl, Change-Management) als
*nachgelagerte* Arbeitspakete oder gar nur im Kopf der Projektleitung auf.
In der Praxis führt das zu zwei Problemen:

1. **Compliance-Inkremente gehen verloren.** Wird ein Projekt „fertig",
   ist der ISO-9001-Prozessnachweis oft nicht produziert worden, obwohl
   das Projekt gerade einen Prozess eingeführt hat.
2. **Prozess-Dokumente entstehen zu spät.** Bei der Vendor-Auswahl
   fehlt die Bewertungsmatrix als Dokument, weil niemand sie im
   Arbeitspaket formal gefordert hat.

## Entscheidung

Compliance- und Prozess-Artefakte werden **als Abhängigkeiten in der
Arbeitsobjekt-Struktur selbst** modelliert, nicht als separate
Best-Practice-Doku:

1. **Tags**: Jedes Arbeitsobjekt (Epic, Feature, Story, Task, Work-Package)
   kann mit einem oder mehreren **Compliance-/Prozess-Tags** markiert
   werden. Tags sind ein tenantweit pflegbarer Katalog (siehe
   EP-16-ST-01).

2. **Auto-Inkremente**: Beim Erstellen eines Arbeitsobjekts mit einem
   Tag — oder bei Status-Wechsel auf *in Arbeit* / *abgeschlossen* —
   erzeugt ein zentraler `ComplianceTrigger`-Service automatisch die
   zum Tag hinterlegten Folge-Objekte (Reviews, Dokumente, Checklisten)
   im selben Projekt, verlinkt über `parent_id`.

3. **Projektphasen-Gate**: Am Ende jeder Projektphase
   (`phase.status → completed`) wird geprüft, ob alle erforderlichen
   Compliance-Inkremente abgeschlossen sind. Fehlende Inkremente
   blockieren den Phasenabschluss nicht hart, erzeugen aber einen
   Hinweis im Phasen-Report und einen offenen Todo mit Owner.

4. **Templates**: Jedes Tag trägt Referenzen auf Vorlage-Texte (Markdown)
   für die zu erzeugenden Dokumente. Templates sind codifiziert in
   `domain/core/compliance/templates/` und können mandantenweit
   **overriden** werden (analog EP-14-ST-03 Projekttyp-Override).

5. **Auditierbarkeit**: Alle Auto-Inkremente tragen im Audit-Log den
   Trigger-Grund („automatisch aus Tag `iso-9001` von WI-…"), damit
   spätere Reviewer nachvollziehen können, warum welches Dokument
   entstanden ist.

## Konkrete Tag-Beispiele

| Tag | Auslöst |
|---|---|
| `iso-9001` | Prozessdokument, Prozess-Review-Task, QMS-Freigabe-Checkliste |
| `iso-27001` | Schutzmaßnahmen-Dokument, Risiko-Assessment-Task, ISMS-Checkliste |
| `dsgvo` | Datenschutzfolgen-Abschätzung, Betroffenenrechte-Checkliste, AV-Vertrag-Slot |
| `microsoft-365-intro` | „Arbeiten mit M365"-Prozessdoku, Rollout-Checkliste, Admin-Handover-Task |
| `vendor-evaluation` | Bewertungsmatrix (EP-13-ST-03), Vertrags-Slot, NDA-Slot (EP-13-ST-04) |
| `change-management` | Change-Request-Template, Impact-Analyse-Task, Kommunikationsplan-Slot |
| `onboarding` | Onboarding-Checkliste, Rollen-Briefing-Task |

Die Tabelle ist **erweiterbar**; neue Tags entstehen per Mandanten-
Admin oder per Platform-Release.

## Konsequenzen

- Neues Epic **EP-16** (Compliance-Automatik) bündelt die Umsetzung.
- EP-04-ST-03 (methodenabhängige Objektlogik) bekommt eine Erweiterung:
  Projekttyp-Katalog trägt **Default-Tag-Sets** (z. B. „jedes
  ERP-Projekt hat automatisch `change-management` und `iso-9001`").
- EP-07 Metamodell: neue optionale Tag-Referenz pro Arbeitsobjekt.
- EP-08 Audit: neuer Audit-Grund `compliance_trigger`.
- EP-13 Vendor: der Vendor-Panel-Flow löst `vendor-evaluation` als Tag
  aus und erzeugt automatisch Bewertungsmatrix + Dokument-Slots.
- Coding-Standards und Software-Architect-Skill verweisen auf diese
  Regel und prüfen bei jeder neuen Story, ob Tags greifen.

## Nicht-Ziele

- **Keine rechtsverbindlichen Bewertungen.** Templates sind Hilfen, nicht
  Rechtsnachweise.
- **Keine starren Workflows.** Auto-Inkremente sind offen bearbeitbar
  und löschbar, falls sie in einem konkreten Projekt nicht passen
  (dann bleibt im Audit-Log der Ausschluss protokolliert).
- **Keine Pflicht-Felder auf bestehenden Entitäten.** Tag ist
  optional. Projekte ohne Tags verhalten sich wie heute.

## Alternativen (verworfen)

- **A) Compliance als separate Module** — würde doppelt Strukturen
  pflegen (Arbeitspakete *und* Compliance-Checklisten), trennt sich
  schlecht vom normalen Projekt-Flow.
- **B) Nur Doku, keine Mechanik** — erfahrungsgemäß unwirksam: das
  Problem ist ja gerade, dass Checklisten *nicht* benutzt werden.
- **C) Vollautomatische Blockaden** — zu starr, blockiert legitime
  Ausnahmen. Stattdessen „Hinweis + Todo mit Owner" (siehe oben).

## Offene Punkte

- **Wer besitzt die Tag-Registry?** Tenant-Admin (siehe EP-16-ST-01).
- **Wie verhalten sich Tag-Templates bei Override?** Entscheidung in
  EP-14-ST-03-Anlehnung: nur additiv.
- **Legal-Review der Default-Templates**: vor Go-Live durch
  Rechts-/QM-Partner.
