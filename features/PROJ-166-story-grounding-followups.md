# PROJ-166 — Portfolio-Erdung Tranche 2: die vier bedarfsgetriebenen Followups

## Status: In Review
## Deployment Scope: —

**Created:** 2026-09-01

## Problem

Vier Followups standen seit dem 2026-06-04 bzw. 2026-06-15 unverändert: **PROJ-71** (OCR),
**PROJ-72** (Streaming-Parse), **PROJ-73** (mehr Formate) und **PROJ-133** (Graph-delegierter
Teams-Sender). Drei davon haben bis heute **keine Spec-Datei** — sie existieren nur als Registerzeile
mit `_spec pending_`.

Alle vier sind ausdrücklich **bedarfsgetrieben** formuliert („erst nach 5+ Nutzerbeschwerden", „erst
wenn Pilot reale Last zeigt", „build only when a pilot explicitly needs"). Genau diese Formulierung
macht sie anfällig: niemand prüft, ob der Bedarf eingetreten ist, und niemand prüft, ob die Prämisse
noch stimmt. Nach drei Monaten weiß niemand mehr, ob „offen" heißt *geprüft und verneint* oder
*ungeprüft*.

## Die vier Urteile

### PROJ-71 (OCR) — bedarfsgetrieben, Trigger **nicht belegbar**

Der Verzicht ist im Produktivcode **verankert**, nicht vergessen: `src/lib/dms/extraction.ts:164`
sagt „OCR ist ausdrücklich außerhalb (PROJ-71)", und `extraction.real.test.ts:75` hält den Fall als
Test fest. Kein OCR-Paket im Baum.

Der Trigger lautet „erst nach 5+ Nutzerbeschwerden ‚PDF zeigt nichts'". Auf Rückfrage am 2026-09-01:
**nicht beantwortbar** (kein aktiver Pilot). Das ist als *nicht belegbar* notiert und **nicht** als
„nein" gebucht — der Unterschied entscheidet, ob die Zeile später als „geprüft und verneint" oder als
„ungeprüft" gilt. Bleibt ohne Spec: eine Spec für einen unbelegten Bedarf ist Vorratsarbeit.

### PROJ-72 (Streaming-Parse) — Prämisse verschoben, Last existiert nicht

Die Story rechnet mit „>50 parallelen 25-MB-Uploads gegen 1 GB Function-Memory". Gemessen:

| Grenze | Wert | Quelle |
|---|---|---|
| Dateigröße | `MAX_FILE_BYTES 26_214_400` | `file-parser.ts:38` |
| Parse-Zeit | `PARSE_TIMEOUT_MS 20_000` | `file-parser.ts:42` |
| PDF-Seiten | `MAX_PDF_PAGES 200` | `file-parser.ts:39` |
| Rohtext | `MAX_PLAINTEXT_RAW_BYTES 2 MB` | `file-parser.ts:40` |
| Function-Memory | **nicht konfiguriert** | `vercel.json` |

**Bindend ist der 20-Sekunden-Parse-Timeout**, nicht die Function-Laufzeit. Die Sorge der Story
betrifft **Memory**, und die ist gar nicht konfiguriert.

**Tragend ist aber die fehlende Last:** die Story adressiert Gleichzeitigkeit, die es nicht gibt —
die PROJ-80-α-Deploy-Messung vom **selben Tag** nennt 0 DMS-Dokumente, der PROJ-75-Backfill 15
Kontextquellen **insgesamt**. Bleibt bedarfsgetrieben, ohne Spec.

*Nebenbeobachtung ohne Befundcharakter:* 13 AI-Routen setzen seit PROJ-152 `maxDuration = 300`, der
Upload-Pfad `context-sources` setzt keines. Heute unschädlich, weil der Plattform-Default darüber
liegt — festgehalten, damit es nicht als Versehen gelesen wird.

### PROJ-73 (mehr Formate) — teilweise erfüllt, und die beiden Pfade sind einer

Geparst werden heute **sechs** Typen: `application/pdf`, DOCX, `text/plain`, `text/markdown`,
`message/rfc822`, `application/vnd.ms-outlook`. Offen bleiben wie registriert PPTX/XLSX.

