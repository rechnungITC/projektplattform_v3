# Systembeschreibung: Umgang mit arbeitsrechtlichen Epics, Stories und Arbeitspaketen in der Projektmanagement-Plattform

**Dokumenttyp:** Fachliche Systembeschreibung / Anforderungslogik  
**Bereich:** Arbeitsrecht, HR-Prozesse, Betriebsrat, Arbeitnehmerüberlassung, Verträge, Urlaub, Abmahnung, Kündigung, Befristung  
**Ziel:** Rechtssichere, nachvollziehbare und KI-gestützte Strukturierung von Epics, Stories und Arbeitspaketen in arbeitsrechtlich sensiblen Projektbereichen  
**Rechtsstand:** 02.05.2026, auf Basis öffentlich zugänglicher Gesetzesquellen und ausgewählter BAG-Rechtsprechung  
**Hinweis:** Dieses Dokument ist eine fachliche und systemische Beschreibung für Softwareanforderungen. Es ersetzt keine arbeitsrechtliche Einzelfallprüfung durch qualifizierte Rechtsberatung.

---

## 1. Ziel des Moduls

Das Modul soll sicherstellen, dass arbeitsrechtlich relevante Themen innerhalb der Projektmanagement-Plattform nicht wie normale technische Aufgaben behandelt werden, sondern als **compliance-kritische Vorgänge** mit:

- klarer rechtlicher Einordnung,
- dokumentierter Faktenbasis,
- Fristenüberwachung,
- Rollen- und Berechtigungsmodell,
- Betriebsratsprüfung,
- Datenschutz- und Vertraulichkeitslogik,
- digitalem Freigabeprozess,
- Audit-Trail,
- revisionsfähiger Dokumentation,
- optionaler juristischer Prüfung.

Arbeitsrechtliche Vorgänge dürfen durch KI vorbereitet, strukturiert und abgefragt werden. Die finale rechtliche Bewertung und Entscheidung muss jedoch durch eine berechtigte Person erfolgen.

---

## 2. Grundprinzip für Epics, Stories und Arbeitspakete

Arbeitsrechtliche Themen werden in der Plattform in drei Ebenen strukturiert:

```text
Epic
└── Story
    └── Arbeitspaket / Task
```

### 2.1 Epic

Ein Epic beschreibt einen größeren arbeitsrechtlichen Prozessbereich.

Beispiele:

- Arbeitsvertragsmanagement
- Befristungsmanagement
- Arbeitnehmerüberlassung
- Urlaubsmanagement
- Abmahnungsprozess
- Kündigungsprozess
- Betriebsratsbeteiligung
- Wettbewerbsverbot
- Tarif- und Betriebsvereinbarungsmanagement
- HR-Compliance-Dokumentation

### 2.2 Story

Eine Story beschreibt einen konkreten Anwendungsfall innerhalb eines arbeitsrechtlichen Bereichs.

Beispiele:

- Als HR-Mitarbeiter möchte ich einen befristeten Arbeitsvertrag rechtssicher vorbereiten, damit die Befristung vor Arbeitsbeginn dokumentiert und geprüft ist.
- Als Projektleiter möchte ich erkennen, ob bei einer personellen Maßnahme der Betriebsrat zu beteiligen ist, damit der Prozess nicht ohne erforderliche Beteiligung fortgesetzt wird.
- Als HR-Verantwortlicher möchte ich bei einer möglichen Pflichtverletzung einen Abmahnungsfall strukturiert erfassen, damit Beanstandungs-, Hinweis- und Warnfunktion nachvollziehbar dokumentiert sind.

### 2.3 Arbeitspaket / Task

Ein Arbeitspaket beschreibt eine konkrete, ausführbare Aktivität.

Beispiele:

- Sachverhalt erfassen
- Frist prüfen
- Vertragsart klassifizieren
- Betriebsratspflicht prüfen
- Dokument erzeugen
- Freigabe durch HR einholen
- Rechtsprüfung anfordern
- Versand dokumentieren
- Wiedervorlage setzen
- Audit-Log abschließen

---

## 3. Arbeitsrechtliche Leitplanken für die Plattform

### 3.1 Keine automatische Rechtsentscheidung

Die KI darf:

- Fragen stellen,
- Sachverhalte strukturieren,
- fehlende Angaben erkennen,
- Risiken markieren,
- Fristen berechnen,
- Entscheidungsvorlagen erstellen,
- Checklisten ausfüllen,
- Dokumententwürfe erzeugen,
- auf Pflichtprüfungen hinweisen.

Die KI darf nicht:

- eine Kündigung final aussprechen,
- eine Abmahnung final als wirksam bewerten,
- eine Befristung final rechtlich freigeben,
- Betriebsratsrechte abschließend ersetzen,
- eine juristische Einzelfallprüfung simulieren,
- automatisiert Sanktionen auslösen,
- ohne Freigabe personenbezogene oder arbeitsrechtliche Dokumente versenden.

### 3.2 Rechtliche Themen sind immer risikoklassifiziert

Jede arbeitsrechtliche Story erhält eine Risikoklasse:

| Risikoklasse | Bedeutung | Beispiele | Systemverhalten |
|---|---|---|---|
| Niedrig | rein organisatorisch | Stammdatenpflege, Wiedervorlage | einfache Freigabe ausreichend |
| Mittel | arbeitsvertraglich relevant | Vertragsänderung, Urlaubskorrektur | HR-Freigabe erforderlich |
| Hoch | rechtlich folgenschwer | Befristung, Abmahnung, AÜG, BR-Beteiligung | HR + optional Legal Review |
| Kritisch | Beendigung / Eskalation | Kündigung, außerordentliche Kündigung, Betriebsratskonflikt | Pflichtprüfung, Sperrlogik, 4-Augen-Prinzip |

---

## 4. Allgemeiner Prozess für arbeitsrechtliche Stories

```text
1. Vorgang starten
2. Thema klassifizieren
3. Rollen und Zuständigkeiten prüfen
4. Sachverhalt erfassen
5. Fristen und Formvorgaben prüfen
6. Betriebsratsbeteiligung prüfen
7. Datenschutz- und Zugriffsebene setzen
8. Dokumente / Entscheidungsvorlage erzeugen
9. Freigabe einholen
10. Maßnahme durchführen
11. Nachweis / Zugang / Empfang dokumentieren
12. Wiedervorlage und Folgepflichten setzen
13. Vorgang revisionssicher archivieren
```

---

## 5. Definition of Ready für arbeitsrechtliche Stories

Eine arbeitsrechtliche Story darf erst in die Umsetzung gehen, wenn folgende Punkte geklärt sind:

- [ ] Arbeitsrechtliches Thema ist eindeutig klassifiziert.
- [ ] Betroffene Person oder Personengruppe ist datenschutzkonform referenziert.
- [ ] Zuständige Rolle ist benannt: HR, Führungskraft, Projektleitung, Geschäftsführung, Legal, Betriebsrat.
- [ ] Rechtsgrundlage oder Regelwerk ist als Referenz hinterlegt.
- [ ] Fristenrelevanz ist geprüft.
- [ ] Betriebsratsrelevanz ist geprüft.
- [ ] Datenschutzklassifikation ist gesetzt.
- [ ] Erforderliche Dokumente sind bekannt.
- [ ] Freigabeprozess ist definiert.
- [ ] Akzeptanzkriterien sind messbar.
- [ ] Eskalationsweg ist definiert.

---

## 6. Definition of Done für arbeitsrechtliche Stories

Eine arbeitsrechtliche Story ist erst abgeschlossen, wenn:

- [ ] Sachverhalt vollständig dokumentiert ist.
- [ ] Pflichtfelder vollständig ausgefüllt sind.
- [ ] Fristen geprüft und dokumentiert sind.
- [ ] Betriebsratsprüfung durchgeführt wurde.
- [ ] erforderliche Freigaben vorliegen.
- [ ] Dokumente versioniert erzeugt wurden.
- [ ] Versand, Zugang oder Empfang dokumentiert ist, falls erforderlich.
- [ ] Audit-Log vollständig ist.
- [ ] personenbezogene Daten nur berechtigten Rollen zugänglich sind.
- [ ] Wiedervorlagen und Folgeaufgaben angelegt sind.
- [ ] Abschlussvermerk erstellt wurde.

---

# 7. Epic-Struktur für das Arbeitsrechtsmodul

## Epic 1: Arbeitsvertragsmanagement

### Ziel

Das System soll Arbeitsverträge, Vertragsänderungen und Nachweispflichten strukturiert vorbereiten, prüfen und dokumentieren.

### Fachlicher Hintergrund

Arbeitsverträge können grundsätzlich formfrei zustande kommen. Für bestimmte Vertragsarten und Nachweise gelten jedoch besondere Form- und Dokumentationspflichten. Die Unterlagen nennen als Mindestinhalte unter anderem Vertragsparteien, Beginn, Befristungsdauer, Arbeitsort, Tätigkeit, Entgelt, Arbeitszeit, Tarifbindung/Betriebsvereinbarung, Urlaub und Kündigungsfristen.

Seit 2025 sind beim Nachweis wesentlicher Arbeitsbedingungen in vielen Fällen Formerleichterungen möglich. Dennoch muss das System zwischen:

- Arbeitsvertrag,
- Nachweis wesentlicher Arbeitsbedingungen,
- befristetem Vertrag,
- Teilzeitvertrag,
- Wettbewerbsverbot,
- tariflichen Vorgaben,
- Betriebsvereinbarung,
- Sonderfällen

unterscheiden.

### Typische Stories

#### Story 1.1: Arbeitsvertrag digital vorbereiten

```markdown
Als HR-Mitarbeiter möchte ich einen Arbeitsvertrag anhand eines KI-Dialogs vorbereiten, damit alle wesentlichen Vertragsdaten strukturiert erfasst und geprüft werden.
```

##### Akzeptanzkriterien

- [ ] Vertragsparteien werden abgefragt.
- [ ] Beginn des Arbeitsverhältnisses wird abgefragt.
- [ ] Arbeitsort wird abgefragt.
- [ ] Tätigkeitsbeschreibung wird abgefragt.
- [ ] Arbeitszeitmodell wird abgefragt.
- [ ] Vergütung wird abgefragt.
- [ ] Urlaubsanspruch wird abgefragt.
- [ ] Kündigungsfristen werden abgefragt.
- [ ] Tarifvertrag oder Betriebsvereinbarung wird abgefragt.
- [ ] Sonderform wie Befristung, Teilzeit, Ausbildung oder Wettbewerbsverbot wird erkannt.
- [ ] System erzeugt keine finale Freigabe ohne HR-Review.

