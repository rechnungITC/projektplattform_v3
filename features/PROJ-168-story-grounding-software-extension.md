# PROJ-168 — Portfolio-Erdung Tranche 4: die Software-Extension (PROJ-46)

## Status: In Review
## Deployment Scope: —

**Created:** 2026-09-02

## Problem

PROJ-46 ist die **älteste offene Story des Portfolios** — entstanden am 2026-05-06, seit dem
2026-05-12 unverändert. Sie bündelt vier User Stories: Releases, technische Abhängigkeiten,
Test-/Abnahme-Traceability und Jira-Kompatibilität.

In den knapp vier Monaten seither sind diese vier Teile in **vier verschiedene Zustände**
auseinandergelaufen. Solange sie unter einer Kennung stehen, ist die Story nicht bewertbar: „Planned"
sagt weder, dass ein Viertel fertig ist, noch dass ein anderes seine Begründung verloren hat.

## Die vier Urteile

| Teil | Zustand | Gemessen |
|---|---|---|
| **ST-01 Releases** | **vollständig erfüllt** | `releases` mit `tenant_id` **und** `project_id`, `work_items.release_id`, `status`, `start_date`/`end_date`, `/releases`-Route — alles über PROJ-61 (`Deployed / full`) |
| **ST-02 Technische Abhängigkeiten** | **teilweise, auf der falschen Achse** | `constraint_type` = `FS·SS·FF·SF` (zeitlich) statt technisch-gegen-fachlich; kein Begründungsfeld unter 10 live gemessenen Spalten; Cross-Project über `from_type='project'` direkt möglich |
| **ST-03 Test-/Abnahme-Traceability** | **vollständig unberührt** | `test_case` · `test_run` · `test_result` · `acceptance_check` je **0** Treffer in Migrationen **und** `src/` |
| **ST-04 Jira-Kompatibilität** | **Richtung umgedreht** | Mapping kennt Status, Priorität, Labels, Assignee — **0** Release-/Dependency-/Test-Felder. PROJ-47 (`full`) und PROJ-50 (`mvp`) sind fertig, **ohne** diese Story |

### ST-04 ist der interessanteste Fall

Die Spec führt oben „**Influences:** PROJ-47/50 Jira connector features" — sie war als **Vorarbeit**
gedacht, damit die Konnektoren ein eindeutiges Mapping vorfinden. Tatsächlich sind beide Konnektoren
**ausgeliefert**, mit `jira_field_mappings`, `jira_export_jobs` und `external_refs`, und haben nicht
auf sie gewartet.

Was von ST-04 bleibt, ist deshalb **keine Vorarbeit mehr, sondern eine Nachrüstung an einem
laufenden Konnektor** — anderer Zuschnitt, anderes Risiko, andere Abnahme. Eine Abhängigkeitsrichtung
hat sich gedreht, und das steht in keiner Spec.

## Nutzungsmessung — anders als beim M&A-Epic

Live gegen Prod am 2026-09-02:

| Gemessen | Wert |
|---|---|
| `releases` | **2** |
| `work_items` mit `release_id` | **3** |
| `dependencies` | **5** — alle `FS`, **0** mit Abstand ≠ 0, **0** Projekt-Kanten |
| `work_items` mit `kind='bug'` | **0** |

**ST-01 ist nicht nur gebaut, sondern in Gebrauch** — anders als das M&A-Epic aus Tranche 3, das bei
34 ausgelieferten Slices null Nutzung zeigt.

**Und die Dependency-Zeile trägt ein Argument:** PROJ-155-β.1 hat am 2026-09-01 Typ und Abstand als
bedienbare Objekte geliefert, und alle fünf Kanten in Prod sind weiterhin `FS` mit Abstand 0. Der
Mechanismus ist ausgeliefert und **noch nie benutzt**. Eine **zweite** Unterscheidungsachse (ST-02s
fachliche Art) zu bauen, während die erste ungenutzt ist, wäre Vorratsarbeit — kein Verbot, aber ein
Punkt, der vor dem Bau auf den Tisch gehört.

## Zwei Funde, die ohne Nachmessen falsch in die Spec gewandert wären

1. **Die Namensfalle `cross_project_links`.** Der Name hat **8 Treffer** in den Migrationen, und ich
   hatte ihn bereits als PROJ-27s Verknüpfungstabelle in die Erdung geschrieben. Die Live-Abfrage
   scheiterte mit `relation "cross_project_links" does not exist`: es ist ein **AIPurpose**-Wert in
   den Purpose-CHECKs (PROJ-65-ε.4.γ), keine Tabelle. PROJ-27s Tabelle heißt **`work_item_links`**.
   Wer nach dem Namen greppt, findet einen KI-Zweck und hält ihn für ein Datenobjekt.
