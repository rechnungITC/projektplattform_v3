# M&A Project Execution Readiness

**Stand:** 2026-06-23  
**Zweck:** Sichtbar machen, was heute schon vorhanden ist und was noch gebaut werden muss, damit M&A-Projekte in der Plattform fachlich durchgefuehrt werden koennen.

Dieses Dokument ist der operative Readiness-Guide fuer PROJ-94-132. Es ergaenzt die Architektur-ADR [`docs/decisions/ma-domain-architecture.md`](decisions/ma-domain-architecture.md) und die Sequenzierungsanalyse [`docs/ma-epic-sequencing-2026-06-15.md`](ma-epic-sequencing-2026-06-15.md).

## Kurzstatus

Die Plattform kann mit PROJ-94 ein M&A-Projekt als eigenen Projekttyp anlegen, die strategische Grundlage erfassen, Mandatsstatus fuehren, Need-to-Know auf dem M&A-Profil anwenden und Aenderungen auditieren. Das ist die notwendige Wurzel fuer den Deal-Raum, aber noch keine vollstaendige M&A-Durchfuehrung.

**Aktueller Produktstand am 2026-09-02** (nachgezogen in PROJ-167; die Fassung vom 2026-06-23 war
in **jeder** Zeile überholt — sie fuehrte PROJ-94 als "PR #168 offen", die DD-Kette als "offen" und
Transaktion/PMI als "geplant", waehrend inzwischen 34 der 40 M&A-Slices ausgeliefert sind):

| Bereich | Status | Bedeutung |
|---|---|---|
| M&A-Projektanlage / strategische Grundlage | **PROJ-94 `Deployed / full`** | Deal-Raum anlegbar, Mandatsstand gefuehrt, Need-to-Know auf dem Profil, Aenderungen auditiert. |
| Need-to-Know Foundation | **PROJ-100 `full` · 100b `full` · 100c `mvp`** | Klassifikation, Berechtigungsprofile und 4-Augen-Freigabe sind live; das Rezept traegt inzwischen 20 Tabellen. |
| M&A-Phasenmodell / Target-Screening | **PROJ-95 `mvp` · PROJ-96 `alpha`** | 10-Phasen-Preset aktivierbar, Projekt-Vorlagen als Katalog-Lesesicht (Deep-Editor offen). |
| Rollen / RACI / externe Berater | **PROJ-97 `full` · 99/128/129 je `mvp`** | Advisor-Mandat, NDA-Gate und Klassifikations-UX sind live; `can_access_classified` verengt Externe zusaetzlich. |
| Due Diligence | **PROJ-112-116 alle `mvp`** | Streams, Fragenkatalog, Findings, externe Datenraum-Verweise und DD-Report sind vollstaendig ausgeliefert. |
| Governance / Reporting / Audit | **PROJ-110/111 `mvp` · 117/118/119 `full` · 130 `mvp` · 131/132 `full`** | Stage-Gates, Entscheidungslog, Gremien, Kommunikationsmatrix, luekenloser Audit-Trail und beide Reporting-Ebenen sind live. |
| Transaktion / Closing | **PROJ-120 `mvp` · 122 `mvp`** — offen: **121, 123, 124** | Bewertungsmodell und SPA-Issues sind live. Kaufpreis-Bridge (121) und Closing Conditions (123) sind **baubar**, alle ihre Abhaengigkeiten ausgeliefert; 123 ist die **einzige** verbleibende MVP-Pflicht des Epics. Closing-Durchfuehrung (124) wartet auf 123 und auf den Epic-K-Zyklus. |
| PMI (Epic K) | offen: **125, 126, 127** — **nicht startbar** | Abhaengigkeitszyklus: `125 → {126, 127}`, `126 → {127}`, `127 → {125, 126}`. **Keine** der drei ist zuerst baubar. Kein technisches Hindernis, sondern ein Struktur-Defekt der Angaben (PROJ-167). |

