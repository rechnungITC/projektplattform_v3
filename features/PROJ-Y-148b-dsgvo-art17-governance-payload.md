# PROJ-Y-148b — DSGVO Art. 17 und die append-only Governance-Historie

## Status: Planned
## Deployment Scope: —
<!-- Entscheidungsvorlage (CIA-Review). Bewusst keine Implementierung: die tragende Frage ist eine
     Rechts- und keine Architekturfrage, und die technischen Varianten unterscheiden sich erst
     dahinter. -->

**Created:** 2026-08-19
**Origin:** Q-2 aus der PROJ-Y-148a-Vorlage, dort ausdrücklich nicht mitentschieden. Verschärft durch
PROJ-Y-148d (fünf blockende Inseln) und PROJ-Y-148c (der einzige faktische Tilgungsweg ist entfernt).
**Art:** CIA-Review mit Entscheidungsvorlage. **Kein Code, keine Migration.**
**Nutzer-Entscheid 2026-08-19: Variante V1** — Rechtsgrundlage zuerst klären. Die Frage ist als ADR
[governance-history-retention-vs-erasure.md](../docs/decisions/governance-history-retention-vs-erasure.md)
mit Status `Proposed — wartet auf rechtliche Feststellung` gestellt, kategorienweise beantwortbar.
**PROJ-Y-148f wartet ebenfalls auf diesen Entscheid** (Nutzer-Entscheid 2026-08-19), weil seine
richtige Auflösung davon abhängt.

---

## Kurzfazit

Der Konflikt ist real, aber er sitzt **nicht dort, wo das Followup ihn vermutet**, und zwei seiner
Prämissen halten der Messung nicht stand:

- **Der akute Fall ist nicht der Projekt-Papierkorb, sondern die betroffene Person.** Ein Stakeholder
  ist heute **überhaupt nicht löschbar** — weder mit noch ohne Profil-Historie, und die Anwendung bietet
  dafür auch keinen Weg an.
- **Das im Register benannte Vorbild existiert nicht.** PROJ-130s „Redaktion" ist eine
  **Export-Maskierung**, keine Überschreibung in der Datenbank. Für DB-seitige Redaktion gibt es im
  Bestand kein Muster; die „vorgezeichnete konsistente Richtung" wäre neu zu bauen.
- **Und die vorrangige Frage ist rechtlich, nicht technisch:** Art. 17 Abs. 3 nimmt Verarbeitung aus,
  die zur Erfüllung rechtlicher Verpflichtungen oder zur Geltendmachung von Rechtsansprüchen nötig ist.
  Ob Genehmigungs- und Freigabe-Historie darunter fällt, entscheidet kein Datenmodell.

**Empfehlung: zuerst V1 (Rechtsgrundlage klären und dokumentieren), dann — nur falls nötig — V3
(Anonymisierung am Stammobjekt).** V2 (Redaktion in der Historie) ist der teuerste und
invasivste Weg und wird nicht empfohlen.

---

## Findings

**F-1 — Die Aufgabe betrifft vier Inseln über drei Spaltentypen, nicht „den `payload` von fünf".**
Gemessen: `payload jsonb` existiert nur bei `stakeholder_profile_audit_events` und
`decision_approval_events`. `deliverable_approval_events` trägt `comment text`,
`construction_defect_events` trägt `reason text` — bei den Ereignistypen `zurueckgewiesen`/`verworfen`
ist `reason` per CHECK sogar **pflichtig**, es entstehen dort also zwangsläufig Freitexte.
`ma_clearance_request_events` trägt gar keinen Freitext.

**F-2 — Die reale PII-Fläche, in Zahlen.** `stakeholder_profile_audit_events`: **47** Zeilen, **alle**
mit Nutzlast, über **9** von 25 Stakeholdern — davon **16** `personality` (Big5/OCEAN), **24** `skill`,
**7** `escalation`; die Schlüssel `before`/`after` (32×) und `snapshot` (7×) tragen die Profilwerte
selbst. `decision_approval_events`: **10** Zeilen, alle mit Nutzlast (`approvers` 6×,
`quorum_required` 6×, Freitext `comment` 2×). Die beiden Freitext-Spalten der anderen Inseln sind
**heute leer** (0 Kommentare, 0 Begründungen) — die Fläche wächst also erst mit der Nutzung.

**F-3 — Der akute Fall ist die betroffene Person, nicht das Projekt.** Live in zurückgerollter
Transaktion: das Löschen eines Stakeholders mit 17 Profil-Zeilen (`escalation+personality+skill`)
scheitert mit **`23514`**. Art. 17 ist damit nicht am Papierkorb, sondern schon am einzelnen
Betroffenen nicht erfüllbar.

