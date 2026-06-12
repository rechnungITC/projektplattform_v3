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

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic H — Kommunikation, Gremien & Stakeholder)
**Priority:** P1

> **Epic:** H — Kommunikation, Gremien & Stakeholder  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should  
> **Labels:** `ma-platform` · `epic-h` · `should-have`  
> **Abhängigkeiten:** `H2`, `L2`, `L3`, `B4`

**User Story:**

Als Deal Lead möchte ich sicherstellen, dass Kommunikationsentwürfe und vorbereitete Inhalte nur den im Need-to-know-Prinzip definierten Personen sichtbar sind, damit Vertraulichkeit vor Signing und Closing gewahrt bleibt.

**Beschreibung / Kontext:**

Das Modell macht das Need-to-know-Prinzip zur Pflichtgrundlage. Kommunikationsentwürfe (z. B. ein vorbereiteter Mitarbeiter-Brief) müssen vor Signing strikt vertraulich behandelt werden. Die Plattform muss dies technisch durchsetzen.

**Akzeptanzkriterien:**

- [ ] Pro Kommunikationseintrag (H2) kann eine Vertraulichkeitsstufe gesetzt werden (siehe L2), die die Sichtbarkeit auf einen festgelegten Personenkreis einschränkt.
- [ ] Versuche, Inhalte herunterzuladen oder zu drucken, werden je nach Stufe protokolliert oder unterbunden.
- [ ] Eine 'Inner Circle'-Markierung beschränkt Sichtbarkeit auf eine explizit benannte Personenliste, unabhängig von Workstream-Rollen.
- [ ] Vor dem Statuswechsel 'freigegeben → versandt' prüft die Plattform, ob das Embargodatum erreicht ist (falls gesetzt).

**Abgrenzungen (Out of Scope):**

- Kein Digital Rights Management außerhalb der Plattform.
- Keine Wasserzeichen auf Exporten (offene Frage – siehe L2).

**Offene Fragen:**

- Sollen exportierte Dokumente Wasserzeichen mit Empfänger und Zeitstempel tragen?
- Soll der 'Inner Circle' durch den Sponsor pflichthaft bestätigt werden?

**Definition of Ready:**

- [ ] Klassifikationsstufen aus L2 sind definiert.
- [ ] Sicht-/Aktionsregeln je Stufe sind dokumentiert.

**Definition of Done:**

- [ ] Sichtbarkeit, Embargo und Inner-Circle-Logik funktionieren.
- [ ] Audit-Trail erfasst jeden Zugriff auf 'inner-circle'-Inhalte.

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
_Quelle: Backlog-Entwurf M&A-Projektplattform · H — Kommunikation, Gremien & Stakeholder_
