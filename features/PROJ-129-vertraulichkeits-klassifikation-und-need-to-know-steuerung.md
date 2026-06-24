---
id: PROJ-129
title: "Vertraulichkeits-Klassifikation und Need-to-know-Steuerung"
issue_type: Story
epic_code: L
epic_title: "Vertraulichkeit, NDA & Audit"
priority: Highest
priority_source: "Must (MVP)"
labels: ["ma-platform", "epic-l", "mvp"]
dependencies: ["B1", "B4", "L1", "L3"]
roles: ["Deal Lead", "Legal Counsel", "Executive Sponsor", "IT-Sicherheit", "PMO-Lead"]
summary_for_jira: "[L2] Vertraulichkeits-Klassifikation und Need-to-know-Steuerung"
---

# PROJ-129: Vertraulichkeits-Klassifikation und Need-to-know-Steuerung

## Status: In Progress (Backend + Frontend gebaut 2026-06-24 — Klassifikations-Tab `classification-matrix-tab.tsx` (per-Objekt Wer-darf-was-und-warum) + projektweite Zugriffs-Matrix in der „Governance & Zugriff"-Seite; → /qa. Frontend-Details siehe PROJ-99 „Implementation Notes — Frontend".)
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic L — Vertraulichkeit, NDA & Audit)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND-Foundation** · Andockpunkt: erweitert Class-3-Modell (ADR Fork 2/3). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** L — Vertraulichkeit, NDA & Audit  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP)  
> **Labels:** `ma-platform` · `epic-l` · `mvp`  
> **Abhängigkeiten:** `B1`, `B4`, `L1`, `L3`

**User Story:**

Als Deal Lead möchte ich für jedes Inhaltsobjekt eine Vertraulichkeitsstufe setzen (z. B. Public, Internal, Confidential, Strictly Confidential / Inner Circle) und damit die Sichtbarkeit projekt- und phasenabhängig steuern können, damit das Need-to-know-Prinzip technisch durchgesetzt wird.

**Beschreibung / Kontext:**

Das Modell betont Vertraulichkeit als kritischen Erfolgsfaktor. Die Plattform braucht eine durchgehende Klassifikation, die mit dem Berechtigungskonzept (B4) und mit NDA-Verwaltung (L1) zusammenspielt.

**Akzeptanzkriterien:**

- [ ] Pro Inhaltsobjekt (Projekt-Felder, Aufgaben, Deliverables, Risiken, Findings, Kommunikationsentwürfe, Bewertungen, SPA-Issues) kann eine Klassifikationsstufe gesetzt werden.
- [ ] Vier Stufen sind konfigurierbar (mindestens: Public, Internal, Confidential, Strictly Confidential / Inner Circle).
- [ ] Sichtbarkeit folgt der Klassifikation: höhere Stufen erfordern explizite Mitgliedschaft im Inner Circle, gültige NDA (L1) und entsprechende Rolle (B1/B4).
- [ ] Eine Klassifikation kann durch eine berechtigte Rolle geändert werden; jede Änderung wird im Audit-Trail (L3) protokolliert.
- [ ] Exporte tragen Sichtbarkeitsstufen (z. B. als Wasserzeichen – siehe H3 offene Frage).

**Abgrenzungen (Out of Scope):**

- Keine Inhaltsanalyse zur automatischen Klassifikation.
- Keine externe DLP-Anbindung (Data Loss Prevention) in der Erst-Story.

**Offene Fragen:**

- Welche Stufenbezeichnungen und welche Zahl an Stufen sollen organisationsweit gelten?
- Sollen Exporte aus 'Strictly Confidential' technisch verhindert oder nur protokolliert werden?

**Definition of Ready:**

- [ ] Klassifikationsmodell ist mit Legal, Compliance und Security abgestimmt.
- [ ] Verbindung zu B4 und L1 ist spezifiziert.

**Definition of Done:**

- [ ] Klassifikation kann gesetzt und geändert werden.
- [ ] Sichtbarkeit ist durchgesetzt und getestet (inkl. negativer Tests).
- [ ] Audit-Trail erfasst Klassifikationsänderungen und Zugriffsversuche.

**Abhängigkeiten:**

- B1
- B4
- L1
- L3

**Betroffene Rollen:**

- Deal Lead
- Legal Counsel
- Executive Sponsor
- IT-Sicherheit
- PMO-Lead

---

## Tech Design (Solution Architect) — 2026-06-23

> **Bundle-Bindung:** PROJ-129 liefert die sichtbare Klassifikations- und Kontrollschicht fuer das gemeinsame PROJ-99/128/129-Bundle. PROJ-100a ist die technische Foundation; PROJ-129 macht sie fuer M&A-Objekte bedienbar, pruefbar und mit NDA/Mandat kombinierbar.

