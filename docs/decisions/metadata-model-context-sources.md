> **Inherited from V2** — Decision still applies to V3. Stack-specific references (FastAPI, Redis, etc.) are historical; Supabase/Next.js V3 implementations follow the same principle.

# Decision: Minimales Metadatenmodell für Kontextquellen
Datum: 2026-04-20  
Status: verbindlich

---

## Entscheidung

Kontextquellen erhalten von Welle 1 an ein definiertes Metadatenmodell mit Pflichtfeldern, optionalen Feldern und explizit reservierten Welle-3-Feldern. Das Modell ist so geschnitten, dass es Welle 1 nicht überlädt und Welle 3 nicht strukturell blockiert.

---

## Pflichtfelder (Welle 1 — immer befüllt)

| Feld | Typ | Zweck |
|---|---|---|
| `source_id` | Auto-ID | Eindeutige Referenz — wird von KI-Proposals (F06.6) als Pflichtfeld referenziert |
| `project_id` | FK | Projektzuordnung — keine projektneutrale Quelle |
| `source_type` | Enum | Analysestrategie in Welle 3 hängt vom Typ ab |
| `title` | String | Bezeichnung der Quelle |
| `source_date` | Date | Datum des Dokuments / Meetings — nicht Upload-Datum; Fallback: `null` mit Hinweis erlaubt |
| `created_at` | Timestamp | Upload-/Erfassungszeitpunkt — systemseitig gesetzt |
| `processing_status` | Enum | Verarbeitungsstatus — in Welle 1 immer `unverarbeitet`; ab Welle 3 KI-Pipeline setzt dieses Feld |

**`source_type` Enum-Werte:** `dokument`, `protokoll`, `email_manuell`, `notiz`, `praesentation`, `vertrag`  
**`processing_status` Enum-Werte:** `unverarbeitet`, `in_verarbeitung`, `verarbeitet`, `fehlerhaft`

---

## Optionale Felder (Welle 1 — vorhanden, nicht Pflicht)

| Feld | Typ | Zweck |
|---|---|---|
| `author` | String (Freitext) | Verfasser / Absender — Welle 1: Freitext; Welle 3: optionaler Stakeholder-FK |
| `source_origin` | String (Freitext) | Herkunftskanal oder -kontext (z. B. „Kundenmeeting", „Laufwerk", „E-Mail-Eingang") |
| `context_tag` | Enum + Freitext | Thematische Einordnung — Auswahlliste: Vendor-Auswahl, Risikoanalyse, Anforderungen, Planung, Statusbericht, Governance, Sonstiges |
| `project_element_ref_type` | String (`phase` / `milestone` / null) | Typ des referenzierten Projektelements |
| `project_element_ref_id` | FK / nullable | Zuordnung zu Phase oder Meilenstein |
| `description` | Text | Kurzbeschreibung der Quelle |

---

## Felder für Welle 3 (nicht in Welle 1 implementieren)

| Feld | Zweck |
|---|---|
| `normalized_content` | Normalisierter Textinhalt für semantische Analyse |
| `recipients` / `participants` | Für E-Mail- und Protokoll-Typen |
| `author_ref` | FK auf Stakeholder-Entität (ersetzt dann `author`-Freitext) |
| `linked_entities` | Allgemeine Verknüpfung zu Tasks, Risks, Decisions (erweitert den projekt_element_ref auf alle Core-Objekte) |
| `traceability_reference` | Rückverfolgung: welche Objekte wurden aus dieser Quelle abgeleitet |
| `version` | Dokumentenversionierung |

---

## Begründung

- `source_id` ist die kritische Voraussetzung für F06.6 (Quellenreferenz in KI-Proposals) — ohne stabile ID kann Welle 3 keine nachvollziehbaren Referenzen erzeugen
- `source_type` steuert die Analysestrategie: ein Vertrag wird anders analysiert als ein Meeting-Protokoll
- `processing_status` als Welle-1-Feld: das Feld existiert von Anfang an mit Defaultwert `unverarbeitet` — die KI-Pipeline befüllt es erst in Welle 3, aber die Spalte muss nicht nachmigiert werden
- `source_origin` und `context_tag` ermöglichen thematisches Routing in der semantischen Analyse — ohne sie sind Ableitungen kontextlos
- Welle-3-Felder (`normalized_content`, `participants`, `traceability_reference`) entstehen erst, wenn die jeweiligen Quellentypen oder KI-Funktionen aktiviert werden — kein vorauseilender Aufbau

---

## Konsequenzen

- feature_context-source-registration.md (F05.1) und feature_source-traceability.md (F05.2) werden entsprechend aktualisiert
- Das Upload-Modul (Kategorie B) wird mit diesen Feldern erweitert
- Das Datenbankschema enthält die Welle-3-Felder bereits als nullable Spalten — kein Schema-Bruch beim Aktivieren

---

## Gilt ab

Welle 1 — vor Story-Writing für F05.1 und F05.2