**Die Zahl, die den Reifegrad wirklich einordnet — live gegen Prod gemessen am 2026-09-02:** das
M&A-Epic hat **null Nutzung**. 0 Projekte mit `project_type = 'ma'` (auch keine weich geloeschten),
0 Profile, 0 Bewertungen, 0 SPA-Issues, 0 DD-Findings, 0 DD-Fragen, 0 Stage-Gates, 0 Phasen — bei 34
ausgelieferten Slices. Der erste Pilot ist ERP, nicht M&A (siehe `docs/PRD.md`, Erfolgsmetriken).
Das macht nichts davon falsch, aber es aendert die Lesart dieses Dokuments: **die Reihenfolge der
verbleibenden Arbeit ist frei waehlbar** statt von einem laufenden Deal erzwungen, und "ist die
Plattform M&A-bereit" ist heute keine Frage der Features, sondern eine Frage des ersten echten Deals.

## Was "M&A-Projekt durchfuehren" minimal bedeutet

Ein M&A-Projekt gilt in der Plattform erst dann als durchfuehrbar, wenn ein Deal Lead durchgehend diese Kette ausfuehren kann:

1. **Deal anlegen und Mandat klaeren:** M&A-Projekt aus dem Dashboard/Wizard anlegen, Sponsor/Deal Lead/Zielsetzung/Mandatsstand setzen, strategische Grundlage versioniert pflegen.
2. **Zugriff sicher steuern:** Need-to-Know fuer Deal-Team, externe Berater und vertrauliche Artefakte setzen, pruefen und auditieren.
3. **M&A-Phasen starten:** Mandat freigeben, M&A-Phasenmodell initialisieren, Phase 2 Target-Screening sichtbar freischalten.
4. **Team und Verantwortlichkeiten besetzen:** Rollen, RACI, externe Advisor und Vertretungen projektbezogen zuordnen.
5. **DD strukturieren:** DD-Streams anlegen, Verantwortliche zuordnen, Fragenkatalog und Q&A fuehren.
6. **Findings und Red Flags fuehren:** Findings bewerten, quantifizieren, Risiken/Massnahmen ableiten und Deal-Breaker eskalieren.
7. **Gate-Entscheidung treffen:** Stage-Gate vorbereiten, formale Entscheidung dokumentieren, Begruendung und Audit-Trail sichern.
8. **Report erzeugen:** DD-/Red-Flag-Report als entscheidungsfaehige Managementsicht exportieren.

Alles danach ist wichtig, aber nicht Voraussetzung fuer den ersten DD-zentrierten M&A-Pilot: Bewertung/Kaufpreis, SPA, Signing/Closing, Day-1/100-Tage-Plan, Synergien, PMI und Management-Dashboards.

## Minimaler Build-Pfad zum DD-Pilot

Diese Reihenfolge ist der kuerzeste Pfad von "M&A-Projekt anlegbar" zu "DD fachlich durchfuehrbar":

