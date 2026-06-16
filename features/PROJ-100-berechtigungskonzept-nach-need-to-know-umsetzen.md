---
id: PROJ-100
title: "Berechtigungskonzept nach Need-to-know umsetzen"
issue_type: Story
epic_code: B
epic_title: "Rollen, Gremien & Governance"
priority: Highest
priority_source: "Must (MVP – ohne dieses Konzept ist die Plattform für reale M&A-Arbeit nicht einsetzbar)"
labels: ["ma-platform", "epic-b", "mvp"]
dependencies: ["A1", "B1", "L3"]
roles: ["IT-Sicherheitsverantwortlicher", "Datenschutzbeauftragter", "Compliance", "PMO-Lead", "Deal Lead"]
summary_for_jira: "[B4] Berechtigungskonzept nach Need-to-know umsetzen"
---

# PROJ-100: Berechtigungskonzept nach Need-to-know umsetzen

## Status: Architected (100a; 2026-06-16) — Tech Design für den 100a-Foundation-Slice gelockt; 100b deferred. Nächster Schritt: `/backend` für 100a.
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic B — Rollen, Gremien & Governance)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND-Foundation** · Andockpunkt: Need-to-Know RLS-Sublayer (ADR Fork 2) — split 100a/100b; Pentest-Pflicht. Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** B — Rollen, Gremien & Governance  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP – ohne dieses Konzept ist die Plattform für reale M&A-Arbeit nicht einsetzbar)  
> **Labels:** `ma-platform` · `epic-b` · `mvp`  
> **Abhängigkeiten:** `A1`, `B1`, `L3`

**User Story:**

Als IT-Sicherheitsverantwortlicher möchte ich Berechtigungen auf Projekt-, Phasen-, Workstream-, Dokument- und Feldebene nach dem Need-to-know-Prinzip steuern können, damit Vertraulichkeit, Vorabinformationsverbote und regulatorische Pflichten eingehalten werden.

**Beschreibung / Kontext:**

Vertraulichkeit ist in M&A-Projekten essenziell. Das Modell nennt Need-to-know explizit als Kommunikationsprinzip. Die Plattform muss feingranulare Berechtigungen mit klarer Auditierbarkeit unterstützen.

**Akzeptanzkriterien:**

- [ ] Berechtigungen sind auf den Ebenen Projekt, Phase, Workstream, Deliverable und einzelnen Dokumenten setzbar.
- [ ] Vorgefertigte Berechtigungsprofile (z. B. 'SteerCo lesend', 'DD-Stream Legal voll', 'externer Berater Tax') sind verfügbar.
- [ ] Jede Berechtigungsänderung wird im Audit-Trail (L3) protokolliert.
- [ ] Eine Übersicht 'Wer darf was sehen?' pro Objekt ist verfügbar.
- [ ] Ein 4-Augen-Prinzip kann optional für besonders sensitive Rechte aktiviert werden.

**Abgrenzungen (Out of Scope):**

- Plattform implementiert kein eigenes IAM – Authentifizierung läuft über den Unternehmens-IdP.
- Keine automatische Klassifikation von Dokumenten.

**Offene Fragen:**

- Welche Vorab-Berechtigungsprofile sind aus Compliance-Sicht verbindlich?
- Müssen Berechtigungen mit Geheimhaltungsvermerken aus dem DMS automatisch verknüpft werden?
- Wie wird 'temporäre Berechtigung' (z. B. nur für die nächsten 5 Tage) abgebildet?

**Definition of Ready:**

- [ ] Berechtigungsmodell ist mit IT-Sicherheit, Datenschutz und Compliance abgestimmt.
- [ ] Rollen-Berechtigungs-Matrix ist dokumentiert.

**Definition of Done:**

- [ ] Berechtigungen sind auf allen genannten Ebenen technisch wirksam.
- [ ] Audit-Trail erfasst jede Vergabe und jeden Entzug.
- [ ] Penetrationstest auf Rechte-Eskalation bestanden.

**Abhängigkeiten:**

- A1 – Projektanlage
- B1 – Rollen
- L3 – Audit-Trail

**Betroffene Rollen:**

- IT-Sicherheitsverantwortlicher
- Datenschutzbeauftragter
- Compliance
- PMO-Lead
- Deal Lead

---

## Tech Design (Solution Architect) — 2026-06-16

> Architektur-Grundlage gelockt in [ma-domain-architecture.md](../docs/decisions/ma-domain-architecture.md) Fork 2 + Fork 3. Dieses Design verfeinert nur die Umsetzung — die Grundsatzentscheidung (RLS-Sublayer statt Tenant-RLS-Ersatz) wird hier NICHT neu aufgemacht.