### Grundidee in einem Satz

PROJ-129 baut **keine zweite Need-to-Know-Engine**. Es nutzt die in PROJ-100a gebauten Stufen und Clearances und ergaenzt die M&A-spezifische Bedienoberflaeche: Objekte einstufen, Personen freischalten, NDA-/Mandatsstatus sehen und jederzeit beantworten koennen: "Wer darf was sehen?"

### A) Komponenten-Struktur

```
M&A-Projektraum > Governance & Zugriff
+-- Tab "Klassifikation"
    +-- Objektliste
    |   +-- Projektgrundlage
    |   +-- Phasen
    |   +-- Work-Items / DD-Aufgaben
    |   +-- spaetere M&A-Objekte: DD-Streams, Findings, Reports, SPA-Issues
    +-- Stufensteuerung
    |   +-- Standard
    |   +-- Vertraulich
    |   +-- Streng vertraulich / Inner Circle
    +-- Wer-darf-was-sehen Matrix
    |   +-- Person / Rolle / Organisation
    |   +-- Projektrolle
    |   +-- Advisor-Status
    |   +-- NDA-Status
    |   +-- Mandatsstatus
    |   +-- Clearance-Stufe
    +-- Aenderungshistorie
```

Die Matrix ist bewusst eine Governance-Sicht, keine neue Berechtigungstabelle. Sie liest Projektrollen, Advisor-Profile, NDA-Status und PROJ-100a-Clearances zusammen und zeigt, warum Zugriff erlaubt oder blockiert ist.

### B) Datenmodell in Klartext

**Vertraulichkeitsstufe**

MVP nutzt die bereits eingefuehrten PROJ-100a-Stufen:

- `standard`
- `confidential`
- `strict`

Die urspruengliche Fachsprache "Public / Internal / Confidential / Strictly Confidential" wird fuer den MVP so eingeordnet:

- "Internal" entspricht `standard` innerhalb eines authentifizierten Tenants.
- "Confidential" entspricht `confidential`.
- "Strictly Confidential / Inner Circle" entspricht `strict`.
- "Public" ist keine technische In-App-Sichtbarkeitsstufe fuer M&A-Deal-Arbeit, sondern ein Export-/Publikationsfall und bleibt spaeteren Report-/DMS-Regeln vorbehalten.

Diese Entscheidung vermeidet eine riskante Aenderung an der bereits approved PROJ-100a-Foundation.

**Klassifizierbare Objekte**

PROJ-129 wendet das PROJ-100a-Rezept zuerst auf vorhandene oder unmittelbar geplante M&A-Objekte an:

- Projekt und M&A-Profil
- Phasen und Work-Items
- Advisor-Profile und NDA-Objekte
- spaeter DD-Streams, DD-Fragen, DD-Findings, Red-Flags und Reports

Jedes neue M&A-Objekt muss seine Klassifikationsstufe sichtbar tragen und im Audit zeigen, wer sie geaendert hat.

**Zugriffsentscheidung**

Zugriff auf ein Objekt oberhalb `standard` braucht:

- vorhandene Tenant-/Projektberechtigung
- ausreichende PROJ-100a-Clearance
- bei externen Beratern: gueltige NDA
- bei externen Beratern: aktives Mandat

Wenn einer dieser Punkte fehlt, zeigt die UI den Grund: keine Projektrolle, keine Clearance, NDA fehlt/abgelaufen oder Mandat abgelaufen.

### C) Tech-Entscheidungen

- **PROJ-100a bleibt fuehrend:** Die Foundation ist gebaut und pentest-geprueft. PROJ-129 erweitert Bedienbarkeit und Objektabdeckung, nicht die Kernlogik.
- **Keine vierte technische Stufe im MVP:** Eine Erweiterung des Stufenmodells wuerde alle Policies, Tests und bisherigen M&A-Adopter anfassen. Fuer den DD-Pilot reichen die drei geordneten Stufen; "Public" wird spaeter als Export-/DMS-Label behandelt.
- **Wer-darf-was-sehen als Erklaer-View:** Die Matrix beantwortet Governance-Fragen, aber sie vergibt keine Rechte heimlich. Rechte entstehen nur ueber Projektrolle, Advisor/NDA/Mandat und PROJ-100a-Clearance.
- **Default sichtbar, vertraulich explizit:** `standard` bleibt der Startpunkt. Hoehere Stufen brauchen bewusste Klassifizierung und Audit.
- **Class-3 bleibt getrennt:** Datenschutz-Class-3 ist weiterhin eine eigene AI-/Privacy-Achse. Eine `strict`-Clearance erlaubt nie automatisch externe KI-Verarbeitung personenbezogener Daten.
- **Audit ueber PROJ-10:** Jede Klassifikationsaenderung ist feldgenau nachvollziehbar.

