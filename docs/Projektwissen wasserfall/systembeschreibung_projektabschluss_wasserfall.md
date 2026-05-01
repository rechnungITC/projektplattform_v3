# Systembeschreibung: Projektabschluss im Wasserfall-/PMI-Projektmodell

## 1. Zweck des Moduls

Das Modul **Projektabschluss** dient dazu, ein Projekt innerhalb der Projektmanagement-Plattform formal, fachlich, kaufmännisch und organisatorisch sauber zu beenden.

Der Projektabschluss ist nicht nur ein administrativer letzter Schritt, sondern eine eigene Projektphase. Sie stellt sicher, dass:

- das Projektergebnis formal abgenommen wurde,
- offene Punkte dokumentiert und bewertet wurden,
- Kosten, Termine, Ressourcen und Leistungen abschließend ausgewertet wurden,
- Verträge beendet oder an den Betrieb übergeben wurden,
- Projekterfahrungen gesichert wurden,
- die Projektdokumentation vollständig archiviert wurde,
- Ressourcen wieder freigegeben wurden,
- die Projektorganisation formal aufgelöst wurde,
- das Projektende bestätigt und nachvollziehbar dokumentiert wurde.

Die Software soll den Projektabschluss als geführten Prozess abbilden. Die KI soll den Projektleiter dabei dialoggeführt durch alle Abschlussaktivitäten führen, fehlende Informationen erkennen und passende Abschlussdokumente vorbereiten können.

---

## 2. Einordnung im Wasserfall-Projektmodell

Der Projektabschluss folgt nach Umsetzung, Test, Abnahme und Übergabe. Er ist die formale Beendigung des Projekts.

```text
Projektinitiierung
→ Projektplanung
→ Umsetzung / Durchführung
→ Steuerung / Controlling
→ Abnahme
→ Projektabschluss
→ Bestätigung Projektende
```

Der Abschluss wird erst gestartet, wenn mindestens eine der folgenden Bedingungen erfüllt ist:

- finales Projektergebnis liegt vor,
- Abnahmeprozess wurde gestartet,
- wesentliche Projektleistungen wurden erbracht,
- Projekt wurde vorzeitig beendet,
- Projekt wurde gestoppt oder abgebrochen,
- Projekt wurde in Betrieb / Linie / Support übergeben.

---

## 3. Abschlussprozess in der Software

Der Abschlussprozess sollte als Statusworkflow umgesetzt werden.

```text
Nicht gestartet
→ Abschluss vorbereitet
→ Abnahme in Prüfung
→ Nachkalkulation in Bearbeitung
→ Abschlussbericht in Bearbeitung
→ Abschlussbesprechung geplant
→ Lessons Learned dokumentiert
→ Dokumentation archiviert
→ Ressourcen zurückgeführt
→ Projektorganisation aufgelöst
→ Projekt formal abgeschlossen
```

Optional kann der Projektabschluss in einzelne Abschluss-Checklisten unterteilt werden.

---

## 4. Abschlussphasen und Arbeitsschritte

| Nr. | Abschlussaktivität | Zweck | Ergebnis in der Software |
|---:|---|---|---|
| 1 | Finale Abnahme einleiten | Prüfen, ob Ergebnis formal akzeptiert wird | Abnahmecheckliste / Abnahmeprotokoll |
| 2 | Nachkalkulation erstellen | Abgleich Planung vs. Ist-Werte | Nachkalkulationsbericht |
| 3 | Verträge beenden / übergeben | Vertragsstatus klären | Vertragsabschlussliste |
| 4 | Projektabschlussbericht erstellen | Gemeinsame Abschlussbewertung erzeugen | Abschlussbericht |
| 5 | Abschlussbesprechung durchführen | Erkenntnisse und Lessons Learned sichern | Protokoll / Maßnahmenliste |
| 6 | Leistungen würdigen | Projektteam formal anerkennen | Würdigungs-/Feedbacknotiz |
| 7 | Projekterfahrungen sichern | Wissensmanagement stärken | Lessons-Learned-Datenbank |
| 8 | Projektdokumentation archivieren | Nachvollziehbarkeit sicherstellen | Archivierte Projektakte |
| 9 | Ressourcen rückführen | Personen, Geräte, Budgets freigeben | Ressourcenrückführung |
| 10 | Projektorganisation auflösen | Verantwortlichkeiten beenden | Organisationsabschluss |
| 11 | Projektende bestätigen | Formales Projektende dokumentieren | Abschlussfreigabe |