### Grundidee in einem Satz

Need-to-Know ist ein **zweites Tor innerhalb des Mandanten**: Jede Anfrage muss schon heute durch das **Tenant-Tor** (gehört der Nutzer zum Mandanten?). Künftig kommt ein **Vertraulichkeits-Tor** dazu (ist der Nutzer für *dieses* Objekt auf *dieser* Stufe freigeschaltet?). **Beide Tore müssen „ja" sagen** — das neue Tor kann Zugriff nur weiter einschränken, nie erweitern. Die Mandanten-Trennung bleibt die äußere, unverhandelbare Schranke.

### Slice-Aufteilung (gemäß ADR)

| Slice | Inhalt | Status |
|---|---|---|
| **100a (dieser Slice, Release 0)** | Vertraulichkeits-Stufen-Modell + Freischaltungs-Liste + das wiederverwendbare „Vertraulichkeits-Tor" + Anwendung auf die heute existierenden Foundation-Objekte + Pentest | **Architected** |
| **100b (späterer Slice)** | Vorgefertigte Berechtigungsprofile (AC2), 4-Augen-Workflow für besonders sensible Rechte (AC5), „Wer darf was sehen?"-Übersicht pro Objekt (AC4) | deferred |

100a ist der **Foundation-Knoten**: ~15 spätere DD-/Vertraulichkeits-Specs (112/113/114/108/118/119/128/129 …) hängen daran. Sie klassifizieren ihre eigenen Objekte später, indem sie das in 100a gebaute Tor wiederverwenden — sie bauen kein eigenes Berechtigungssystem.

### A) Komponenten-/Wirkungsstruktur (100a)

```
Vertraulichkeits-Tor (neuer, geteilter Baustein)
+-- Stufen-Modell        (geordnete Vertraulichkeits-Stufen, z. B. Standard < Vertraulich < Streng vertraulich / Inner Circle)
+-- Objekt-Einstufung    (jedes geschützte Objekt trägt eine Stufe; Default = Standard)
+-- Freischaltungs-Liste (welcher Nutzer ist in welchem Projekt bis zu welcher Stufe freigeschaltet)
+-- Tor-Prüffunktion     ("Darf der aktuelle Nutzer dieses Objekt auf dieser Stufe sehen?")
+-- Anbindung an die bestehenden Zugriffsregeln der Foundation-Tabellen
    +-- wird ZUSÄTZLICH zur bestehenden Mandanten-Prüfung verlangt (UND-Verknüpfung)
    +-- Grundhaltung: im Zweifel kein Zugriff (default-deny oberhalb von „Standard")
+-- Audit-Anbindung (Wiederverwendung PROJ-10): jede Einstufung + jede Freischaltung/Entzug wird protokolliert
```

### B) Datenmodell (in Worten, kein Code)