2. **Die Kantenzahl.** Ich hatte „5 Kanten" aus dem PROJ-155-β-Design-Brief übernommen statt sie zu
   messen. Sie stimmt — aber die Messung lieferte zusätzlich, dass **alle fünf** `FS` mit Abstand 0
   sind, und genau das ist das Argument gegen ST-02. Eine übernommene Zahl hätte den Befund nicht
   ergeben.

## Das Urteil: aufteilen, nicht α/β schneiden

Bei PROJ-82/83 (Tranche 1) genügte ein α/β-Schnitt, weil dort **eine** Fachlichkeit an einer
gesperrten Abhängigkeit hing. Hier ist es anders: die vier Teile haben nach vier Monaten **keine
gemeinsame Restarbeit** mehr — also weder einen gemeinsamen Nachweis noch eine gemeinsame Abnahme.

Vorgeschlagen, **nicht** entschieden:

- **ST-01 abhaken** — erfüllt durch PROJ-61, je Kriterium mit Nachweis.
- **ST-02 als kleine Nachrüstung** (fachliche Art · Begründungsfeld · „kritisch"-Merkmal an der
  Kante). Vorfrage: ist der Umweg über PROJ-27 überhaupt noch gewollt, wo `from_type='project'`
  direkt erlaubt ist?
- **ST-03 als eigene Slice** — der eigentliche Kern und das größte Stück. Testmanagement ist eine
  eigene Fachlichkeit, und die Hausregel „search for the primitive that already exists" ist hier mit
  0 Treffern **ergebnislos**: es entsteht wirklich Neues.
- **ST-04 dorthin, wo das Mapping lebt** (PROJ-47/50), als Nachrüstung statt als Vorlauf.

## Akzeptanzkriterien

- **AC-168.1** — Jede der vier User Stories in PROJ-46 trägt ein Urteil an ihren eigenen
  Akzeptanzkriterien, nicht nur einen Abschnitt am Dateiende.
- **AC-168.2** — Erfüllte Kriterien sind **abgehakt und mit Nachweis versehen**; teilweise erfüllte
  als `[~]` mit Angabe, welche Hälfte fehlt.
- **AC-168.3** — Die umgedrehte Abhängigkeitsrichtung bei ST-04 ist ausgesprochen, weil sie den
  Zuschnitt ändert und in keiner Spec stand.
- **AC-168.4** — Die Nutzungsmessung ist live erhoben und in ein Argument übersetzt, nicht als
  Zahlenliste abgelegt.
- **AC-168.5** — Die Namensfalle `cross_project_links` ist benannt, damit die nächste Sitzung nicht
  dieselbe Verwechslung macht.
- **AC-168.6** — Der PRD-Eintrag führt die Kennung statt `_TBD_`, und die überholten Punkte darin
  sind benannt.
- **AC-168.7** — Was diese Erdung **nicht** entschieden hat, ist benannt.
- **AC-168.8** — Kein `src/`-Diff, keine Migration, kein Paket; alle Datei-Wächter grün.

## Bewusste Abweichungen und Grenzen

- **D-168.1:** die Akzeptanzkriterien von PROJ-46 sind **angefasst** — Checkboxen gesetzt und
  Nachweise ergänzt. Anders als in Tranche 3 (wo nichts widerlegt war) ist das hier richtig: ein
  erfülltes Kriterium leer zu lassen behauptet offene Arbeit. Der **Wortlaut** jedes Kriteriums
  bleibt unverändert.
- **D-168.2:** die Aufteilung wird **nicht** vollzogen. Vier neue Kennungen zu vergeben, bevor
  entschieden ist, ob ST-03 überhaupt gewollt ist, wäre genau das ID-Vorausversprechen, das PROJ-164
  abgeschafft hat.
- **D-168.3:** kein CIA-Pass, kein eigener `/qa`-Durchgang (Präzedenz PROJ-150 · 157 · Y-148e).
- **D-168.4:** ob ST-03 (Testmanagement) fachlich gewollt ist, ist **nicht** beurteilt — der erste
  Pilot ist ERP, nicht Software. Das ist eine Produktfrage.

## Nachweise

- Schema live gemessen: `dependencies` (10 Spalten, kein Begründungsfeld), vier CHECKs inklusive
  `from_type`/`to_type` mit `project · phase · work_package · todo · sprint`.
- `releases` und `work_items.release_id` aus den Migrationen, Nutzung aus Prod (2 / 3).
- Abwesenheiten gemessen, nicht angenommen: `test_case`/`test_run`/`test_result`/`acceptance_check`
  je 0 in Migrationen und `src/`; `release`/`fixVersion`/`dependenc`/`testcase` je 0 in
  `src/lib/jira/`.
- `cross_project_links` als Tabelle **widerlegt** (Live-Fehler `42P01`), als AIPurpose belegt.
- Jede Textersetzung mit `count == 1`-Ankerprüfung; Backtick-Balance der INDEX-Zeile gegengeprüft
  (62, gerade).
- Umfang: `src/` 0 Dateien, `supabase/migrations/` 0, `package.json` 0.
