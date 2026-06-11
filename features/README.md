# Feature Specifications

Dieser Ordner enthält detaillierte Feature Specs vom Requirements Engineer.

## Naming Convention
`PROJ-X-feature-name.md`

Beispiele:
- `PROJ-1-user-authentication.md`
- `PROJ-2-kanban-board.md`
- `PROJ-3-file-attachments.md`

## Was gehört in eine Feature Spec?

### 1. User Stories
Beschreibe, was der User tun möchte:
```markdown
Als [User-Typ] möchte ich [Aktion] um [Ziel zu erreichen]
```

### 2. Acceptance Criteria
Konkrete, testbare Kriterien:
```markdown
- [ ] User kann Email + Passwort eingeben
- [ ] Passwort muss mindestens 8 Zeichen lang sein
- [ ] Nach Registration wird User automatisch eingeloggt
```

### 3. Edge Cases
Was passiert bei unerwarteten Situationen:
```markdown
- Was passiert bei doppelter Email?
- Was passiert bei Netzwerkfehler?
- Was passiert bei gleichzeitigen Edits?
```

### 4. Tech Design (vom Solution Architect)
```markdown
## Database Schema
CREATE TABLE tasks (...);

## Component Architecture
ProjectDashboard
├── ProjectList
│   └── ProjectCard
```

### 5. QA Test Results (vom QA Engineer)
Am Ende des Feature-Dokuments fügt QA die Test-Ergebnisse hinzu:
```markdown
---

## QA Test Results

**Tested:** 2026-01-12
**App URL:** http://localhost:3000

### Acceptance Criteria Status
- [x] AC-1: User kann Email + Passwort eingeben
- [x] AC-2: Passwort mindestens 8 Zeichen
- [ ] ❌ BUG: Doppelte Email wird nicht abgelehnt

### Bugs Found
**BUG-1: Doppelte Email-Registrierung**
- **Severity:** High
- **Steps to Reproduce:** 1. Register with email, 2. Try again with same email
- **Expected:** Error message
- **Actual:** Silent failure
```

### 6. Deployment Status (vom DevOps Engineer)
```markdown
---

## Deployment

**Status:** ✅ Deployed
**Deployed:** 2026-01-13
**Production URL:** https://your-app.vercel.app
**Git Tag:** v1.0.0-PROJ-1
```

## Workflow

1. **Requirements Engineer** erstellt Feature Spec
2. **User** reviewed Spec und gibt Feedback
3. **Solution Architect** fügt Tech-Design hinzu
4. **User** approved finales Design
5. **Frontend/Backend Devs** implementieren (dokumentiert via Git Commits)
6. **QA Engineer** testet und fügt Test-Ergebnisse zum Feature-Dokument hinzu
7. **DevOps** deployed und fügt Deployment-Status zum Feature-Dokument hinzu

## Status-Tracking

Feature-Status wird direkt im Feature-Dokument getrackt:
```markdown
# PROJ-1: Feature Name

**Status:** 🔵 Planned | 🟡 In Progress | ✅ Deployed
**Created:** 2026-01-12
**Last Updated:** 2026-01-12
```

**Status-Bedeutung:**
- 🔵 Planned – Requirements sind geschrieben, ready for development
- 🟡 In Progress – Wird gerade gebaut
- ✅ Deployed – Live in Production

**Git als Single Source of Truth:**
- Alle Implementierungs-Details sind in Git Commits
- `git log --grep="PROJ-1"` zeigt alle Änderungen für dieses Feature
- Keine separate FEATURE_CHANGELOG.md nötig!

---

## M&A-Platform Backlog (PROJ-94–PROJ-132)

Dieser Block dokumentiert das ehemals separate **M&A-Projektplattform-Backlog** (39 User Stories, ursprünglich mit A1–M2 nummeriert). Die Stories wurden in das fortlaufende PROJ-Schema überführt (A1 → PROJ-94 … M2 → PROJ-132) und in `INDEX.md` aufgenommen. Jede Datei entspricht **einem Jira-Issue (Issue Type: Story)** und enthält:

- YAML-Frontmatter mit Jira-relevanten Metadaten (Priorität, Labels, Abhängigkeiten, Epic)
- Body mit allen elf Story-Feldern (User Story, Beschreibung, Akzeptanzkriterien, Abgrenzungen, Offene Fragen, DoR, DoD, Priorität, Abhängigkeiten, Betroffene Rollen)