##### Arbeitspakete

| AP | Beschreibung | Rolle |
|---|---|---|
| AP 1 | Vertragsart klassifizieren | KI + HR |
| AP 2 | Pflichtangaben abfragen | KI |
| AP 3 | Sonderfälle prüfen | KI |
| AP 4 | Vertragsentwurf erzeugen | System |
| AP 5 | HR-Freigabe einholen | HR |
| AP 6 | optional Legal Review anfordern | Legal |
| AP 7 | Versand / Empfang dokumentieren | HR |

---

## Epic 2: Befristungsmanagement

### Ziel

Das System soll befristete Arbeitsverträge und Verlängerungen so strukturieren, dass Form-, Frist- und Sachgrundrisiken frühzeitig erkannt werden.

### Systemlogik

Befristungen sind compliance-kritisch. Das System muss mindestens prüfen:

- sachgrundlose Befristung,
- Sachgrundbefristung,
- Projektbefristung,
- Vertretungsbefristung,
- Erprobung,
- Fördermittelbezug,
- Vorbeschäftigung,
- maximale Dauer,
- Anzahl der Verlängerungen,
- Unterschrift / Form vor Arbeitsbeginn,
- Möglichkeit ordentlicher Kündigung im Vertrag,
- Betriebsratsbeteiligung bei Einstellung oder Weiterbeschäftigung.

### Typische Story

```markdown
Als HR-Verantwortlicher möchte ich eine Befristung vor Vertragsbeginn systemseitig prüfen, damit Formfehler und unwirksame Befristungen vermieden werden.
```

### Akzeptanzkriterien

- [ ] System fragt ab, ob die Befristung sachgrundlos oder mit Sachgrund erfolgen soll.
- [ ] System prüft maximale Dauer und Anzahl der Verlängerungen.
- [ ] System fragt frühere Beschäftigung im Unternehmen ab.
- [ ] System prüft, ob der Vertrag vor Arbeitsbeginn finalisiert und dokumentiert wurde.
- [ ] System blockiert den Status „Freigegeben“, wenn Pflichtangaben fehlen.
- [ ] System erzeugt eine Wiedervorlage vor Befristungsende.
- [ ] System erstellt eine Risikoampel für Entfristungsrisiken.

### Beispiel-Arbeitspakete

| AP | Tätigkeit | Ergebnis |
|---|---|---|
| AP 1 | Befristungsart bestimmen | sachgrundlos / Sachgrund |
| AP 2 | Sachgrund dokumentieren | Text + Nachweis |
| AP 3 | Fristen prüfen | Prüfprotokoll |
| AP 4 | Vorbeschäftigung prüfen | Ja/Nein/Unklar |
| AP 5 | Vertragsentwurf erzeugen | Dokument |
| AP 6 | Freigabe einholen | HR/Legal |
| AP 7 | Wiedervorlage setzen | Termin |

---

## Epic 3: Arbeitnehmerüberlassung

### Ziel

Das System soll den Einsatz externer Arbeitskräfte so strukturieren, dass Arbeitnehmerüberlassung, Dienstvertrag, Werkvertrag und Scheinselbstständigkeitsrisiken voneinander abgegrenzt werden.

### Fachliche Leitfragen

- Ist die externe Person in die Organisation eingegliedert?
- Besteht eine Weisungsgebundenheit?
- Liegt ein Erfolg geschuldetes Werk vor oder nur Arbeitsleistung?
- Wird fachlich oder disziplinarisch gesteuert?
- Gibt es einen Verleiher mit Erlaubnis?
- Liegt ein Vertrag zwischen Entleiher und Verleiher vor?
- Ist die Überlassung ausdrücklich als Arbeitnehmerüberlassung gekennzeichnet?
- Gibt es Fristen zur Höchstüberlassung?
- Sind Equal-Treatment-/Equal-Pay-Themen betroffen?
- Werden offene Stellen und soziale Einrichtungen berücksichtigt?

### Typische Story

```markdown
Als Projektleiter möchte ich vor dem Einsatz externer Personen prüfen lassen, ob ein Werkvertrag, Dienstvertrag oder Arbeitnehmerüberlassung vorliegt, damit keine verdeckte Arbeitnehmerüberlassung entsteht.
```

### Akzeptanzkriterien

- [ ] System fragt Vertragstyp ab.
- [ ] System fragt Weisungsrechte ab.
- [ ] System fragt Eingliederung in Organisation und Teams ab.
- [ ] System fragt geschuldetes Ergebnis oder geschuldete Leistung ab.
- [ ] System prüft Vorliegen der AÜG-Erlaubnis.
- [ ] System prüft Laufzeit und Einsatzdauer.
- [ ] System fragt Zugang zu internen Systemen, Einrichtungen und Arbeitsmitteln ab.
- [ ] System erzeugt Risikohinweis bei organisatorischer Eingliederung und Weisungsbindung.
- [ ] System fordert HR/Legal-Freigabe bei AÜG-Risiko.

### Beispiel-Arbeitspakete