**F-4 — Vier unabhängige Blockade-Pfade, und einer ist keine Governance-Insel.** Über die **15**
Fremdschlüssel auf `stakeholders` tragen vier eine schreibgeschützte Zieltabelle:
`stakeholder_profile_audit_events.stakeholder_id` (CASCADE) und `.actor_stakeholder_id` (SET NULL),
`decision_approval_events.actor_stakeholder_id` (SET NULL) — und **`decisions.decider_stakeholder_id`
(SET NULL) gegen `enforce_decision_immutability`**. Letzteres ist die Kern-Invariante #5
(„Decisions are immutable"), kein Ereignis-Log. **Ein `ON DELETE SET NULL` auf eine unveränderliche
Tabelle ist ein struktureller Widerspruch:** der Fremdschlüssel will schreiben, der Trigger verbietet es.

**F-5 — Auch ein Stakeholder *ohne* Profil-Historie ist nicht löschbar.** Live bewiesen; der Blocker
ist dann `enforce_decision_immutability` über `decisions.decider_stakeholder_id`. Die Governance-Inseln
sind also nicht die einzige und nicht einmal die häufigste Ursache.

**F-6 — Die Anwendung hat gar keinen Löschpfad.** `src/app/api/projects/[id]/stakeholders/[sid]/route.ts`
enthält **0** `DELETE`-Handler. Art. 17 ist heute nicht nur datenbankseitig blockiert — es gibt keine
Oberfläche, über die ein Löschverlangen umgesetzt werden könnte. Das verschiebt die Dringlichkeit:
es fehlt kein Detail, es fehlt der ganze Vorgang.

**F-7 — Die Register-Prämisse trägt nicht.** Dort steht, PROJ-130 habe „dieselbe Frage mit Redaktion
statt Löschung beantwortet (Wert überschreiben, Zeile und Kette erhalten)". Gemessen: PROJ-130s
Redaktion ist eine **Export-Maskierung** — `src/app/api/audit/export/route.ts` ersetzt fünf Class-3-Felder
beim Export durch `[redacted:class-3]`, die Werte bleiben unverändert in der Datenbank, und
`redaction_off=true` hebt die Maske für Admins auf. Das erfüllt Art. 17 **nicht** (Verbergen ist keine
Löschung). Für DB-seitige Redaktion gibt es im Bestand **kein** Vorbild.

**F-8 — Redaktion wäre selbst durch die Guards verboten.** Live bewiesen: ein `UPDATE` auf
`stakeholder_profile_audit_events.payload` scheitert mit **`23514`**. Jede Variante, die Werte
überschreibt, braucht also denselben kontrollierten Bypass, den PROJ-130 für seinen Grabstein gebaut hat
— und damit einen Schreibpfad in nominell append-only Daten.

**F-9 — Selbstkritisch: die beiden Vorgänger-Slices haben den einzigen faktischen Tilgungsweg
entfernt.** Vor PROJ-Y-148c konnte ein Mandanten-Admin über `hard_delete_project` Governance-Historie
tilgen. Dieser Weg war nicht autorisiert, brach fünf Zusagen und wurde zu Recht zurückgebaut — aber es
ist ehrlich festzuhalten, dass die Lage seither **ohne jeden Notausgang** ist. Für den *direkten*
Stakeholder-Pfad hat sich nichts verschlechtert: der damalige Ausweg hing am Sitzungsschalter, den nur
`hard_delete_project` setzte.

## Risks

- **R-1 (hoch, V2/V3)** — Jeder Schreibpfad in die Inseln berührt die **Hash-Kette aus PROJ-130-ε**.
  Wird ein Wert überschrieben, ohne die Anker nachzuziehen, meldet der Verifikationslauf einen Bruch —
  also genau das Signal, das Manipulation anzeigen soll. Ein Redaktionspfad muss die Kette entweder
  mit-neu-siegeln oder die redigierte Zeile ausdrücklich als solche kennzeichnen.
- **R-2 (mittel)** — **Wer darf redigieren?** Muster wäre der Admin-Vorbehalt aus PROJ-130-γ4
  (`redaction_off` ist Admin-only). Ein Betroffener darf seine eigene Governance-Historie nicht selbst
  ändern können, sonst wird aus dem Löschrecht ein Manipulationsrecht.
- **R-3 (mittel)** — Der Vorgang ist **selbst auditpflichtig**, und zwar in einem Protokoll, das er
  nicht redigieren kann. Sonst ist die Redaktion nicht von einer Fälschung unterscheidbar.
- **R-4 (mittel)** — **Über-Redaktion.** Die Governance-Aussage muss erhalten bleiben (dass jemand zu
  einem Zeitpunkt genehmigt hat); fallen darf nur der Personenbezug. Eine Redaktion, die
  `quorum_required` oder `response` mitnimmt, zerstört den Nachweis, den die Zusage schützen soll.
- **R-5 (hoch, alle Varianten)** — **Die Rechtsfrage ist nicht technisch beantwortbar.** Art. 17 Abs. 3
  lit. b und e nehmen Verarbeitung aus, die zur Erfüllung einer rechtlichen Verpflichtung bzw. zur
  Geltendmachung von Rechtsansprüchen erforderlich ist. Fällt Genehmigungs-Historie darunter, ist die
  Aufbewahrung rechtmäßig und **es braucht keinen Löschpfad, sondern eine dokumentierte Begründung**.
  Fällt sie nicht darunter, ist Technik nötig. Diese Reihenfolge nicht umzudrehen, ist der wichtigste
  Punkt dieses Reviews.

---

## Varianten

### V1 — Rechtsgrundlage klären und dokumentieren

Prüfen, ob die Aufbewahrung unter Art. 17 Abs. 3 fällt, das Ergebnis als ADR festhalten, und die
Aufbewahrung im Verzeichnis der Verarbeitungstätigkeiten sowie in der Datenschutzerklärung benennen.
Technisch: **nichts**. Zusätzlich sinnvoll: die Oberfläche sagt bei einem Löschverlangen ehrlich, was
aufbewahrt wird und warum — analog zu dem, was PROJ-Y-148a für den Papierkorb getan hat.

**Kosten** ~0 PT Code, ein Rechtsentscheid. **Risiko** niedrig. **Löst** die Frage, wenn die Antwort
„rechtmäßig" ist. **Löst nicht**, wenn nicht.

### V2 — Redaktion in der Historie

Ein kontrollierter Schreibpfad überschreibt personenbezogene Teile der Nutzlast (`before`/`after`,
`snapshot`, `comment`, `reason`) durch einen Redaktionsmarker; Zeile, Zeitstempel, Ereignistyp und
Struktur bleiben. Braucht: Bypass der vier Guards (F-8), Admin-Vorbehalt (R-2), Selbst-Audit (R-3),
Ketten-Nachsiegelung (R-1) und eine Feldliste, die R-4 respektiert.

**Kosten** hoch (~3 PT, Migration + RPC + UI + Pentest). **Risiko** mittel–hoch. **Nachteil:** öffnet
einen Schreibpfad in Daten, deren Wert gerade darin liegt, keinen zu haben — und PROJ-Y-148a/c/d haben
drei Slices darauf verwendet, solche Pfade zu schließen.

### V3 — Anonymisierung am Stammobjekt

Nicht die Historie anfassen, sondern den **Personenbezug am `stakeholders`-Datensatz** auflösen: Name,
Kontaktdaten, `linked_user_id`, Notizen überschreiben, die Zeile als anonymisiert kennzeichnen. Die
Historie verweist danach auf eine UUID ohne Personenbezug — sie bleibt vollständig und unverändert, die
Hash-Kette bleibt intakt, und **kein Guard muss umgangen werden**.

Offen zu prüfen: ob die Profilwerte selbst (`before`/`after` mit Big5-Scores) nach Auflösung des
Namensbezugs noch personenbezogen sind. Bei 9 betroffenen Stakeholdern in einem Mandanten ist eine
Re-Identifikation über Kontextwissen nicht auszuschließen — das ist der Punkt, an dem V3 an V2 grenzen
kann.

**Kosten** mittel (~1,5 PT). **Risiko** niedrig–mittel. **Vorteil:** löst F-3, F-4 und F-5 in einem, weil
nichts gelöscht wird — auch der `decisions`-Blocker entfällt, denn `decider_stakeholder_id` bleibt
gesetzt. **Braucht zusätzlich** den in F-6 fehlenden Vorgang (Oberfläche + Route).

---

## Empfehlung

**Zuerst V1, dann falls nötig V3. V2 nicht.**

**Tragender Grund:** die Reihenfolge ist nicht Geschmack. Baut man V2 oder V3, ohne die Rechtsfrage
geklärt zu haben, entsteht ein Löschmechanismus für Daten, die man möglicherweise aufbewahren **muss** —
und dann ist der Mechanismus selbst das Risiko. Ist die Aufbewahrung rechtmäßig, kostet V1 keine Zeile
Code und die Sache ist erledigt.

**Warum V3 vor V2**, falls Technik nötig wird: V3 erreicht dasselbe Schutzziel, ohne einen Schreibpfad in
append-only Daten zu öffnen, ohne die Hash-Kette zu berühren und ohne einen der vier Guards zu umgehen.
Es löst zusätzlich F-4/F-5 (den `decisions`-Blocker) mit, die V2 unangetastet ließe — V2 macht die
Historie redigierbar, aber den Stakeholder immer noch nicht löschbar.

**Was in jedem Fall zu tun ist, unabhängig vom Entscheid:** F-6. Dass die Anwendung keinen Vorgang für
ein Löschverlangen hat, ist von der Rechtsfrage unabhängig. Und **F-4 ist ein eigener Befund**: das
`ON DELETE SET NULL` auf `decisions` ist ein Modellierungswiderspruch, der unabhängig von Art. 17
aufzulösen ist — heute macht er jeden Stakeholder unlöschbar, der je eine Entscheidung getroffen hat.

---

## Akzeptanzkriterien

### Gemeinsam

- [~] **AC-Y148b.1** — Die Rechtsfrage ist **gestellt und dokumentiert**, die Antwort steht aus.
      ADR [governance-history-retention-vs-erasure.md](../docs/decisions/governance-history-retention-vs-erasure.md),
      Status `Proposed`: die Frage ist nach Art. 17 Abs. 3 lit. b/e formuliert und in **drei**
      Kategorien getrennt (Genehmigungs-/Freigabe-Historie · Mängel-Historie ·
      Stakeholder-Profile), weil ein gemischtes Ergebnis wahrscheinlich ist — die Profildaten sind
      der schwächste Kandidat für eine Ausnahme. Die Folgen je Antwort stehen im ADR.
      **Solange `Proposed`, wird keine der technischen Varianten gebaut.**
- [ ] **AC-Y148b.2** — Die Oberfläche sagt bei einem Löschverlangen ehrlich, was aufbewahrt wird und
      warum (Muster: die Absage aus PROJ-Y-148a).
- [ ] **AC-Y148b.3** — F-4 ist adressiert: der Widerspruch `ON DELETE SET NULL` gegen
      `enforce_decision_immutability` ist entweder aufgelöst oder als bewusste Sperre dokumentiert.

### Nur V2 (Redaktion)

- [ ] **AC-Y148b.V2-1** — Redaktion nur über eine `SECURITY DEFINER`-RPC, Admin-Vorbehalt, kein
      Actor-Parameter.
- [ ] **AC-Y148b.V2-2** — Der Vorgang schreibt einen Eintrag in ein Protokoll, das er selbst nicht
      redigieren kann.
- [ ] **AC-Y148b.V2-3** — Die Governance-Aussage bleibt erhalten; die redigierten Felder sind eine
      geführte Liste, nicht „die ganze Nutzlast".
- [ ] **AC-Y148b.V2-4** — Die Hash-Kette (PROJ-130-ε) ist nach der Redaktion **verifizierbar**: der
      Prüflauf meldet keinen Bruch, oder die Zeile ist ausdrücklich als redigiert gekennzeichnet.
- [ ] **AC-Y148b.V2-5** — Live-Pentest: Nicht-Admin geblockt, Über-Redaktion unmöglich,
      Kette danach intakt, 0 Rückstände.

### Nur V3 (Anonymisierung)

- [ ] **AC-Y148b.V3-1** — Der Personenbezug am `stakeholders`-Datensatz ist auflösbar (Name, Kontakt,
      `linked_user_id`, Notizen), die Zeile bleibt und ist als anonymisiert gekennzeichnet.
- [ ] **AC-Y148b.V3-2** — **Kein Guard wird umgangen und keine Insel angefasst**; die Hash-Kette bleibt
      unberührt. Nachzuweisen, nicht anzunehmen.
- [ ] **AC-Y148b.V3-3** — Geprüft und dokumentiert, ob die Profilwerte nach Anonymisierung noch
      personenbezogen sind; falls ja, ist V3 allein nicht ausreichend.
- [ ] **AC-Y148b.V3-4** — Der Vorgang ist auditpflichtig und admin-gegatet.

## Definition of Done

- [ ] Die Rechtsfrage ist entschieden (AC-Y148b.1) — **vor** jeder Implementierung.
- [ ] Die gewählte Variante ist gebaut, live gegen Prod nachgewiesen, 0 Rückstände.
- [ ] Buchführung: diese Spec, `features/INDEX.md`, `features/OPEN-DEFERRED-STATUS.md`.

## Was diese Vorlage nicht entscheidet

Die Rechtsfrage. Sie gehört dem Verantwortlichen im Sinne der DSGVO, nicht dem Datenmodell — und dieser
Review liefert dafür die Faktenlage, keine Antwort.
