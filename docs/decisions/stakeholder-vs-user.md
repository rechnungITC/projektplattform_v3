> **Inherited from V2** — Decision still applies to V3. Stack-specific references (FastAPI, Redis, etc.) are historical; Supabase/Next.js V3 implementations follow the same principle.

# Decision: Stakeholder ist eine eigenständige fachliche Entität
Datum: 2026-04-20  
Status: verbindlich

---

## Entscheidung

Stakeholder wird als eigene fachliche Entität modelliert — unabhängig vom User/RBAC-System. Die Verknüpfung zu einem User ist optional und strukturell nachrangig.

---

## Drei Konzepte, klar getrennt

**User** — technische Entität. Eine Person mit Login in der Plattform. Existiert im technischen Layer.

**RBAC-Rolle / Berechtigung** — technisches Konzept. Steuert, was ein User im System tun darf.

**Stakeholder** — fachliche Entität. Eine Person, Gruppe oder Organisation, die für das Projekt fachlich relevant ist — aufgrund von Rolle, Einfluss, Zuständigkeit oder Betroffenheit. Existiert im fachlichen Layer. Kann, muss aber nicht, einen User haben.

---

## Wichtige Abgrenzungen

- Nicht jeder Stakeholder ist User — externe Stakeholder (Betriebsrat, Auftraggeber, Berater) haben keinen Systemzugang
- Nicht jeder User ist relevanter Stakeholder — Systemadministratoren sind Users, aber nicht fachlich projektbeteiligte Stakeholder
- RBAC-Rollen (Projektleiter im System) und fachliche Stakeholder-Rollen (Projektleiter im Projekt) heißen gleich, sind aber verschiedene Konzepte in verschiedenen Schichten

---

## Begründung

Wenn Stakeholder als User-Erweiterung gebaut wird:
- Externe Stakeholder ohne Systemzugang verlieren ihre strukturelle Repräsentation
- Governance-Entscheidungen, die externe Beteiligte einbinden, haben keinen strukturierten Bezugspunkt
- RBAC-Änderungen haben unerwartete Auswirkungen auf die fachliche Projektstruktur

---

## Konsequenzen

- Stakeholder ist eine eigene Entität mit eigenem Datensatz
- Felder: Name, fachliche Rolle (Freitext Welle 1), Typ (intern/extern), Organisation, Einfluss, Interesse, Projektzuordnung
- Optionales Feld `linked_user_id` — falls der Stakeholder auch einen Systemzugang hat
- User-Modell bleibt unverändert
- RBAC-Logik und fachliche Stakeholder-Rollen bleiben technisch entkoppelt

---

## Gilt ab

Welle 1 — vor Story-Writing für feature_stakeholder-management.md (F03.3)