| AP | Tätigkeit | Ergebnis |
|---|---|---|
| AP 1 | Einsatzbedarf beschreiben | Bedarfserfassung |
| AP 2 | Vertragstyp klassifizieren | Werk/Dienst/AÜG/unklar |
| AP 3 | Weisungs- und Eingliederungsprüfung durchführen | Risikoprofil |
| AP 4 | Verleiherlaubnis prüfen | Nachweis |
| AP 5 | Laufzeit / Höchstüberlassung prüfen | Fristenstatus |
| AP 6 | Freigabe durch HR/Legal | Entscheidung |
| AP 7 | Monitoring aktivieren | Dashboard |

---

## Epic 4: Urlaubsmanagement

### Ziel

Das System soll Urlaubsansprüche, Teilurlaubsansprüche, Wartezeiten, Übertragungen, Krankheit und Verfall so verwalten, dass gesetzliche Mindestanforderungen und Hinweisobliegenheiten abgebildet werden.

### Systemlogik

Das System muss unterscheiden zwischen:

- gesetzlichem Mindesturlaub,
- vertraglichem Mehrurlaub,
- tariflichem Urlaub,
- Teilzeitmodellen,
- Wartezeit,
- Teilurlaub,
- Urlaubsübertragung,
- Krankheit,
- Langzeiterkrankung,
- Hinweis- und Aufforderungsobliegenheit des Arbeitgebers,
- Urlaubsabgeltung.

### Typische Story

```markdown
Als HR-Mitarbeiter möchte ich Urlaubsansprüche systemseitig berechnen und überwachen, damit Urlaub korrekt gewährt, übertragen oder abgegolten wird.
```

### Akzeptanzkriterien

- [ ] System berechnet Mindesturlaub anhand der Wochenarbeitstage.
- [ ] System berücksichtigt Wartezeit und Teilurlaub.
- [ ] System unterscheidet gesetzlichen, tariflichen und vertraglichen Urlaub.
- [ ] System erkennt krankheitsbedingte Nichtinanspruchnahme.
- [ ] System dokumentiert Hinweise an Arbeitnehmer zur Urlaubsnahme.
- [ ] System setzt Wiedervorlagen für drohenden Verfall.
- [ ] System verhindert automatische Löschung ohne dokumentierte Prüfung.
- [ ] System erzeugt einen Nachweis über Hinweis- und Aufforderungsmitteilungen.

### Beispiel-Arbeitspakete

| AP | Tätigkeit | Ergebnis |
|---|---|---|
| AP 1 | Arbeitszeitmodell erfassen | Wochenarbeitstage |
| AP 2 | Urlaubsanspruch berechnen | Anspruchskonto |
| AP 3 | Wartezeit prüfen | Status |
| AP 4 | Teilurlaub berechnen | Monatsanteile |
| AP 5 | Hinweisobliegenheit auslösen | Nachricht / Nachweis |
| AP 6 | Krankheit / Übertragung prüfen | Übertragungsstatus |
| AP 7 | Abgeltung bei Austritt prüfen | Berechnungsgrundlage |

---

## Epic 5: Abmahnungsmanagement

### Ziel

Das System soll Abmahnungsvorgänge so erfassen, dass Beanstandungsfunktion, Hinweisfunktion und Warnfunktion dokumentiert werden.

### Systemlogik

Eine Abmahnungsstory ist immer ein risikobehafteter HR-Vorgang. Das System muss unterscheiden zwischen:

- Pflichtverletzung,
- arbeitsvertraglichem Fehlverhalten,
- einmaligem oder wiederholtem Verhalten,
- Schweregrad,
- Beweisbarkeit,
- vorherigen Abmahnungen,
- Verhältnismäßigkeit,
- Fristenbezug,
- möglicher Kündigungsrelevanz.

Wichtig: Die Plattform darf keine starre Regel „immer zwei Abmahnungen vor Kündigung“ fest einprogrammieren. In der Praxis ist eine Abmahnung bei verhaltensbedingten Kündigungen häufig relevant; bei besonders schweren Pflichtverletzungen kann sie entbehrlich sein. Deshalb muss das System mit Risikoampeln, Prüfhinweisen und Freigaben arbeiten.

### Typische Story

```markdown
Als HR-Verantwortlicher möchte ich eine mögliche Pflichtverletzung strukturiert erfassen, damit geprüft werden kann, ob eine Abmahnung erforderlich, geeignet und verhältnismäßig ist.
```

### Akzeptanzkriterien

- [ ] Fehlverhalten wird mit Datum, Uhrzeit, Ort und Beschreibung erfasst.
- [ ] Zeugen und Nachweise können dokumentiert werden.
- [ ] Vertragliche oder gesetzliche Pflicht wird referenziert.
- [ ] Beanstandungsfunktion wird im Entwurf abgebildet.
- [ ] Hinweisfunktion wird im Entwurf abgebildet.
- [ ] Warnfunktion wird im Entwurf abgebildet.
- [ ] System prüft, ob frühere gleichartige Pflichtverletzungen vorhanden sind.
- [ ] System erzeugt keinen Versand ohne HR-Freigabe.
- [ ] System unterstützt Anhörungs- oder Stellungnahmeprozess, falls vorgesehen.
- [ ] System archiviert Vorgang mit Zugriffsbeschränkung.

### Beispiel-Arbeitspakete