---

## 5. Digitale Abschluss-Checkliste

Die Plattform sollte eine Abschluss-Checkliste je Projekt bereitstellen.

| Checkpunkt | Pflicht | Status | Verantwortlich | Nachweis / Dokument |
|---|---:|---|---|---|
| Zielkatalog final geprüft | Ja | Offen / In Prüfung / Erledigt | Projektleiter | Zielerreichungsbewertung |
| Abnahmeerklärung liegt vor | Ja | Offen / In Prüfung / Erledigt | Auftraggeber / PAG | Abnahmeprotokoll |
| Liste offener Punkte gepflegt | Ja | Offen / In Prüfung / Erledigt | Projektleiter | Offene-Punkte-Liste |
| Änderungsliste finalisiert | Ja | Offen / In Prüfung / Erledigt | Change-Verantwortlicher | Change-Log |
| Projektdokumentation vollständig | Ja | Offen / In Prüfung / Erledigt | PMO / Projektleiter | Projektakte |
| Betriebshandbuch vorhanden | Optional / abhängig vom Projekttyp | Offen / In Prüfung / Erledigt | Betrieb / IT | Betriebshandbuch |
| Schulungsnachweise vorhanden | Optional / abhängig vom Projekttyp | Offen / In Prüfung / Erledigt | Schulungsverantwortlicher | Schulungsnachweise |
| Auditprotokolle vorhanden | Optional / abhängig vom Projekttyp | Offen / In Prüfung / Erledigt | Qualität / Compliance | Auditprotokolle |
| Nachkalkulation erstellt | Ja | Offen / In Prüfung / Erledigt | Projektcontroller | Nachkalkulation |
| Abschlussbericht erstellt | Ja | Offen / In Prüfung / Erledigt | Projektleiter | Projektabschlussbericht |
| Lessons Learned dokumentiert | Ja | Offen / In Prüfung / Erledigt | Projektleiter / Team | Lessons-Learned-Protokoll |
| Ressourcen freigegeben | Ja | Offen / In Prüfung / Erledigt | Ressourcenmanager | Ressourcenfreigabe |
| Verträge beendet oder übergeben | Ja | Offen / In Prüfung / Erledigt | Einkauf / Legal / PL | Vertragsstatusliste |
| Projektorganisation aufgelöst | Ja | Offen / In Prüfung / Erledigt | Projektleiter | Abschlussbestätigung |

---

## 6. KI-Dialog für den Projektabschluss

Die KI soll den Projektleiter dialoggeführt durch den Abschluss führen. Dabei werden Informationen abgefragt, geprüft und in strukturierte Abschlussdokumente überführt.

### 6.1 Startdialog

```text
Möchtest du den Projektabschluss für dieses Projekt vorbereiten?

Die folgenden Bereiche werden geprüft:
1. Abnahme
2. Nachkalkulation
3. Offene Punkte
4. Verträge
5. Abschlussbericht
6. Lessons Learned
7. Projektdokumentation
8. Ressourcenrückführung
9. Projektorganisation
10. finale Bestätigung
```

### 6.2 Fragen zur finalen Abnahme

```text
Wurde das Projektergebnis bereits vom Auftraggeber geprüft?
Liegt eine formale Abnahmeerklärung vor?
Gibt es offene Punkte, die trotz Abnahme bestehen bleiben?
Gibt es Mängel, Restarbeiten oder Nachforderungen?
Wer muss die finale Abnahme bestätigen?
Soll die Bestätigung per Freigabe-Workflow eingeholt werden?
```

### 6.3 Fragen zur Nachkalkulation