| Reihenfolge | Feature | Muss liefern | Warum blockierend |
|---|---|---|---|
| 1 | PROJ-94 | M&A-Projektanlage, strategische Grundlage, Mandatsstatus, Audit, Need-to-Know auf Profil | Wurzelobjekt fuer alle Folgeartefakte. |
| 2 | PROJ-100b | Clearance-UX, 4-Augen/Delegation, "wer darf was sehen", RPC-Hygiene | Ohne bedienbare Vertraulichkeit ist reale M&A-Arbeit zu riskant. |
| 3 | PROJ-95 | M&A-Method-Catalog mit 10 Phasen und Gate-Triggern; Mandat approved -> Target-Screening | Ohne Phasenmodell bleibt das Projekt ein Container ohne Ablauf. |
| 4 | PROJ-97 | Rollen/RACI auf Projekt, Phase, Stream und Deliverable | Ohne klare Verantwortlichkeit keine DD-Steuerung. |
| 5 | PROJ-99 + 128/129 | Externe Berater, NDA-Status, Inner-Circle/Klassifikation | DD braucht externe Advisor und streng kontrollierte Sichtbarkeit. Tech-Design steht seit 2026-06-23; Build offen. |
| 6 | PROJ-101 + 102/127 | Aufgaben und Workstreams als Reuse/Extension auf PROJ-9 | Operative Steuerung der DD-Arbeit. |
| 7 | PROJ-112 | DD-Streams als Backbone | Struktur fuer Commercial/Financial/Tax/Legal/HR/IT/Operations-DD. |
| 8 | PROJ-113 | Fragenkatalog und Q&A | Standardisierter Informationsbedarf und Nachverfolgung. |
| 9 | PROJ-114 | DD-Findings mit Bewertung und Quantifizierung | Kernartefakt fuer Kaufpreis, SPA und Integration. |
| 10 | PROJ-108 + 109/107 | Red-Flags, Massnahmen, Risiko-Verknuepfung | Eskalation und Nachsteuerung aus Findings. |
| 11 | PROJ-110 + 111 | Stage-Gates und Management-Entscheidungen | Formale Go/No-Go-Entscheidungen. |
| 12 | PROJ-116 | DD-Bericht / Red-Flag-Report | Entscheidungsfaehiges Ergebnis fuer Sponsor/SteerCo. |

## Nicht doppelt bauen

Die M&A-Domaene bleibt eine Spezialisierung des Plattform-Cores:

| M&A-Bedarf | Core-Anchor | Regel |
|---|---|---|
| Projektcontainer | PROJ-2 / PROJ-5 / PROJ-6 | M&A ist `project_type='ma'` mit Label "M&A-Projekt", kein eigenes Modul. |
| Phasen | PROJ-19 / PROJ-6 | PROJ-95 liefert M&A-Methode/Preset, keine zweite Phasentabelle. |
| Aufgaben | PROJ-9 | PROJ-101 nutzt `work_items`, keine separate Aufgabenwelt. |
| Risiken, Decisions, Open Items | PROJ-20 | PROJ-107/109/111 erweitern und konfigurieren, nicht neu bauen. |
| Audit | PROJ-10 | PROJ-130 ist Konfiguration/Hygiene, kein neues Audit-System. |
| Approval / Stage-Gates | PROJ-31 | PROJ-110 modelliert M&A-Gates darauf. |
| Reporting | PROJ-21 / PROJ-64 | PROJ-116/131/132 sind Presets/Aggregationen. |
| Need-to-Know | PROJ-100/129 | Additiver RLS-Sublayer unter Tenant-RLS, nie Ersatz der Tenant-Isolation. |

## Release-Schnitt

**Release A - Deal Setup sicher produktiv machen**

- PROJ-94 nach main mergen und deployen.
- PROJ-100b als Bedien- und Governance-Schicht fuer Need-to-Know bauen.
- PROJ-95 und PROJ-97 umsetzen, damit aus dem M&A-Container ein steuerbarer Deal-Raum wird.

**Release B - DD-Pilot**

- PROJ-99/128/129 fuer externe Berater und NDA/Klassifikation. Architektur steht; Backend/Frontend/QA offen.
- PROJ-101/102/112 fuer Workstreams, Aufgaben und DD-Struktur.
- PROJ-113/114/108/109 fuer Q&A, Findings, Red-Flags und Massnahmen.
- PROJ-110/111/116 fuer Gate-Entscheidung und DD-Report.

**Release C - Transaktion und PMI**

- PROJ-120/121 fuer Bewertung und Kaufpreis.
- PROJ-122/123/124 fuer SPA, Signing/Closing und Uebergabe.
- PROJ-125/126/127 fuer Day-1/100-Tage-Plan, Synergien und IMO/PMI-Steuerung.
- PROJ-131/132 fuer Management- und operatives Reporting.

## Harte Readiness-Gates

Ein echtes M&A-Projekt darf erst produktiv gefuehrt werden, wenn diese Gates gruen sind:

- **Security:** Need-to-Know-Pentest fuer jede neue M&A-Tabelle und jeden SECURITY-DEFINER-RPC.
- **Audit:** Jede Aenderung an strategischer Grundlage, Rollen, DD-Findings, Gates und Entscheidungen ist feldgenau nachvollziehbar.
- **No parallel core:** Keine neuen Tabellen fuer generische Aufgaben, Phasen, Risiken, Decisions oder Audit, solange ein Core-Anchor existiert.
- **Class-3-Trennung:** M&A-Vertraulichkeit ist nicht automatisch Datenschutz-Class-3; personenbezogene Target-Daten bleiben aber Class-3 und gehen nicht an externe Modelle.
- **Reportability:** DD-Findings und Red-Flags muessen vor Gate-Entscheidungen reportbar sein.
- **Operational path:** Jede fachliche Aktion hat einen UI-Pfad, nicht nur SQL/RPC.

## Aktuelle Entscheidung

**Die hier bis 2026-09-02 empfohlene Kette ist vollstaendig abgearbeitet.** Sie lautete:

```
PROJ-100b -> PROJ-95 -> PROJ-97 -> PROJ-99/128/129 -> PROJ-112 -> PROJ-113 -> PROJ-114 -> PROJ-108 -> PROJ-110/111 -> PROJ-116
```

Stand heute: **PROJ-108 ist `Superseded`** (von PROJ-114 absorbiert, CIA 2026-06-26 — "Red Flag" ist
kein eigenes Datenkonzept, sondern ein hochseveres `dd_finding`), **alle uebrigen sind `Deployed`**.
Aus dem anlegbaren M&A-Projekt ist damit ein durchfuehrbarer DD-Deal-Raum geworden, und der Satz
"erst danach lohnen Kaufpreis-Bridge, SPA, Closing und PMI" beschreibt kein spaeter mehr, sondern
**jetzt**.

**Was als naechstes wirklich offen ist** (geerdet in PROJ-167, 2026-09-02):

1. **PROJ-123 — Closing Conditions.** Die **einzige** verbleibende MVP-Pflicht des Epics
   (`Highest / Must (MVP)`), alle vier Abhaengigkeiten ausgeliefert, und `dd_questions` ist ein
   Feld-fuer-Feld fast deckungsgleiches Vorbild. Neu waeren nur die Typ-Spalte und der
   Erfuellungsgrad je Typ.
2. **PROJ-121 — Kaufpreis-Bridge.** Ebenfalls unblockiert; das Versionsmuster existiert in
   `ma_valuations`, neu waere Kopf plus Bestandteile-Kind-Tabelle. Ein Andockpunkt fehlt:
   `ma_valuation_links` kennt nur `dd_finding`, PROJ-120 hat den Erweiterungs-Kontrakt hinterlegt.
3. **PROJ-124 — Closing-Durchfuehrung.** Wartet fachlich echt auf 123; die zusaetzlich notierte
   Abhaengigkeit auf `K1`/`K2` ist zu pruefen (ein Closing-Vollzug braucht keinen fertigen
   100-Tage-Plan, hoechstens eine Uebergabestelle).
4. **Epic K (125/126/127) — zuerst den Zyklus aufloesen, dann bauen.** `125 → {126, 127}`,
   `126 → {127}`, `127 → {125, 126}`: keine der drei ist zuerst baubar. Aussichtsreichster Ansatz
   ist **PROJ-127**, weil der Zyklus in beide Richtungen an ihm haengt und eine IMO-Steuerung
   fachlich die Klammer ist, die die anderen beiden traegt statt ihr Ergebnis zu sein. Vorher zu
   klaeren: ob das ausgelieferte `workstreams` (PROJ-102) wiederverwendet wird statt einer zweiten
   Struktur.

**Und die Rahmenbedingung, die alles davon relativiert:** das Epic hat **null Nutzung** in
Produktion (Messung oben). Keine dieser vier Positionen blockiert heute einen Nutzer. Die
Reihenfolge ist daher eine Produktentscheidung, nicht eine technische Notwendigkeit.