> Hinweis: Die Frontmatter-Felder `dependencies`, `summary_for_jira` und die Querverweise im Body (z. B. „siehe F1") nutzen weiterhin die ursprünglichen A1–M2-Codes. Das Mapping auf PROJ-IDs steht im Tabellenkopf von `INDEX.md`.

### Übersicht (Epics)

| Epic | Titel | Stories | Label | PROJ-Range |
|------|-------|---------|-------|------------|
| A | Projektgrundlagen & Phasenmodell | 3 | `epic-a` | PROJ-94–96 |
| B | Rollen, Gremien & Governance | 4 | `epic-b` | PROJ-97–100 |
| C | Aufgaben & Workstreams | 3 | `epic-c` | PROJ-101–103 |
| D | Deliverables & Artefakte | 3 | `epic-d` | PROJ-104–106 |
| E | Risiken & Red Flags | 3 | `epic-e` | PROJ-107–109 |
| F | Entscheidungen & Stage-Gates | 2 | `epic-f` | PROJ-110–111 |
| G | Due Diligence | 5 | `epic-g` | PROJ-112–116 |
| H | Kommunikation, Gremien & Stakeholder | 3 | `epic-h` | PROJ-117–119 |
| I | Bewertung & Kaufpreislogik | 2 | `epic-i` | PROJ-120–121 |
| J | Vertrag, Signing & Closing | 3 | `epic-j` | PROJ-122–124 |
| K | Post-Merger-Integration | 3 | `epic-k` | PROJ-125–127 |
| L | Vertraulichkeit, NDA & Audit | 3 | `epic-l` | PROJ-128–130 |
| M | Reporting & Dashboards | 2 | `epic-m` | PROJ-131–132 |

**Gesamt:** 39 Stories

### Priorisierung & Jira-Mapping

| Backlog-Stufe | Jira-Priority | Label |
|---------------|---------------|-------|
| Must (MVP) | `Highest` | `mvp` |
| Must | `High` | `must-have` |
| Should | `Medium` | `should-have` |
| Could | `Low` | `could-have` |

Aktueller Stand: **Highest/High: 21 · Medium: 18 · Low: 0**

### Labels-Konvention

- `ma-platform` — alle Stories dieses Initiativen-Backlogs
- `epic-a` … `epic-m` — Epic-Zugehörigkeit (Epic ist hier kein eigenes Jira-Issue, sondern Label)
- `mvp`, `must-have`, `should-have`, `could-have` — Priorisierung
- Epic-Titel finden sich zusätzlich im Frontmatter (`epic_title`)

### Verwendung

**1. Manueller Copy-Paste in Jira:**
- Datei öffnen, Summary aus `summary_for_jira` übernehmen, Body unter "---" in die Jira-Description einfügen.

**2. Bulk-Import per Atlassian-Connector:**
- Eine maschinenlesbare Issue-Manifest-Datei (`jira-push-manifest.json`) ist im Repo derzeit nicht enthalten; bei Bedarf aus den Frontmatter-Daten neu erzeugen.

**3. Git/Confluence/Notion:**
- Die MD-Dateien sind eigenständige Artefakte. Geeignet für Versionierung, Reviews, Refinement vor dem Jira-Push.

### Wichtige Hinweise

- **Abhängigkeiten** im Frontmatter (`dependencies: [B1, B4, L3]`) sind aktuell informativ. Nach dem Push in Jira können sie als `is blocked by` / `relates to` Issue-Links nachgepflegt werden (offene Aufgabe).
- **Übergreifende offene Fragen** und **Annahmen** sind im Backlog-Word-Dokument (separat) dokumentiert und nicht je Story redundant aufgeführt.
- **Querverweise** zwischen Stories nutzen die ursprünglichen A1–M2-IDs (z. B. „siehe F1") — das Mapping auf PROJ-IDs steht in `INDEX.md`.

### Dateien

| Datei | Inhalt |
|-------|--------|
| `PROJ-94-<slug>.md` … `PROJ-132-<slug>.md` | Eine Datei pro Story (39 Stück) |
| `INDEX.md` | Zentrales Tracking inkl. A1–M2 → PROJ-94–132 Mapping |