| AP | Tätigkeit | Ergebnis |
|---|---|---|
| AP 1 | Sachverhalt erfassen | Fallakte |
| AP 2 | Nachweise sammeln | Beweisdokumentation |
| AP 3 | Pflichtverletzung klassifizieren | Kategorie |
| AP 4 | Vorfälle historisch prüfen | Wiederholungsstatus |
| AP 5 | Abmahnungsentwurf erzeugen | Dokumententwurf |
| AP 6 | HR/Legal Review einholen | Freigabe |
| AP 7 | Zustellung dokumentieren | Zugangsnachweis |
| AP 8 | Wiedervorlage setzen | Kontrolltermin |

---

## Epic 6: Kündigungsmanagement

### Ziel

Das System soll Kündigungsprozesse nicht automatisieren, sondern als stark kontrollierten, fristen- und nachweispflichtigen Vorgang strukturieren.

### Systemlogik

Kündigungen sind als **kritische Vorgänge** einzustufen. Das System muss mindestens prüfen:

- Kündigungsart: ordentlich, außerordentlich, Änderungskündigung,
- Kündigungsgrund: personenbedingt, verhaltensbedingt, betriebsbedingt,
- Schriftform,
- Kündigungsfrist,
- Zugangsnachweis,
- Vollmacht / Zeichnungsberechtigung,
- Betriebsratsanhörung,
- Sonderkündigungsschutz,
- Frist bei außerordentlicher Kündigung,
- Sozialauswahl bei betriebsbedingter Kündigung,
- Dokumentation der Interessenabwägung,
- 4-Augen- oder Legal-Freigabe.

### Typische Story

```markdown
Als HR-Leitung möchte ich einen Kündigungsvorgang strukturiert prüfen und freigeben lassen, damit formale, fristbezogene und beteiligungsrechtliche Anforderungen vor Ausspruch geprüft sind.
```

### Akzeptanzkriterien

- [ ] System fragt Kündigungsart ab.
- [ ] System fragt Kündigungsgrund ab.
- [ ] System prüft, ob Betriebsrat vorhanden ist.
- [ ] System blockiert finalen Status ohne dokumentierte Betriebsratsanhörung, wenn Betriebsrat vorhanden ist.
- [ ] System prüft Fristen und Sonderkündigungsschutz.
- [ ] System fragt Zugangsnachweis ab.
- [ ] System verlangt HR- und Legal-Freigabe.
- [ ] System erzeugt einen Dokumentensatz, aber versendet nicht automatisch.
- [ ] System dokumentiert Entscheidung, Freigaben und Versandweg.

### Beispiel-Arbeitspakete

| AP | Tätigkeit | Ergebnis |
|---|---|---|
| AP 1 | Kündigungsart bestimmen | ordentlich / außerordentlich / Änderung |
| AP 2 | Kündigungsgrund prüfen | personen-/verhaltens-/betriebsbedingt |
| AP 3 | Fristen berechnen | Fristenprotokoll |
| AP 4 | Sonderkündigungsschutz prüfen | Risikohinweis |
| AP 5 | Betriebsratsanhörung vorbereiten | Anhörungspaket |
| AP 6 | Entscheidung dokumentieren | Entscheidungsvorlage |
| AP 7 | Dokument erstellen | Entwurf |
| AP 8 | Legal-Freigabe einholen | Freigabe |
| AP 9 | Zugang dokumentieren | Zustellnachweis |
| AP 10 | Nachlauf / Fristen überwachen | Wiedervorlage |

---

## Epic 7: Betriebsratsbeteiligung

### Ziel

Das System soll bei HR- und Organisationsmaßnahmen erkennen, ob Informations-, Beratungs-, Anhörungs-, Mitbestimmungs- oder Zustimmungsrechte des Betriebsrats betroffen sein können.

### Systemlogik

Jeder arbeitsrechtliche Vorgang erhält einen Betriebsratscheck:

| Prüffrage | Ergebnis |
|---|---|
| Gibt es einen Betriebsrat? | Ja / Nein / Unklar |
| Ist eine personelle Einzelmaßnahme betroffen? | Einstellung / Versetzung / Eingruppierung / Umgruppierung |
| Ist eine Kündigung betroffen? | Anhörungspflicht prüfen |
| Ist Arbeitszeit / Ordnung / technische Überwachung betroffen? | Mitbestimmung prüfen |
| Ist eine Betriebsvereinbarung betroffen? | BV-Check |
| Ist ein Tarifvertrag betroffen? | Tarif-Check |
| Muss eine Einigungsstelle vorgesehen werden? | Eskalationspfad |

### Typische Story

```markdown
Als Projektleiter möchte ich bei jeder HR-relevanten Story automatisch prüfen lassen, ob Betriebsratsrechte betroffen sind, damit der Vorgang nicht ohne erforderliche Beteiligung fortgeführt wird.
```

### Akzeptanzkriterien

- [ ] System stellt einen Betriebsrats-Trigger bei HR-relevanten Themen.
- [ ] System unterscheidet Informations-, Beratungs-, Anhörungs-, Mitbestimmungs- und Vetorechte.
- [ ] System dokumentiert, ob und wann der Betriebsrat informiert oder beteiligt wurde.
- [ ] System blockiert kritische Prozessschritte bei fehlender Anhörung oder Zustimmung.
- [ ] System erzeugt eine BR-Unterlage mit Sachverhalt, Maßnahme, Begründung, Unterlagen und Frist.
- [ ] System dokumentiert Rückmeldung, Zustimmung, Widerspruch oder Fristablauf.