### D) Abhaengigkeiten

- **Muss vorhanden sein:** PROJ-100a und PROJ-94.
- **Im Bundle:** PROJ-99 fuer externe Advisor und PROJ-128 fuer NDA-Gate.
- **Soll folgen:** PROJ-112-116, damit DD-Streams, Findings und Reports dieselbe Klassifikation tragen.
- **Neue npm-Pakete:** keine.

### E) Akzeptanzkriterien-Zuordnung

| AC | Erfuellt durch |
|---|---|
| Klassifikation pro Inhaltsobjekt | PROJ-100a-Stufe auf existierenden und neuen M&A-Objekten; Objektliste im Governance-Tab |
| Vier Stufen konfigurierbar | MVP-Entscheidung: drei technische PROJ-100a-Stufen; "Public" wird als Export-/Publikationslabel deferred, um Foundation-Risiko zu vermeiden |
| Sichtbarkeit folgt Klassifikation, NDA und Rolle | kombiniertes Gate aus Projektrolle, Clearance, NDA und Mandat |
| Klassifikation aenderbar und auditiert | berechtigte Rollen + PROJ-10-Historie |
| Exporte tragen Sichtbarkeitsstufen | Label-/Wasserzeichen-Regel als Handoff an PROJ-116/131/132, sobald Reports generiert werden |

### F) QA-/Security-Handoff

QA muss fuer jede neue M&A-Tabelle pruefen: Standard sichtbar, Confidential ohne Clearance blockiert, Strict mit zu niedriger Clearance blockiert, Externer ohne gueltige NDA blockiert, abgelaufenes Mandat blockiert, Cross-Tenant bleibt blockiert, Class-3-Routing bleibt unveraendert.

## Implementation Notes — Backend (2026-06-24)

Teil der gemeinsamen Bundle-Migration `20260623230548_proj99_128_129_advisor_nda_classification.sql` (siehe [[PROJ-99]]). **Keine zweite Need-to-Know-Engine, keine vierte technische Stufe** — MVP nutzt die drei PROJ-100a-Stufen `standard`/`confidential`/`strict` unverändert; „Public" bleibt späteres Export-/DMS-Label.

- **`ma_access_explain(project, level)`** — manager-gated (admin/lead), read-only „Wer darf was sehen, und warum?". Spiegelt die `can_access_classified`-Regel für jeden relevanten Nutzer (Projektmitglieder ∪ Advisor ∪ Clearance-Holder ∪ Tenant-Admins) und liefert pro Nutzer `is_member`, `is_external_advisor`, `mandate_ok`, `nda_ok`, `cleared_level`, `has_access` + `reason` (`baseline`/`admin`/`cleared`/`no_clearance`/`mandate_inactive`/`nda_missing`). **Erklär-View, niemals ein zweites Gate** — selbe Logik wie 100b `who_can_access`, nur reicher um Advisor/NDA/Mandat-Gründe.
- **Class-3 bleibt getrennt:** das Gate erwähnt `privacy_class` nicht (100a-Pentest-Vektor 6 weiter grün); eine `strict`-Clearance erlaubt nie automatisch externe KI-Verarbeitung.

**API:** `GET /api/projects/[id]/access-explain?level=…` oder `?objectType=&objectId=` (löst die Objekt-Stufe auf, mirror 100b `access-overview`). Client-Wrapper `fetchAccessExplain` in `src/lib/ma-project/advisor-nda-api.ts`.

**Live-Smoke (Teil der Bundle-10/10):** `ma_access_explain` liefert für Admin `reason=admin`, für internen cleared Member `cleared`, für Advisor mit Mandat+NDA `cleared`; Negativ-Reasons (`mandate_inactive`/`nda_missing`) durch die Gate-Probes mitbewiesen. Quality-Gates wie [[PROJ-99]].

**Offen:** AC „Klassifikation pro Inhaltsobjekt" für künftige M&A-Objekte (DD-Streams/Findings/Reports) — das PROJ-100a-Rezept (`confidentiality_level` + RESTRICTIVE-Gate) wird angewandt, sobald diese Tabellen existieren (PROJ-112–116). AC „Exporte tragen Sichtbarkeitsstufen" → Handoff an PROJ-116/131/132. Klassifikations-Tab + Wer-darf-was-Matrix-UI → /frontend; Negativtests pro M&A-Tabelle → /qa.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · L — Vertraulichkeit, NDA & Audit_