```text
Sind alle geplanten Kosten aus der Baseline vorhanden?
Sind alle Ist-Kosten vollständig erfasst?
Gibt es Kostenpositionen, die noch nicht final gebucht sind?
Gab es Budgetabweichungen?
Was waren die Hauptursachen für Abweichungen?
Welche Erfahrungswerte sollen für zukünftige Projekte gespeichert werden?
```

### 6.4 Fragen zu Verträgen

```text
Gab es projektbezogene Verträge mit Kunden, Lieferanten oder Dienstleistern?
Welche Verträge enden mit dem Projekt?
Welche Verträge müssen in den Betrieb überführt werden?
Welche Verträge sind noch offen?
Gibt es Gewährleistung, Wartung, Support oder Lizenzthemen?
Wer bestätigt den Vertragsabschluss?
```

### 6.5 Fragen zum Abschlussbericht

```text
Was war das ursprüngliche Projektziel?
Welche Ergebnisse wurden geliefert?
Welche Ziele wurden vollständig erreicht?
Welche Ziele wurden teilweise oder nicht erreicht?
Welche Termine wurden eingehalten oder überschritten?
Welche Kostenabweichungen gab es?
Welche Qualitätsabweichungen gab es?
Welche wesentlichen Änderungen wurden im Projektverlauf entschieden?
Welche offenen Punkte bleiben nach Projektabschluss bestehen?
Welche Empfehlungen gibt es für Anschlussprojekte?
```

### 6.6 Fragen zu Lessons Learned

```text
Was lief im Projekt besonders gut?
Was lief nicht gut?
Welche Ursachen gab es für Probleme?
Welche Entscheidungen waren besonders hilfreich?
Welche Fehler sollten künftig vermieden werden?
Welche Vorlagen, Checklisten oder Prozesse sollten verbessert werden?
Welche Erkenntnisse sollen in die Wissensdatenbank übernommen werden?
```

### 6.7 Fragen zur Dokumentation

```text
Ist die Projektdokumentation vollständig?
Sind alle Pläne, Protokolle, Abnahmen, Reports und Entscheidungen abgelegt?
Gibt es eine finale Version des Projektabschlussberichts?
Wurde die Projektakte archiviert?
Wer darf nach Abschluss noch auf die Dokumentation zugreifen?
Wie lange muss die Dokumentation aufbewahrt werden?
```

### 6.8 Fragen zur Ressourcenrückführung

```text
Welche Projektmitarbeiter sind noch aktiv zugeordnet?
Wann werden die Mitarbeiter aus dem Projekt freigegeben?
Welche Geräte, Materialien oder Lizenzen müssen zurückgeführt werden?
Welche Budgets oder Restmittel müssen geschlossen oder umgebucht werden?
Welche Rollen und Berechtigungen müssen entzogen werden?
```

---

## 7. Datenmodell für den Projektabschluss

### 7.1 Entität: ProjectClosure

| Feld | Typ | Beschreibung |
|---|---|---|
| closure_id | UUID | Eindeutige ID des Projektabschlusses |
| project_id | UUID | Referenz auf das Projekt |
| closure_status | Enum | Status des Abschlussprozesses |
| closure_started_at | DateTime | Startdatum des Abschlusses |
| closure_completed_at | DateTime | Abschlussdatum |
| closure_owner_id | UUID | Verantwortlicher Projektleiter |
| approval_status | Enum | Status der finalen Abnahme |
| financial_closure_status | Enum | Status der Nachkalkulation |
| documentation_status | Enum | Status der Archivierung |
| resource_return_status | Enum | Status der Ressourcenrückführung |
| contract_closure_status | Enum | Status der Verträge |
| lessons_learned_status | Enum | Status Lessons Learned |
| final_confirmation_status | Enum | Finale Abschlussbestätigung |

### 7.2 Entität: ClosureChecklistItem

| Feld | Typ | Beschreibung |
|---|---|---|
| item_id | UUID | Eindeutige ID |
| closure_id | UUID | Referenz auf Projektabschluss |
| title | Text | Checklistenpunkt |
| category | Enum | Abnahme / Finanzen / Dokumentation / Ressourcen / Verträge / Lessons Learned |
| mandatory | Boolean | Pflichtfeld ja/nein |
| status | Enum | Offen / In Prüfung / Erledigt / Nicht relevant |
| responsible_id | UUID | Verantwortliche Person |
| due_date | Date | Zieltermin |
| evidence_required | Boolean | Nachweis erforderlich |
| evidence_document_id | UUID | Referenz auf Nachweis |
| comment | Text | Bemerkung |