- **Vertraulichkeits-Stufe**: ein kleiner, **geordneter** Stufen-Katalog (Need-to-Know-Tiers). Geordnet, weil M&A-Vertraulichkeit hierarchisch ist („wer Streng-vertraulich darf, darf auch Vertraulich"). Bewusst KEINE frei zusammensetzbaren Einzel-Rechte-Listen pro Objekt in 100a — das wäre teurer, schwerer auditierbar und ist für den Pilot nicht nötig (verschoben, falls Pilot es verlangt).
- **Objekt-Einstufung**: jedes geschützte Objekt (in 100a: Projekt, Phase, Work-Item — die heute existierenden Foundation-Ebenen) bekommt eine Stufe. Fehlt eine explizite Einstufung, gilt **Standard**.
- **Freischaltung (Inner-Circle-Membership)**: pro Projekt + Nutzer die höchste Stufe, für die er freigeschaltet ist. Optional zeitlich befristbar (greift die „temporäre Berechtigung"-Offene-Frage auf — als Feld vorgesehen, Durchsetzung kann in 100a simpel sein).
- **Trennung zu Class-3 (Fork 3):** Die Vertraulichkeits-Stufe ist **etwas anderes** als die Datenschutz-Klasse (`privacy_class`). Ein Objekt kann „Inner Circle" + Class-1 sein (streng vertraulich, aber ohne Personendaten) oder „Standard" + Class-3 (Personendaten). **Zwei unabhängige Achsen, zwei unabhängige Tore** — sie werden nirgends vermischt.

### C) Durchsetzungs-Pattern

Das Vertraulichkeits-Tor wird als **geteilte Prüffunktion** gebaut — nach demselben bewährten Muster wie die deployten Mandanten-Helfer aus PROJ-1 (`is_tenant_member` & Co.): die Funktion liest die Freischaltungs-Liste **als Eigentümer** und ist damit innerhalb der Zugriffsregeln nutzbar, ohne sich selbst rekursiv auszusperren. In den Zugriffsregeln der geschützten Tabellen wird sie **zusätzlich** zur bestehenden Mandanten-Prüfung verlangt. Wichtig: **kein Umschreiben** der bestehenden Regeln — nur eine zusätzliche UND-Bedingung. Damit bleibt die Mandanten-Trennung unangetastet und der neue Layer ist isoliert testbar.

Für künftige Slices liefert 100a ein **dokumentiertes Rezept** „So macht man eine neue Tabelle need-to-know-fähig" (eine Spalte + eine zusätzliche UND-Bedingung), damit DD-Streams/Findings/Kommunikation den Layer konsistent wiederverwenden.

### D) Tech-Entscheidungen (WARUM)

- **Additiver Sublayer statt Neubau:** Die Multi-Tenant-Invariante (jede Regel geht durch die etablierten Helfer) darf nicht aufgeweicht werden. Ein zusätzliches, UND-verknüpftes Tor ist die minimale, prüfbare Änderung mit der kleinsten Angriffsfläche.
- **Geteilte Eigentümer-Prüffunktion:** spiegelt das in Produktion bewährte PROJ-1-Pattern, vermeidet RLS-Rekursion, hält die Logik an einer Stelle (eine Stelle zu auditieren statt N Policies).
- **Geordnete Stufen statt Objekt-ACLs:** einfacher, auditierbar, deckt Need-to-Know-Tiers ab; frei zusammensetzbare ACLs sind teurer und verschoben.
- **Default-deny oberhalb Standard:** im M&A-Kontext ist die sichere Grundhaltung Pflicht — ein vergessenes Einstufen darf nicht zu Über-Sichtbarkeit führen.
- **Audit über PROJ-10 wiederverwenden (AC3):** kein zweites Audit-System; Einstufungen/Freischaltungen laufen über den existierenden Field-Level-Audit-Trail.

### E) Akzeptanzkriterien-Zuordnung

- **AC1 (Ebenen-Berechtigung):** 100a liefert das Tor + Anwendung auf Projekt/Phase/Work-Item; Deliverable-/Dokument-Ebene folgt automatisch, sobald diese Tabellen (PROJ-104/79-Familie) das Rezept anwenden.
- **AC3 (Audit):** 100a (Wiederverwendung PROJ-10).
- **AC2 (Profile) / AC4 (Wer-darf-was-View) / AC5 (4-Augen):** 100b.

### F) Pentest-Pflicht-AC für 100a (security-kritisch)

- [ ] **AC-100a-SEC**: Penetrationstest besteht alle folgenden Angriffe: (1) Cross-Clearance-Leak — Nutzer mit niedriger Stufe sieht kein höher eingestuftes Objekt; (2) Selbst-Freischaltung / Rechte-Eskalation ist blockiert (nur befugte Rolle vergibt Freischaltungen); (3) Cross-Tenant bleibt trotz passender Stufe verwehrt (äußeres Tenant-Tor unberührt); (4) default-deny: nicht eingestufte Objekte oberhalb Standard sind nicht sichtbar; (5) das Tor lässt sich nicht über Rekursion/RLS-Bypass umgehen; (6) Class-3-Achse bleibt unabhängig (Vertraulichkeits-Freischaltung hebelt den Class-3-Block NICHT aus).

### G) Abhängigkeiten / neue Pakete

**Keine neuen npm-Pakete.** Reiner Postgres-RLS-Layer + Wiederverwendung des deployten PROJ-10-Audits und der PROJ-1-Helfer-Patterns. Migration (neue Spalte + Tabelle + Prüffunktion + zusätzliche Policy-Bedingung) folgt im `/backend`-Slice.

### H) Offene Fragen — Einordnung

- *Verbindliche Compliance-Profile* → 100b (Profile-Slice), nicht 100a.
- *Automatische Verknüpfung mit DMS-Geheimhaltungsvermerken* → später, wenn DMS-Klassifikation (PROJ-79/129) steht; 100a stellt nur den Mechanismus bereit.
- *Temporäre Berechtigung* → als Befristungs-Feld in der Freischaltung vorgesehen; einfache Durchsetzung in 100a, ausgefeilte Ablauf-Automatik optional später.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · B — Rollen, Gremien & Governance_
