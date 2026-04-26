> **Inherited from V2** — Decision still applies to V3. Stack-specific references (FastAPI, Redis, etc.) are historical; Supabase/Next.js V3 implementations follow the same principle.

# Decision — Datenschutz-Klassifizierung (Klasse 1/2/3)

Status: **accepted**
Jira-Bezug: **PP-33 (F12.1)**
Abhängige Stories: EP-10-ST-02 (PP-106 externe KI sperren), F10.2 (PP-52 Modellauswahl), EP-06-ST-01/02 (Stakeholder-Modell), EP-08 (Versionierung)

## Decision

Die Plattform klassifiziert jedes Datenfeld in **eine von drei Klassen**. Die Klasse ist im Datenmodell technisch markiert und steuert, welche KI-Modelle die Daten verarbeiten dürfen.

| Klasse | Datentyp-Beispiele | Verarbeitungspfad |
|---|---|---|
| **Klasse 1** | Projekttyp, Methodik, Story-Inhalte, öffentlich-sichtbare Metadaten | Cloud **oder** lokal |
| **Klasse 2** | Projektname, Projektziel, KI-generierte Inhalte | Cloud **oder** lokal — **Tenant wählt** |
| **Klasse 3** | Personenbezogene Daten, Stakeholder-Namen/-Rollen, Meeting-Transkripte | **NUR lokal — externe KI technisch blockiert** |

## Why

- DSGVO Art. 6/9 verlangt nachvollziehbare Rechtsgrundlage für Personendaten.
- Externe KI-Provider (Anthropic, OpenAI) liegen in Drittstaaten. Personendaten dort zu verarbeiten erfordert Auftragsverarbeitungsverträge und ist je nach Datenart unzulässig.
- Technische Durchsetzung (statt nur Policy) ist Compliance-Anforderung: die Sperre muss ohne Bypass wirken.

## Implications

- Jedes neue Datenfeld muss bei der Modellierung eine Klasse erhalten. Default ist Klasse 3, wenn unklar.
- Der zentrale KI-Aufruf (EP-10-ST-01 Modellrouting) prüft Payloads vor externem Aufruf.
- Klasse-3-Payloads werden an einen lokalen Modellpfad geroutet; ist keiner verfügbar, schlägt der Aufruf mit sichtbarer Meldung fehl (kein Silent-Fallback auf Cloud).
- Logging: Klasse, gewählter Modelltyp und Entscheidung pro KI-Aufruf werden protokolliert.
- Tenant-Admin hat **keine** Bypass-Möglichkeit für Klasse 3 (Enterprise-Standalone-Kunden mit eigener Infrastruktur können natürlich Cloud-Routing komplett deaktivieren).

## Nicht-AK / Abgrenzung

- Keine automatische Anonymisierung — Klasse 3 bleibt Klasse 3, auch in Ausleitungen.
- Keine rechtliche Bewertung durch KI — die Klasseneinstufung ist Produkt-/Legal-Entscheidung, nicht KI-Aufgabe.
- Kein Ausnahme-Freigabe-Workflow im Sprint 1–4 Scope.

## Beispiele

| Feld | Klasse | Begründung |
|---|---|---|
| `projects.name` | 2 | Projektname kann geschützt/vertraulich sein, Tenant entscheidet. |
| `projects.description` | 2 | Siehe oben. |
| `projects.project_type` | 1 | Rein strukturell. |
| `projects.lifecycle_status` | 1 | Rein strukturell. |
| `users.email`, `users.display_name` | 3 | Personenbezogen. |
| `project_lifecycle_events.comment` | 2–3 je nach Inhalt; im Zweifel 3 | Kann Personendaten enthalten. |
| zukünftig `stakeholders.*` | 3 | Personenbezogen per Definition. |
| zukünftig `meeting_transcripts.*` | 3 | Hochsensibel, immer lokal. |

## Löschkonzept (F12.1 AK „Löschkonzept vorhanden")

Konzept, nicht volle Implementierung (letztere kommt mit F13.7 / PP-47).

- **Weiche Löschung** (soft delete) ist Default für alle Geschäftsobjekte: `is_deleted=true`; die Zeilen bleiben erhalten für Audit/Versionshistorie.
- **Harte Löschung** wird bei DSGVO-Löschanfragen getriggert: alle Klasse-3-Felder einer Person werden in **allen Tabellen** auf `NULL` gesetzt bzw. die Zeile entfernt, wenn sie ohne Personendaten nicht mehr sinnvoll existiert (z. B. `users`-Zeile wird vollständig entfernt).
- **Referenzen** von Personen an anderen Objekten (`created_by`, `responsible_user_id`, `changed_by`) werden beim Personenlöschen auf einen **anonymisierten Platzhalter-User** umgebogen statt `NULL` zu setzen, damit Audit-Trails zusammenhängend bleiben.
- **Versionshistorie**: Einträge aus `project_lifecycle_events` mit Klasse-3-Kommentaren werden bei DSGVO-Löschung pseudonymisiert (`comment` → `[gelöscht]`, `changed_by` → Anon-Platzhalter).
- **Logging**: jede Löschung mit Zeitstempel, Anfrageursprung und betroffenen Tabellen.

## Export-/Portabilitätskonzept (F12.1 AK „Exportfähigkeit")

- **Scope**: DSGVO Art. 20 verlangt Datenportabilität für „Daten, die die betroffene Person bereitgestellt hat". Auf Plattform-Ebene = alle Zeilen, bei denen `user_id`, `created_by`, `changed_by` oder `responsible_user_id` auf die Person zeigen.
- **Format**: JSON (maschinenlesbar, strukturiert). CSV optional als zusätzlicher Pfad.
- **Granularität**: eine Datei pro Tabelle, jeweils nur die Zeilen, die die Person betreffen.
- **Auslieferung**: initial manueller Admin-Prozess via CLI-Skript in `infra/scripts/`. Self-Service-Export folgt.
- **Umsetzungsstand**: nicht in diesem Commit — die Klassifizierung stellt die Grundlage, das Export-Tool baut darauf auf (F13.7).

## Implementierungsstand

| Status | Komponente |
|---|---|
| ✓ | Datenschutzklassen definiert und dokumentiert (dieses Dokument) |
| ✓ | Klassifizierung je DB-Feld — [`services/data_privacy.py`](../../apps/api/src/projektplattform_api/services/data_privacy.py) |
| ✓ | Helper `classify_payload` / `contains_class_3` (dasselbe Modul) |
| ⏳ | Modell-Router greift auf die Klassifizierung zurück — EP-10-ST-01 (folgt unmittelbar) |
| ⏳ | Löschkonzept technisch umgesetzt — F13.7 / PP-47 |
| ⏳ | Export-Tool — F13.7 / PP-47 + spätere UI |

## Related

- [architecture-decisions-table.md](architecture-decisions-table.md) — Gesamt-Entscheidungstabelle
- [../phases.md](../phases.md) — PP-33 ist Phase-1-Pflicht
- [../risks.md](../risks.md) — R1, R9, R10