### 7.3 Entität: FinalAcceptance

| Feld | Typ | Beschreibung |
|---|---|---|
| acceptance_id | UUID | Eindeutige ID |
| project_id | UUID | Projektbezug |
| acceptance_type | Enum | Teilabnahme / Schlussabnahme / bedingte Abnahme / abgelehnt |
| acceptance_status | Enum | Offen / Angefragt / Bestätigt / Abgelehnt |
| accepted_by | UUID | Abnehmende Person |
| accepted_at | DateTime | Datum der Abnahme |
| open_items_exist | Boolean | Offene Punkte vorhanden |
| open_items_summary | Text | Zusammenfassung offener Punkte |
| approval_document_id | UUID | Abnahmeprotokoll |
| digital_signature_required | Boolean | digitale Bestätigung erforderlich |

### 7.4 Entität: LessonsLearnedEntry

| Feld | Typ | Beschreibung |
|---|---|---|
| entry_id | UUID | Eindeutige ID |
| project_id | UUID | Projektbezug |
| category | Enum | Planung / Termine / Kosten / Qualität / Kommunikation / Ressourcen / Risiken / Lieferanten / Technik |
| observation | Text | Beobachtung |
| cause | Text | Ursache |
| impact | Text | Auswirkung |
| recommendation | Text | Empfehlung für künftige Projekte |
| reusable_as_template | Boolean | Als Vorlage nutzbar |
| visibility | Enum | Projektintern / Organisation / PMO / Management |

---

## 8. Status- und Freigabelogik

### 8.1 Projektabschlussstatus

| Status | Bedeutung | Nächster möglicher Schritt |
|---|---|---|
| Nicht gestartet | Abschluss wurde noch nicht begonnen | Abschluss vorbereiten |
| In Vorbereitung | Abschlussdaten werden gesammelt | Abnahme anfragen |
| Abnahme angefragt | Auftraggeber/PAG muss bestätigen | Abnahme bestätigen oder ablehnen |
| Abnahme bestätigt | Projektergebnis formal akzeptiert | Nachkalkulation / Abschlussbericht |
| Abschlussbericht in Arbeit | Abschlussbericht wird erstellt | Review anfordern |
| Review in Arbeit | Bericht wird geprüft | Freigabe oder Rückfrage |
| Archivierung offen | Dokumentation noch nicht vollständig archiviert | Archivierung abschließen |
| Ressourcenrückführung offen | Ressourcen noch nicht vollständig freigegeben | Ressourcen zurückführen |
| Abschlussfreigabe angefragt | finale Freigabe steht aus | Projekt schließen |
| Abgeschlossen | Projekt formal beendet | Nur noch lesender Zugriff |

### 8.2 Digitale Freigabe statt Unterschrift

Die klassische Unterschrift wird im System durch einen digitalen Freigabeprozess ersetzt.

```text
Freigabe anfordern
→ Benachrichtigung per E-Mail / Systemnachricht
→ Verantwortlicher öffnet Freigabeseite
→ Prüfung der Abschlussunterlagen
→ Entscheidung: Freigeben / Ablehnen / Rückfrage
→ Kommentar erfassen
→ Zeitstempel und Benutzer speichern
→ Audit-Log aktualisieren
```

Freigaben können erforderlich sein durch:

- Projektleiter,
- Auftraggeber,
- Lenkungsausschuss,
- Projektcontroller,
- Einkauf / Vertragsmanagement,
- Betriebsverantwortliche,
- PMO.

---

## 9. Beispiel: Projektabschluss für CRM-Einführungsprojekt

### 9.1 Projektdaten

| Feld | Beispiel |
|---|---|
| Projektname | CRM Einführung Standort Berlin |
| Projektleiter | Max Mustermann |
| Auftraggeber | Geschäftsführung Vertrieb |
| Projektstart | 01.03.2026 |
| geplantes Projektende | 30.09.2026 |
| tatsächliches Projektende | 15.10.2026 |
| Abschlussstatus | Abschlussbericht in Review |