**Neu gemessen:** `src/lib/dms/extraction.ts` importiert `parseFile` aus
`@/lib/context-ingestion/file-parser` — der Kopfkommentar sagt es selbst („derselbe Parser"). Eine
Formaterweiterung bedient damit **Kickoff-Ingestion und DMS-Extraktion in einem Zug**. Das macht
diese Zeile und **PROJ-Y-80c** („XLSX- und PPTX-Extraktion", dort schon als „überlappt PROJ-73"
vermerkt) zu **derselben** Arbeit; sie sind bei Anlage zusammenzulegen.

### PROJ-133 (Graph-delegierter Teams-Sender) — Kostenschätzung überholt, Urteil bleibt

Die Spec begründet ihre Größe mit vier Punkten; der teuerste — per-Mandant-Store für Refresh-Token
samt Erneuerungs-Lebenszyklus plus OAuth2-Authorization-Code-Flow und Admin-Consent — wird von
**PROJ-158-β** gebaut (dessen Q1: feste Rückleitungsadresse je Umgebung; Q3: Token-Erneuerung beim
Zugriff; Q4: mandanteneigene Anwendungsregistrierung für Microsoft 365). Liefert 158-β, sinkt
PROJ-133 auf „Graph-Aufruf auf vorhandener Auth-Infrastruktur".

Unverändert gelten: der Trigger (nur bei Pilotbedarf an erkennbarer Absenderidentität), der
CIA-Befund von 2026-06-15 (app-only-Graph für Kanalbeiträge strukturell nicht verfügbar), und dass
die Zeile **keine** Auslassung von PROJ-49 ist, sondern eine neue Fähigkeit.

## Ein Befund, in der korrekten Stärke gemeldet

`DMS_ALLOWED_MIME_TYPES` erlaubt **9** Formate zum Upload, `parseFile` liest **6**, und
`NOT_RAG_PARSEABLE` markiert **2** — **XLSX, PPTX und CSV sind hochladbar, nicht parsebar und nicht
markiert**.

Mein erster Verdacht war „dauerhafter `failed`-Auszug", also wörtlich der Defekt, den PROJ-45-ε für
Bilder behoben hat. **Nachgemessen ist er milder:** `parseFile` wirft `unsupported_mime`, und
`extraction.ts:81-83` bildet das auf **`unsupported_type`** ab — der Nutzer bekommt eine **korrekte**
Aussage. Die Kosten sind ein unnötiger Download samt Parse-Versuch, und das Feld
`mime_unsupported_for_rag` sagt nicht die Wahrheit über die Formate, für die es gedacht ist (5 der 9
sind nicht parsebar, markiert sind 2).

Registriert als **PROJ-Y-166a**, hier bewusst **nicht** behoben: der Fix wäre klein, aber ein
`src/`-Diff und damit Scope-Ausweitung einer Erdungs-Slice. Wechselwirkung notiert — wird PROJ-73
gebaut, fallen XLSX/PPTX aus der Menge heraus und der Followup schrumpft auf CSV oder entfällt.

## Akzeptanzkriterien

- **AC-166.1** — Jede der vier Zeilen trägt in `features/INDEX.md` ein datiertes Urteil mit der
  Messung, die es trägt.
- **AC-166.2** — Dieselben vier Urteile stehen im Register (`OPEN-DEFERRED-STATUS.md`), damit die
  beiden Formen sich nicht widersprechen (PROJ-157s R1).
- **AC-166.3** — Ein Trigger, dessen Eintreten **nicht feststellbar** war, wird als *nicht belegbar*
  notiert, nicht als „nein" gebucht.
- **AC-166.4** — Die drei spec-losen Followups bekommen **keine** Spec-Datei; die Begründung steht in
  der Zeile.
- **AC-166.5** — PROJ-133 bekommt einen Erdungsabschnitt in seiner vorhandenen Spec, inklusive dessen,
  was die Erdung **nicht** entschieden hat.
- **AC-166.6** — Die Doppelführung PROJ-73 / PROJ-Y-80c ist an **beiden** Stellen als dieselbe Arbeit
  benannt.
- **AC-166.7** — Jeder neue Befund ist registriert, bevor er in einer Zeile referenziert wird — kein
  Verweis ins Leere.
- **AC-166.8** — Kein `src/`-Diff, keine Migration, kein Paket; alle Datei-Wächter grün.

## Bewusste Abweichungen und Grenzen

- **D-166.1:** gemessen an Code, Migrationsdateien und den dokumentierten Prod-Messungen **anderer
  Slices vom selben Tag** (PROJ-80-α: 0 DMS-Dokumente; PROJ-75: 15 Kontextquellen) — **nicht** über
  eigene Live-Abfragen. Für „gibt es Last" trägt das; eine eigene Messung wäre belastbarer und war
  für das Urteil „bedarfsgetrieben, nicht erreicht" nicht nötig.
- **D-166.2:** **PROJ-Y-148b entfällt aus dieser Tranche.** Ich hatte es als „braucht nur die
  V1/V3-Entscheidung" eingeplant — falsch: die Entscheidung ist am 2026-08-19 getroffen (V1), die
  Rechtsfrage steht als ADR `governance-history-retention-vs-erasure.md` mit Status
  `Proposed — wartet auf rechtliche Feststellung`, und PROJ-Y-148f hängt daran. Das wartet auf eine
  **rechtliche Feststellung durch den Verantwortlichen**, nicht auf Entwicklungsarbeit.
- **D-166.3:** kein CIA-Pass, kein eigener `/qa`-Durchgang (Präzedenz PROJ-150 · 157 · Y-148e).
- **D-166.4:** die drei spec-losen Zeilen bleiben spec-los. Das ist ein **Urteil**, keine
  Unterlassung: eine Spec ohne belegten Bedarf veraltet genauso wie die vier, die diese Tranche
  gerade erden musste.

## Nachweise

- Jede Ersetzung mit `count == 1`-Ankerprüfung.
- Messungen einzeln reproduzierbar: OCR-Verankerung `dms/extraction.ts:164` · Parser-Grenzen
  `file-parser.ts:38-42` · `vercel.json` ohne Memory-Konfiguration · gemeinsamer Parser
  `dms/extraction.ts:18-20` · Mengen 9 / 6 / 2 (`DMS_ALLOWED_MIME_TYPES`, `ALLOWED_MIME_TYPES`,
  `NOT_RAG_PARSEABLE`) · Fehlerabbildung `extraction.ts:81-83`.
- Umfang: `src/` 0 Dateien, `supabase/migrations/` 0, `package.json` 0.
