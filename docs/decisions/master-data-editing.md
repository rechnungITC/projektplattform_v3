> **Inherited from V2** — Decision still applies to V3. Stack-specific references (FastAPI, Redis, etc.) are historical; Supabase/Next.js V3 implementations follow the same principle.

# Decision Record — Stammdaten bearbeiten mit Feldhistorie

**EP-03-ST-05 / PP-82** · Stand: 2026-04-23

---

## Kontext

EP-03-ST-05 will Stammdaten eines Projekts bearbeitbar machen, **inklusive feldweiser Historie, Hinweisen auf Folgeauswirkungen und Rechteprüfung**. Die Story landet nach EP-03-ST-01 (Modell) und ist eine der zentralen „User bearbeitet ein laufendes Projekt"-Funktionen.

Große Teile der AK sind bereits durch Querschnitts-Stories erfüllt. Dieser Record macht die Überdeckung explizit, damit kein Code doppelt gebaut wird.

## AK-Abdeckung

| AK | Status | Wo umgesetzt |
|---|---|---|
| Stammdaten sind bearbeitbar. | ✅ | `PATCH /api/v1/projects/{id}` + `ProjectEditForm` in Übersicht-Tab. |
| Pflichtfelder bleiben Pflicht beim Bearbeiten. | ✅ | Pydantic-Validation + Service-Layer (`Project name must not be empty`; Plausibilitäts-Check für Datums-Range). |
| Feldänderungen werden feldweise historisiert. | ✅ | EP-08-ST-01 Audit-Hook in `routers/projects.update_project`. Jedes PATCH-Feld landet als eigene Zeile in `audit_log_entries`. |
| Historie ist für berechtigte Nutzer einsehbar. | ✅ | `GET /api/v1/projects/{id}/history` + Historie-Tab in der UI mit Vergleichsmodus (EP-08-ST-02). |
| Einzelne Änderungen sind rückführbar. | ✅ | EP-08-ST-03 `POST /api/v1/audit/{id}/undo` mit „Rückgängig"-Button pro History-Eintrag. |
| Rechteprüfung: ohne Editor-Rolle kein Speichern. | ✅ | `_require_edit` in Projects-Router; `can_edit_project` matrix (`planning/decisions/role-model.md`). UI zeigt „Stammdaten bearbeiten"-Button nur wenn `canEditProject` wahr. |

## Hinweise auf Folgeauswirkungen

Die AK nennt „Hinweise auf Folgeauswirkungen" als Erwartung. Heute adressiert:

- **Projekttyp-Wechsel** — eigener Endpoint `/change-type` mit UI-Warnung im Projekttyp-Changer, dass Extension-Daten des alten Typs betroffen sein könnten.
- **Lifecycle-Transitions** — separater Flow mit Statusverlauf-Timeline und Bestätigungs-Dialog in `LifecycleActions`.
- **Responsible-User-Change** — heute ohne Folgewarnung; explizit offen (Follow-up: Benachrichtigung der abgelösten Person gehört zu EP-11 Kommunikation).

Für reine Felder wie Name, Beschreibung, Projektnummer, Start-/Enddatum entstehen keine systemweiten Folgen — die Edit-UI nennt daher keine Zusatzwarnungen.

## Was diese Story bewusst **nicht** neu ergänzt

- Keine neue Edit-Oberfläche (`ProjectEditForm` deckt ab).
- Keine Duplizierung der Audit-Logik — weiterhin zentraler Hook in der Service-/Router-Schicht.
- Keine explizite Konflikt-Auflösung zwischen parallelen Edits — optimistische Semantik bleibt (letztes PATCH gewinnt); ein Konflikt-Detector kann später als ETag eingezogen werden.

## Konsequenzen

- EP-03-ST-05 gilt als **durch Querschnittslogik erfüllt**; keine zusätzliche Code-Änderung nötig.
- Folge-Stories, die bestehende Edit-Pfade berühren, profitieren automatisch von Audit + Rollback. Dokumentation bleibt zentral (`planning/decisions/role-model.md`, `work-item-metamodel.md`).
- „Hinweise auf Folgeauswirkungen" für responsible_user_id folgt mit EP-11.