### 9.2 Abschluss-Checkliste Beispiel

| Checkpunkt | Status | Verantwortlich | Kommentar |
|---|---|---|---|
| Zielkatalog geprüft | Erledigt | Projektleiter | 8 von 9 Zielen erfüllt |
| Abnahmeerklärung erstellt | In Prüfung | Auftraggeber | bedingte Abnahme wegen 2 Restpunkten |
| Offene Punkte dokumentiert | Erledigt | Projektleiter | 2 Restarbeiten bis 31.10.2026 |
| Nachkalkulation erstellt | Erledigt | Projektcontroller | Budgetüberschreitung 6,5 % |
| Verträge geprüft | Erledigt | Einkauf | Supportvertrag wird in Betrieb überführt |
| Abschlussbericht erstellt | In Review | Projektleiter | Review durch PAG offen |
| Abschlussbesprechung durchgeführt | Offen | Projektleiter | Termin geplant |
| Lessons Learned erfasst | Offen | Projektteam | Workshop noch offen |
| Dokumentation archiviert | In Bearbeitung | PMO | Betriebsdokumentation fehlt |
| Ressourcen rückgeführt | Offen | Ressourcenmanager | 2 Key User noch in Hypercare |
| Projektorganisation aufgelöst | Offen | Projektleiter | nach Hypercare |

### 9.3 Beispielhafte Lessons Learned

| Kategorie | Beobachtung | Ursache | Empfehlung |
|---|---|---|---|
| Anforderungen | Einige Anforderungen wurden zu spät konkretisiert | Fachbereiche waren in Analysephase nicht vollständig verfügbar | Fachbereichsverfügbarkeit bereits in Projektinitiierung verbindlich planen |
| Datenmigration | Datenqualität war schlechter als erwartet | Altdaten wurden vor Projektstart nicht geprüft | Datenqualitätsanalyse als eigenes Arbeitspaket aufnehmen |
| Schulung | Key-User konnten schnell produktiv arbeiten | frühe Einbindung in Testphase | Key-User-Konzept als Standard beibehalten |
| Termine | Go-Live hat sich um 2 Wochen verschoben | offene Schnittstellenklärung | Schnittstellenrisiken früher im Risikoregister bewerten |

---

## 10. Dashboard-Auswertungen für den Projektabschluss

| Dashboard-Kachel | Kennzahl | Logik |
|---|---|---|
| Abschlussstatus | Prozent erledigter Abschluss-Checklistenpunkte | erledigte Pflichtpunkte / alle Pflichtpunkte |
| Abnahmestatus | Offen / Angefragt / Bestätigt / Abgelehnt | Status aus FinalAcceptance |
| Offene Punkte | Anzahl offener Restpunkte | offene Items mit Status ≠ erledigt |
| Nachkalkulation | Planbudget vs. Ist-Kosten | Ist-Kosten - Planbudget |
| Budgetabweichung | Prozentuale Abweichung | `(Ist-Kosten - Planbudget) / Planbudget` |
| Vertragsstatus | offene / beendete / überführte Verträge | Gruppierung nach Vertragsstatus |
| Dokumentationsstatus | Vollständigkeit Projektakte | vorhandene Pflichtdokumente / erwartete Pflichtdokumente |
| Ressourcenstatus | noch gebundene Ressourcen | aktive Ressourcenzuordnungen nach geplantem Projektende |
| Lessons Learned | Anzahl dokumentierter Erkenntnisse | Einträge je Kategorie |
| Abschlussfreigaben | offene Freigaben | Freigabeanforderungen mit Status offen |

---

## 11. Automatisierungen im System

Die Software sollte den Projektabschluss aktiv unterstützen.

### 11.1 Automatische Hinweise