### Beispiel-Arbeitspakete

| AP | Tätigkeit | Ergebnis |
|---|---|---|
| AP 1 | Betriebsrat vorhanden? | Ja/Nein |
| AP 2 | Beteiligungsart bestimmen | Info/Beratung/Anhörung/Mitbestimmung/Zustimmung |
| AP 3 | Unterlagenpaket vorbereiten | BR-Dossier |
| AP 4 | Frist setzen | Fristdatum |
| AP 5 | Rückmeldung dokumentieren | Entscheidung |
| AP 6 | Folgeprozess auslösen | Fortsetzung / Eskalation |

---

## Epic 8: Wettbewerbsverbot

### Ziel

Das System soll Wettbewerbsverbote während und nach dem Arbeitsverhältnis rechtlich sauber voneinander trennen und die Voraussetzungen für nachvertragliche Wettbewerbsverbote prüfen.

### Systemlogik

Das System muss unterscheiden zwischen:

- gesetzlichem Wettbewerbsverbot während des Arbeitsverhältnisses,
- vertraglich geregelter Nebentätigkeit,
- nachvertraglichem Wettbewerbsverbot,
- Karenzentschädigung,
- maximaler Dauer,
- örtlicher Begrenzung,
- Funktionsbeschreibung,
- Nachweis und Aushändigung,
- Erklärung zur Durchsetzung,
- monatlicher Zahlung.

### Typische Story

```markdown
Als HR-Verantwortlicher möchte ich ein nachvertragliches Wettbewerbsverbot prüfen, damit Dauer, Karenzentschädigung, Tätigkeitsbereich und regionale Begrenzung dokumentiert sind.
```

### Akzeptanzkriterien

- [ ] System fragt Dauer des Wettbewerbsverbots ab.
- [ ] System fragt räumlichen und sachlichen Geltungsbereich ab.
- [ ] System berechnet oder dokumentiert Karenzentschädigung.
- [ ] System prüft maximale Dauer.
- [ ] System dokumentiert Aushändigung und Annahme.
- [ ] System setzt Zahlungs- und Kontrolltermine.
- [ ] System fordert Legal Review.

---

# 8. Standard-KI-Dialog für arbeitsrechtliche Vorgänge

Die KI fragt arbeitsrechtliche Vorgänge immer in folgender Struktur ab:

## 8.1 Themenklassifikation

1. Um welchen Vorgang geht es?
   - Arbeitsvertrag
   - Befristung
   - Urlaub
   - Abmahnung
   - Kündigung
   - Arbeitnehmerüberlassung
   - Betriebsrat
   - Wettbewerbsverbot
   - Tarifvertrag / Betriebsvereinbarung
   - Sonstiges

2. Wer ist betroffen?
   - einzelne Person
   - mehrere Arbeitnehmer
   - Bewerber
   - externe Person
   - Leiharbeitnehmer
   - Organisationseinheit
   - gesamter Betrieb

3. Ist der Vorgang fristenrelevant?
   - Ja
   - Nein
   - Unklar

4. Gibt es einen Betriebsrat?
   - Ja
   - Nein
   - Unklar

5. Gibt es Sonderregelungen?
   - Tarifvertrag
   - Betriebsvereinbarung
   - Arbeitsvertragliche Sonderregelung
   - Schwerbehinderung
   - Elternzeit
   - Schwangerschaft
   - Auszubildende
   - Sonderkündigungsschutz

## 8.2 Sachverhaltserfassung

1. Was ist passiert oder was soll umgesetzt werden?
2. Wann ist der Sachverhalt eingetreten?
3. Wer hat Kenntnis davon erhalten?
4. Welche Dokumente, Nachweise oder Zeugen gibt es?
5. Welche bisherigen Maßnahmen gab es?
6. Welche Entscheidung wird benötigt?

## 8.3 Risikoprüfung

1. Könnte eine arbeitsrechtliche Sanktion betroffen sein?
2. Könnte ein Betriebsratsrecht betroffen sein?
3. Gibt es eine Frist, die ablaufen kann?
4. Sind personenbezogene Daten besonders schutzbedürftig?
5. Besteht ein Risiko für Unwirksamkeit, Entfristung, Annahmeverzug oder Schadensersatz?
6. Ist eine juristische Prüfung erforderlich?

---

# 9. Datenmodell

## 9.1 Entity: LegalWorkItem

| Feld | Typ | Beschreibung |
|---|---|---|
| id | UUID | eindeutige ID |
| type | Enum | Epic / Story / Arbeitspaket |
| legal_area | Enum | Vertrag, Befristung, Urlaub, Abmahnung, Kündigung, AÜG, BR, Wettbewerbsverbot |
| risk_level | Enum | niedrig / mittel / hoch / kritisch |
| title | Text | Kurzbezeichnung |
| summary | Text | Beschreibung |
| affected_person_ref | Pseudonymisierte ID | betroffene Person |
| owner_role | Enum | HR / Legal / Führungskraft / PL / GF |
| br_relevant | Boolean | Betriebsratsrelevanz |
| deadline_relevant | Boolean | Fristenrelevanz |
| data_protection_level | Enum | normal / vertraulich / streng vertraulich |
| status | Enum | Draft / In Prüfung / Freigabe / Umgesetzt / Archiviert |
| legal_review_required | Boolean | Legal Review erforderlich |
| audit_log_id | UUID | Audit-Verweis |

