# M&A Project Execution Readiness

**Stand:** 2026-06-23  
**Zweck:** Sichtbar machen, was heute schon vorhanden ist und was noch gebaut werden muss, damit M&A-Projekte in der Plattform fachlich durchgefuehrt werden koennen.

Dieses Dokument ist der operative Readiness-Guide fuer PROJ-94-132. Es ergaenzt die Architektur-ADR [`docs/decisions/ma-domain-architecture.md`](decisions/ma-domain-architecture.md) und die Sequenzierungsanalyse [`docs/ma-epic-sequencing-2026-06-15.md`](ma-epic-sequencing-2026-06-15.md).

## Kurzstatus

Die Plattform kann mit PROJ-94 ein M&A-Projekt als eigenen Projekttyp anlegen, die strategische Grundlage erfassen, Mandatsstatus fuehren, Need-to-Know auf dem M&A-Profil anwenden und Aenderungen auditieren. Das ist die notwendige Wurzel fuer den Deal-Raum, aber noch keine vollstaendige M&A-Durchfuehrung.

**Aktueller Produktstand am 2026-06-23:**

| Bereich | Status | Bedeutung |
|---|---|---|
| M&A-Projektanlage / strategische Grundlage | PROJ-94 QA PASS, PR #168 offen | Deal-Raum kann angelegt und mit Mandat, Sponsor, Deal Lead, Deal-Rationale, Suchprofil, Ausschlusskriterien und Investitionsrahmen gefuellt werden. Merge/Deploy von PR #168 bleibt der Produktiv-Handoff. |
| Need-to-Know Foundation | PROJ-100a Approved | Klassifizierte Objekte koennen tenant-intern zusaetzlich eingeschraenkt werden; PROJ-94 nutzt dieses Rezept bereits auf `ma_project_profiles`. PROJ-100b bleibt fuer Clearance-UX, 4-Augen und Hygiene. |
| M&A-Phasenmodell / Target-Screening | offen, PROJ-95 | Mandatsfreigabe erzeugt heute nur das Gate-Flag. Die fachliche Phase 2 entsteht erst mit dem M&A-Method-Catalog. |
| Rollen / RACI / externe Berater | offen, PROJ-97/99/128/129 | Sponsor und Deal Lead sind vorhanden; vollstaendige M&A-Rollen, Advisor-Zugaenge, NDA und Inner-Circle-Profile fehlen noch. |
| Due Diligence | offen, PROJ-112-116 | DD-Streams, Fragenkatalog, Q&A, Findings, Red-Flags und DD-Report sind der naechste echte Pilot-Wert. |
| Transaktion / Closing / PMI | geplant, PROJ-120-127 | Bewertungsmodell, Kaufpreis-Bridge, SPA, Closing Conditions, Day-1/100-Tage-Plan und Synergie-Tracking sind spaetere Ausbauwellen. |

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
| 5 | PROJ-99 + 128/129 | Externe Berater, NDA-Status, Inner-Circle/Klassifikation | DD braucht externe Advisor und streng kontrollierte Sichtbarkeit. |
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

- PROJ-99/128/129 fuer externe Berater und NDA/Klassifikation.
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

Die naechste fachlich sinnvolle Arbeit nach PROJ-94 ist nicht Transaktion oder PMI, sondern:

```
PROJ-100b -> PROJ-95 -> PROJ-97 -> PROJ-99/128/129 -> PROJ-112 -> PROJ-113 -> PROJ-114 -> PROJ-108 -> PROJ-110/111 -> PROJ-116
```

Damit wird aus dem anlegbaren M&A-Projekt ein durchfuehrbarer DD-Deal-Raum. Erst danach lohnen Kaufpreis-Bridge, SPA, Closing und PMI.