```text
Wenn Projektenddatum erreicht und Status nicht abgeschlossen:
→ Projektleiter erhält Hinweis zur Abschlussvorbereitung.

Wenn Abnahme bestätigt und Abschlussbericht fehlt:
→ System schlägt Erstellung des Abschlussberichts vor.

Wenn Ressourcen nach Projektende noch aktiv gebucht sind:
→ Ressourcenmanager erhält Rückführungsaufgabe.

Wenn Pflichtdokumente fehlen:
→ PMO erhält Hinweis zur Dokumentationslücke.

Wenn Lessons Learned noch nicht dokumentiert sind:
→ System schlägt Abschlussbesprechung vor.
```

### 11.2 Automatische Dokumentenerstellung

Die KI kann aus vorhandenen Projektdaten folgende Dokumente vorbereiten:

- Projektabschlussbericht,
- Nachkalkulationsbericht,
- Abnahmeprotokoll,
- Offene-Punkte-Liste,
- Lessons-Learned-Protokoll,
- Ressourcenrückführungsübersicht,
- Vertragsabschlussliste,
- Management Summary zum Projektabschluss.

---

## 12. User Story: Projektabschluss digital durchführen

```markdown
# User Story: Projektabschluss digital durchführen

## Status
Proposed

## User Story
Als Projektleiter möchte ich den Projektabschluss digital und geführt durchführen, damit alle Abschlussaktivitäten vollständig, nachvollziehbar und freigegeben dokumentiert werden.

## Akzeptanzkriterien
- [ ] Das System stellt eine Abschluss-Checkliste mit Pflicht- und optionalen Punkten bereit.
- [ ] Der Projektleiter kann den Abschlussprozess aus dem Projekt heraus starten.
- [ ] Das System prüft, ob finale Abnahme, Nachkalkulation, Abschlussbericht, Dokumentation, Ressourcenrückführung und Vertragsstatus vollständig sind.
- [ ] Fehlende Abschlussinformationen werden sichtbar markiert.
- [ ] Die KI kann fehlende Informationen dialoggeführt abfragen.
- [ ] Der Projektabschlussbericht kann automatisch aus vorhandenen Projektdaten vorbereitet werden.
- [ ] Finale Abnahmen können digital per Freigabe-Workflow angefordert werden.
- [ ] Jede Freigabe enthält Benutzer, Datum, Entscheidung und Kommentar.
- [ ] Offene Punkte können auch nach bedingter Abnahme weiterverfolgt werden.
- [ ] Lessons Learned können strukturiert erfasst und für zukünftige Projekte wiederverwendet werden.
- [ ] Nach Abschluss wird das Projekt auf lesenden Zugriff umgestellt.
- [ ] Der Abschlussstatus ist im Management-Dashboard sichtbar.

## Nicht-Akzeptanzkriterien
- [ ] Ein Projekt darf nicht ohne Abnahme- oder Abschlussbegründung geschlossen werden.
- [ ] Pflichtdokumente dürfen nicht stillschweigend fehlen.
- [ ] Freigaben dürfen nicht ohne Audit-Log gespeichert werden.
- [ ] Ressourcen dürfen nicht automatisch gelöscht werden; sie müssen nachvollziehbar zurückgeführt oder freigegeben werden.
- [ ] Lessons Learned dürfen nicht nur als Freitext ohne Kategorie gespeichert werden.

## Definition of Ready
- [ ] Projektphasenmodell ist definiert.
- [ ] Pflichtdokumente je Projekttyp sind definiert.
- [ ] Rollen für Abschlussfreigaben sind definiert.
- [ ] Statuslogik für Projektabschluss ist abgestimmt.
- [ ] Dokumentenablage / Projektakte ist vorhanden.
- [ ] Ressourcen- und Kosteninformationen sind im System verfügbar.

## Definition of Done
- [ ] Abschlussworkflow ist implementiert.
- [ ] Abschluss-Checkliste ist konfigurierbar.
- [ ] Digitale Freigaben funktionieren mit Audit-Log.
- [ ] Abschlussbericht kann erzeugt werden.
- [ ] Lessons Learned können gespeichert und wiederverwendet werden.
- [ ] Ressourcenrückführung ist dokumentierbar.
- [ ] Dashboard-Kennzahlen werden berechnet.
- [ ] Projekt kann formal abgeschlossen und archiviert werden.
```