## 9.2 Entity: LegalDeadline

| Feld | Typ | Beschreibung |
|---|---|---|
| id | UUID | Fristen-ID |
| work_item_id | UUID | Bezug zum Vorgang |
| deadline_type | Enum | Kündigungsfrist, Anhörungsfrist, Befristungsende, Urlaubsverfall, AÜG-Laufzeit |
| start_date | Date | Fristbeginn |
| end_date | Date | Fristende |
| calculated_by_system | Boolean | Systemberechnung |
| manually_confirmed_by | User | Freigeber |
| reminder_date | Date | Wiedervorlage |
| status | Enum | offen / bestätigt / erledigt / kritisch |

## 9.3 Entity: Approval

| Feld | Typ | Beschreibung |
|---|---|---|
| id | UUID | Freigabe-ID |
| work_item_id | UUID | Bezug |
| approver_role | Enum | HR / Legal / GF / Betriebsrat / Projektleitung |
| approver_user | User | konkrete Person |
| approval_type | Enum | fachlich / rechtlich / formal / BR |
| decision | Enum | offen / freigegeben / abgelehnt / Rückfrage |
| comment | Text | Begründung |
| timestamp | DateTime | Zeitpunkt |

---

# 10. Dashboard-Auswertungen

## 10.1 Compliance-Dashboard

| Kennzahl | Beschreibung |
|---|---|
| Offene arbeitsrechtliche Vorgänge | Anzahl offener HR-/Legal-Stories |
| Kritische Fristen | Fristen innerhalb der nächsten 14 Tage |
| BR-pflichtige Vorgänge | Vorgänge mit Betriebsratsprüfung |
| Legal Review offen | Vorgänge mit ausstehender juristischer Freigabe |
| Befristungen laufen aus | Befristungen innerhalb definierter Frist |
| AÜG-Einsätze kritisch | Einsätze nahe Höchstüberlassungsdauer oder ohne vollständigen Nachweis |
| Urlaubsverfall unklar | Urlaubskonten ohne dokumentierten Hinweis |
| Kündigungsvorgänge in Prüfung | Kritische Fälle im Status Legal/HR Review |
| Abmahnungen mit Wiedervorlage | Fälle mit Kontrolltermin |

## 10.2 Risikoampel

| Farbe | Bedeutung | Beispiel |
|---|---|---|
| Grün | Pflichtdaten vollständig, keine Fristkritik | Urlaubsanspruch berechnet |
| Gelb | offene Angaben oder Review erforderlich | Befristungsgrund fehlt |
| Rot | Fristkritik oder formaler Sperrgrund | BR-Anhörung fehlt bei Kündigung |
| Schwarz | Vorgang darf nicht fortgesetzt werden | fehlende AÜG-Erlaubnis / fehlende Legal-Freigabe bei Kündigung |

---

# 11. Beispiel: Epic mit Stories und Arbeitspaketen

## Epic: Rechtssicheres Befristungsmanagement einführen

### Ziel

Die Plattform soll befristete Arbeitsverhältnisse so verwalten, dass Vertragsart, Fristen, Sachgründe, Verlängerungen, BR-Beteiligung und Wiedervorlagen systematisch geprüft werden.

### Story 1: Befristeten Vertrag vorbereiten

```markdown
Als HR-Mitarbeiter möchte ich eine Befristung dialoggeführt erfassen, damit die Plattform fehlende Angaben, Fristen und Formrisiken erkennt.
```

#### Akzeptanzkriterien

- [ ] Befristungsart ist ausgewählt.
- [ ] Start- und Enddatum sind erfasst.
- [ ] Sachgrund ist dokumentiert oder sachgrundlose Befristung ist bestätigt.
- [ ] Vorbeschäftigung ist geprüft.
- [ ] Verlängerungsanzahl ist geprüft.
- [ ] Betriebsratsrelevanz ist geprüft.
- [ ] Legal Review wurde bei Risiko Gelb/Rot angefordert.

#### Arbeitspakete

| AP | Beschreibung | Ergebnis |
|---|---|---|
| 1 | Befristungsdialog erstellen | KI-Fragenkatalog |
| 2 | Fristenlogik implementieren | Fristenrechner |
| 3 | Vorbeschäftigungsprüfung anbinden | Prüfstatus |
| 4 | BR-Check integrieren | Beteiligungsstatus |
| 5 | Wiedervorlage erzeugen | Reminder |
| 6 | Audit-Log schreiben | Nachweis |

---

# 12. Beispiel: Kündigungsvorgang als kontrollierter Workflow

## Epic: Kündigungsmanagement mit rechtlicher Sperrlogik

### Story: Kündigungsvorgang prüfen

```markdown
Als HR-Leitung möchte ich vor Ausspruch einer Kündigung alle rechtlich relevanten Prüfpunkte durchlaufen, damit keine Kündigung ohne Fristen-, Form-, BR- und Legal-Prüfung vorbereitet wird.
```

### Workflow

```text
1. Kündigungsart erfassen
2. Kündigungsgrund erfassen
3. Sonderkündigungsschutz prüfen
4. Vorherige Maßnahmen prüfen
5. Fristen berechnen
6. Betriebsrat anhören
7. Legal Review einholen
8. Geschäftsführung / bevollmächtigte Person freigeben lassen
9. Dokument erzeugen
10. Zugang dokumentieren
11. Klagefrist / Nachlauf überwachen
```

