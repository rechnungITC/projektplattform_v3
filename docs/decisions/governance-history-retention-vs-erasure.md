# Decision Record — Aufbewahrung der Governance-Historie vs. Löschrecht (DSGVO Art. 17)

**V3-original (kein V2-Erbe)** · Stand: 2026-08-19 · Betrifft: PROJ-Y-148b (aufbauend auf PROJ-20
Invariante #5, PROJ-31, PROJ-33, PROJ-100c, PROJ-105, PROJ-45-β und PROJ-130)

**Input:** CIA-Review 2026-08-19 ([PROJ-Y-148b](../../features/PROJ-Y-148b-dsgvo-art17-governance-payload.md))
· Nutzer-Entscheid 2026-08-19 (Variante V1: Rechtsgrundlage zuerst klären).

**Status:** **Proposed — wartet auf rechtliche Feststellung.**
Dieser Datensatz ist absichtlich unentschieden. Er sammelt die technische Faktenlage und stellt **eine**
Frage, die außerhalb der Architektur beantwortet werden muss. Solange er `Proposed` ist, wird **keine**
der technischen Varianten gebaut (AC-Y148b.1).

---

## Kontext

Fünf Ereignis-Tabellen tragen Governance-Historie und sind append-only: jedes `UPDATE` und `DELETE`
scheitert per Trigger. Die Zusagen stammen aus fünf unabhängigen Slices — PROJ-31 (Genehmigungen),
PROJ-33 (Stakeholder-Profile), PROJ-100c (Vertraulichkeits-Freischaltungen), PROJ-105
(Deliverable-Freigaben) und PROJ-45-β (Mängel). PROJ-Y-148a/c/d haben diese Zusagen im August 2026
gegen drei verschiedene Umgehungswege gehärtet; seit PROJ-Y-148d gilt sie ausnahmslos.

Damit steht sie einem Löschverlangen nach Art. 17 DSGVO gegenüber. Die Lage, **gemessen** am 2026-08-19
gegen die Produktionsdatenbank:

| Befund | Messung |
|---|---|
| Personenbezogene Nutzlast | `stakeholder_profile_audit_events`: **47** Zeilen über **9** von 25 Stakeholdern — 16 `personality` (Big5/OCEAN), 24 `skill`, 7 `escalation`; die Schlüssel `before`/`after` (32×) und `snapshot` (7×) tragen die Profilwerte selbst. `decision_approval_events`: **10** Zeilen (Genehmiger-Listen, 2× Freitext). |
| Weitere Freitextfelder | `deliverable_approval_events.comment` und `construction_defect_events.reason` — **heute leer**, aber `reason` ist bei zwei Ereignistypen per CHECK **pflichtig**, die Fläche wächst also mit der Nutzung. |
| Löschbarkeit der betroffenen Person | **Nicht löschbar.** `23514`, live in zurückgerollter Transaktion — und zwar **auch ohne** Profil-Historie. |
| Ursachen | Von **15** Fremdschlüsseln auf `stakeholders` zielen **vier** auf schreibgeschützte Tabellen. Einer ist **keine** Governance-Insel: `decisions.decider_stakeholder_id` (`ON DELETE SET NULL`) gegen `enforce_decision_immutability` (Invariante #5). |
| Vorgang in der Anwendung | **Keiner.** `src/app/api/projects/[id]/stakeholders/[sid]/route.ts` hat **0** `DELETE`-Handler. |
| Redaktion als Ausweg | Ebenfalls durch die Guards blockiert (`UPDATE` → `23514`). PROJ-130s „Redaktion" ist eine **Export-Maskierung** (`[redacted:class-3]`), keine Überschreibung in der Datenbank — für DB-seitige Redaktion existiert im Bestand **kein** Muster. |

## Die Frage, die zu beantworten ist

> Fällt die Aufbewahrung der Governance-Historie — Genehmigungs-, Freigabe-, Freischaltungs-,
> Mängel- und Stakeholder-Profil-Ereignisse einschließlich ihrer personenbezogenen Nutzlast —
> unter eine Ausnahme des **Art. 17 Abs. 3 DSGVO**, insbesondere
> **lit. b** (Erfüllung einer rechtlichen Verpflichtung) oder **lit. e** (Geltendmachung,
> Ausübung oder Verteidigung von Rechtsansprüchen)?

Sinnvoll getrennt zu beantworten, weil die Kategorien unterschiedlich schutzbedürftig sind und
unterschiedlichen Zwecken dienen:

1. **Genehmigungs- und Freigabe-Historie** (PROJ-31, PROJ-100c, PROJ-105) — Nachweis, wer wann was
   genehmigt hat. Nächstliegender Kandidat für lit. b/e.
2. **Mängel-Historie** (PROJ-45-β) — Bauabwicklung, Gewährleistung, potenziell Beweismittel.
3. **Stakeholder-Profil-Historie** (PROJ-33) — Big5/OCEAN-Persönlichkeitsdaten und Skill-Profile.
   Der **schwächste** Kandidat: sie dient der Projektsteuerung, nicht dem Nachweis, und ist die
   Kategorie, für die ein Löschverlangen am wahrscheinlichsten ist.

Diese Aufteilung ist der Grund, warum die Antwort nicht pauschal ausfallen muss. Denkbar und
wahrscheinlich ist ein gemischtes Ergebnis: 1 und 2 aufbewahrungspflichtig, 3 nicht.

## Folgen je Antwort

**Wenn die Aufbewahrung gedeckt ist** (für alle oder einzelne Kategorien):

- Kein Löschmechanismus wird gebaut. Der Status dieses Datensatzes wird `Accepted` mit der Begründung.
- Zu erfüllen bleibt die **Informationspflicht**: Aufbewahrung und ihr Zweck gehören ins Verzeichnis der
  Verarbeitungstätigkeiten und in die Datenschutzerklärung, und die Oberfläche sagt es bei einem
  Löschverlangen ehrlich (AC-Y148b.2) — nach dem Muster, das PROJ-Y-148a für den Papierkorb etabliert hat.
- **PROJ-Y-148f** wird dann durch Dokumentation gelöst: die Sperre ist gewollt und gehört ausdrücklich in
  die PROJ-20-Spec, statt aus einer Fremdschlüssel-Klausel zu folgen.

**Wenn die Aufbewahrung nicht gedeckt ist** (für mindestens eine Kategorie):

- Variante **V3** (Anonymisierung am Stammobjekt) ist der empfohlene Weg: Personenbezug am
  `stakeholders`-Datensatz auflösen, Historie unberührt, Hash-Kette aus PROJ-130-ε intakt, kein Guard
  umgangen. Sie löst zugleich die Unlöschbarkeit aus PROJ-Y-148f.
- Dann ist zusätzlich zu prüfen, ob die Profilwerte nach Auflösung des Namensbezugs noch personenbezogen
  sind (bei 9 betroffenen Stakeholdern in einem Mandanten ist Re-Identifikation über Kontextwissen nicht
  auszuschließen). Falls ja, reicht V3 nicht und **V2** (Redaktion in der Historie) wird nötig — mit allen
  Auflagen aus dem CIA-Review (Bypass nur über RPC, Admin-Vorbehalt, Selbst-Audit, Ketten-Nachsiegelung,
  geführte Feldliste gegen Über-Redaktion).

## Warum diese Reihenfolge

Technik vor der rechtlichen Feststellung zu bauen, erzeugt einen Löschmechanismus für Daten, die
möglicherweise **aufbewahrt werden müssen** — und dann ist der Mechanismus selbst das Risiko: er öffnet
einen Schreibpfad in nominell unveränderliche Daten, den drei aufeinanderfolgende Slices gerade
geschlossen haben, und er müsste die Hash-Kette berühren, die deren Nachweisbarkeit trägt.

Umgekehrt kostet die Klärung nichts: ist die Aufbewahrung gedeckt, ist die Sache mit Dokumentation
erledigt.

## Was dieser Datensatz nicht tut

Er beantwortet die Rechtsfrage **nicht**. Sie gehört dem Verantwortlichen im Sinne der DSGVO. Die
Architektur liefert die Faktenlage und die Folgen — die Bewertung nicht.

## Offen

- Die Antwort auf die Frage oben, kategorienweise.
- Danach: `Status` auf `Accepted` setzen, Begründung eintragen, und je nach Ergebnis AC-Y148b.2
  (Transparenz) oder V3/V2 (Technik) bauen.