---

## 13. Systemanforderungen

### 13.1 Funktionale Anforderungen

| ID | Anforderung | Priorität |
|---|---|---|
| PA-001 | Das System muss einen Projektabschlussprozess bereitstellen. | Must-have |
| PA-002 | Das System muss eine digitale Abschluss-Checkliste erzeugen. | Must-have |
| PA-003 | Das System muss finale Abnahmen digital erfassen können. | Must-have |
| PA-004 | Das System muss Nachkalkulationen aus Plan- und Ist-Werten unterstützen. | Must-have |
| PA-005 | Das System muss Projektabschlussberichte erzeugen können. | Must-have |
| PA-006 | Das System muss Lessons Learned strukturiert speichern können. | Must-have |
| PA-007 | Das System muss Projektdokumentation als Projektakte archivieren können. | Must-have |
| PA-008 | Das System muss Ressourcenrückführung dokumentieren können. | Should-have |
| PA-009 | Das System muss Vertragsabschluss und Übergabe an Betrieb dokumentieren können. | Should-have |
| PA-010 | Das System muss Abschlusskennzahlen im Dashboard anzeigen können. | Should-have |
| PA-011 | Das System sollte KI-gestützte Abschlussberichte vorschlagen können. | Could-have |
| PA-012 | Das System sollte Lessons Learned projektübergreifend wiederverwendbar machen. | Could-have |

### 13.2 Nicht-funktionale Anforderungen

| Bereich | Anforderung |
|---|---|
| Nachvollziehbarkeit | Jede Abschlussfreigabe muss mit Benutzer, Zeitstempel und Entscheidung gespeichert werden. |
| Revisionssicherheit | Archivierte Abschlussdokumente dürfen nicht ohne neue Version überschrieben werden. |
| Zugriffsschutz | Nach Projektabschluss soll standardmäßig lesender Zugriff gelten. |
| Wiederverwendbarkeit | Lessons Learned sollen für zukünftige Projektplanung nutzbar sein. |
| Reporting | Abschlussstatus muss für Management und PMO auswertbar sein. |
| Datenqualität | Pflichtfelder müssen validiert werden, bevor ein Projekt abgeschlossen werden kann. |

---

## 14. Validierungsregeln

| Regel | Beschreibung | Fehlermeldung |
|---|---|---|
| VR-001 | Projekt kann nicht abgeschlossen werden, wenn keine finale Abnahme oder Abschlussbegründung vorhanden ist. | Finale Abnahme oder Abschlussbegründung fehlt. |
| VR-002 | Pflichtdokumente müssen vorhanden oder begründet als nicht relevant markiert sein. | Pflichtdokumente sind unvollständig. |
| VR-003 | Offene Punkte müssen einen Verantwortlichen und Zieltermin haben. | Offene Punkte sind nicht steuerbar. |
| VR-004 | Nachkalkulation muss Plan- und Ist-Werte enthalten. | Nachkalkulation ist unvollständig. |
| VR-005 | Aktive Ressourcen nach Projektende müssen geprüft werden. | Es sind noch Ressourcen aktiv zugeordnet. |
| VR-006 | Abschlussfreigaben benötigen Kommentar bei Ablehnung. | Bitte Ablehnungsgrund dokumentieren. |
| VR-007 | Lessons Learned benötigen Kategorie und Empfehlung. | Lessons Learned ist unvollständig. |

---

## 15. Ergebnis

Mit diesem Modul wird der Projektabschluss zu einem strukturierten, nachvollziehbaren und auswertbaren Prozess innerhalb der Projektmanagement-Plattform.

Die Plattform unterstützt damit nicht nur die formale Beendigung eines Projekts, sondern auch:

- kaufmännische Auswertung,
- organisatorische Rückführung,
- Dokumentationssicherheit,
- Wissensmanagement,
- Management-Reporting,
- kontinuierliche Verbesserung zukünftiger Projekte.

Der Projektabschluss wird dadurch nicht als reine Ablage verstanden, sondern als steuerbarer Prozess mit Freigaben, Datenqualität, Erfahrungsrückfluss und klarer Abschlussverantwortung.