### Sperrlogik

Der Vorgang darf nicht in den Status „Versandbereit“ wechseln, wenn:

- Kündigungsgrund fehlt,
- Kündigungsart fehlt,
- Betriebsrat vorhanden, aber Anhörung nicht dokumentiert,
- Legal Review bei kritischem Vorgang fehlt,
- Zugangsnachweis nicht geplant ist,
- Sonderkündigungsschutz ungeprüft ist,
- Frist nicht berechnet oder bestätigt ist,
- zeichnungsberechtigte Person fehlt.

---

# 13. Systemanforderungen

## Funktionale Anforderungen

- [ ] Arbeitsrechtliche Vorgänge können als Epics, Stories und Arbeitspakete erstellt werden.
- [ ] Jeder Vorgang erhält eine rechtliche Klassifikation.
- [ ] Jeder Vorgang erhält eine Risikoklasse.
- [ ] KI-Dialoge fragen abhängig vom Thema unterschiedliche Pflichtfelder ab.
- [ ] Fristen werden berechnet und als Wiedervorlagen geführt.
- [ ] Betriebsratsrelevanz wird automatisch abgefragt.
- [ ] HR-/Legal-Freigaben werden rollenbasiert abgebildet.
- [ ] Kritische Vorgänge verfügen über Sperrlogik.
- [ ] Dokumente werden versioniert erzeugt.
- [ ] Versand, Zugang und Empfang können dokumentiert werden.
- [ ] Audit-Logs sind unveränderbar nachvollziehbar.
- [ ] Dashboard zeigt offene Risiken, Fristen und Freigaben.

## Nicht-funktionale Anforderungen

- [ ] Rollen- und Berechtigungskonzept ist zwingend.
- [ ] Personenbezogene Daten werden nur minimal angezeigt.
- [ ] Zugriff auf Kündigungs-, Abmahnungs- und Personalakten ist streng beschränkt.
- [ ] System muss revisionsfähige Historie speichern.
- [ ] System muss Datenschutz und Löschkonzepte unterstützen.
- [ ] KI-Ausgaben müssen als Entwurf gekennzeichnet sein.
- [ ] Finale Entscheidungen müssen menschlich freigegeben werden.

---

# 14. Quellen und rechtliche Referenzen

## Gesetzliche Grundlagen

- Nachweisgesetz, insbesondere § 2 NachwG: https://www.gesetze-im-internet.de/nachwg/__2.html
- Teilzeit- und Befristungsgesetz, insbesondere § 14 TzBfG: https://www.gesetze-im-internet.de/tzbfg/__14.html
- Bürgerliches Gesetzbuch, insbesondere § 622 BGB und § 626 BGB: https://www.gesetze-im-internet.de/bgb/__622.html und https://www.gesetze-im-internet.de/bgb/__626.html
- Kündigungsschutzgesetz, insbesondere § 1, § 2 und § 4 KSchG: https://www.gesetze-im-internet.de/kschg/
- Betriebsverfassungsgesetz, insbesondere § 80, § 87, § 99 und § 102 BetrVG: https://www.gesetze-im-internet.de/betrvg/
- Arbeitnehmerüberlassungsgesetz, insbesondere § 1 und § 8 AÜG: https://www.gesetze-im-internet.de/a_g/
- Bundesurlaubsgesetz, insbesondere § 4, § 5 und § 7 BUrlG: https://www.gesetze-im-internet.de/burlg/
- Handelsgesetzbuch, insbesondere § 74 HGB zum nachvertraglichen Wettbewerbsverbot: https://www.gesetze-im-internet.de/hgb/__74.html

## Rechtsprechungsbezug / Umsetzungsprinzipien

- BAG 2 AZR 596/20: schwere Pflichtverletzungen können im Einzelfall eine Kündigung ohne vorherige Abmahnung rechtfertigen.
- BAG 2 AZR 66/23: bei besonders schweren Pflichtverletzungen kann eine Abmahnung entbehrlich sein; zugleich bleiben Einzelfallprüfung und Interessenabwägung relevant.
- BAG 9 AZR 198/24 und BAG-Rechtsprechung zum Urlaubsverfall: Urlaub und Urlaubsübertragung müssen mit Hinweis- und Mitwirkungsobliegenheiten sowie Übertragungsfristen systemisch sauber dokumentiert werden.
- BAG 7 AZR 717/14: Schriftform und erkennbare Befristungsabrede sind bei befristeten Arbeitsverhältnissen zentral.

---

# 15. Kernaussage für die Softwareentwicklung

Arbeitsrechtliche Epics, Stories und Arbeitspakete dürfen in der Plattform nicht als einfache Aufgabenlisten umgesetzt werden. Sie müssen als **rechtlich kontrollierte Workflows** mit:

- Pflichtfragen,
- Fristen,
- Rollen,
- Betriebsratscheck,
- Dokumentenlogik,
- Freigaben,
- Risikoampeln,
- Audit-Trail,
- menschlicher Endentscheidung

modelliert werden.

Die KI unterstützt die Strukturierung und Qualitätssicherung. Die Entscheidung bleibt beim Menschen.
