# Feature: Mitglieder-, Stakeholder- und Berechtigungsverwaltung

## 1. Ziel des Features

Dieses Feature beschreibt die Verwaltung von **Mitgliedern, Projektbeteiligten und Stakeholdern** innerhalb der Projektmanagement-Plattform. Es erweitert die reine Benutzerverwaltung um ein strukturiertes Rollen-, Gruppen-, Rechte- und Stakeholdermodell.

Ziel ist, dass die Plattform für jedes Projekt eindeutig steuern kann:

- wer Zugriff auf welche Projekte, Arbeitspakete, Stories, Termine, Budgets, Kontakte, Dokumente und Auswertungen erhält,
- welche Personen nur lesen, welche bearbeiten und welche löschen dürfen,
- welche Rechte aus Gruppen, Rollen oder Projektzuordnungen geerbt werden,
- welche Rechte projektübergreifend, projektbezogen oder nur für eigene Inhalte gelten,
- welche Stakeholder aktiv im Projekt mitarbeiten und welche nur informiert oder beteiligt werden,
- welche Berechtigungen sensibel sind und über Freigabeprozesse vergeben werden müssen.

Das Feature bildet damit die Grundlage für ein sauberes Berechtigungskonzept, Auditierbarkeit, Datenschutz, Projektsteuerung und rollenbasierte Zusammenarbeit.

---

## 2. Ausgangsbasis aus den Screenshots

Die Screenshots zeigen eine bestehende Benutzerverwaltung mit folgenden Elementen:

- Benutzer bearbeiten
- Personendaten wie Anrede, Titel, Vorname, Nachname
- Kennzeichnung als Administrator
- Zuordnung als Mitarbeiter oder Gruppe
- Vorgesetzter
- Abrechnungsstundensatz
- interner Stundensatz
- Planungsanteil für Allgemeintätigkeiten
- Land/Bundesland für Feiertagskalender
- Anzahl Urlaubstage pro Jahr
- automatische Pausenregelung und Begrenzung der Arbeitszeit
- API-Zugriff
- mobile Ansicht
- Rechtevergabe je Modul
- Rechtearten: Sehen, Bearbeiten, Löschen
- Rechteausprägungen: Alle, Eigene, Keine
- zusätzliche Rechte wie Excel-Export, Einstellungen, Vorlagen, Dashboard, Geldbeträge, Auswertungen, Arbeitszeitbearbeitung
- Sichtbarkeit von Menüpunkten
- eigene Tabellen mit CRUD-Rechten
- Hinweis auf automatische Rechtevererbung aus Gruppen

Diese Logik soll für die neue Projektmanagement-Plattform fachlich erweitert und systematisch als Feature umgesetzt werden.

---

## 3. Grundprinzip des Berechtigungskonzepts

Die Plattform soll ein kombiniertes Modell aus **rollenbasierter Zugriffskontrolle** und **kontextbezogener Zugriffskontrolle** verwenden.

### 3.1 Rollenbasierte Rechte

Rechte werden über Rollen und Gruppen vergeben, zum Beispiel:

- Administrator
- Projektleiter
- Teilprojektleiter
- Product Owner
- Scrum Master
- Projektcontroller
- Teammitglied
- Externer Dienstleister
- Kunde / Auftraggeber
- Lenkungsausschuss
- Stakeholder nur lesend
- Fachlicher Tester
- Management / Steering Committee

### 3.2 Kontextbezogene Rechte

Zusätzlich muss geprüft werden, in welchem Kontext eine Person handelt:

- gehört die Person zum Projekt?
- ist sie Verantwortlicher eines Arbeitspakets?
- ist sie Teilprojektleiter?
- ist sie Vorgesetzter einer anderen Person?
- ist sie interner oder externer Stakeholder?
- ist sie Auftraggeber oder Lieferant?
- ist sie nur Empfänger von Berichten?
- ist sie Mitglied eines Entscheidungsgremiums?

### 3.3 Rechtevererbung

Rechte können aus Gruppen geerbt werden. Die Plattform soll jederzeit anzeigen können, ob ein Recht:

- direkt am Benutzer vergeben wurde,
- aus einer Gruppe geerbt wurde,
- projektbezogen vergeben wurde,
- durch eine höhere Rolle überschrieben wurde,
- zeitlich befristet vergeben wurde,
- durch eine Freigabe aktiviert wurde.

---

## 4. Rechtearten

Die Plattform soll mindestens folgende Rechtearten unterstützen.

| Recht | Bedeutung |
|---|---|
| Sehen | Benutzer darf Datensätze anzeigen |
| Anlegen | Benutzer darf neue Datensätze erstellen |
| Bearbeiten | Benutzer darf bestehende Datensätze ändern |
| Löschen | Benutzer darf Datensätze löschen oder zur Löschung markieren |
| Exportieren | Benutzer darf Daten exportieren |
| Freigeben | Benutzer darf Freigaben erteilen |
| Kommentieren | Benutzer darf Kommentare und Rückmeldungen erfassen |
| Zuweisen | Benutzer darf Aufgaben, Arbeitspakete oder Rollen zuweisen |
| Budget sehen | Benutzer darf finanzielle Werte sehen |
| Budget bearbeiten | Benutzer darf Budgetdaten ändern |
| Status ändern | Benutzer darf Statuswerte verändern |
| Abnahme durchführen | Benutzer darf formale Abnahmen bestätigen |
| Administration | Benutzer darf Systemeinstellungen verwalten |

---

## 5. Rechteausprägungen

Analog zur gezeigten Oberfläche soll jede Rechteart abgestuft werden können.

| Ausprägung | Bedeutung |
|---|---|
| Keine | Kein Zugriff |
| Eigene | Zugriff nur auf eigene oder zugewiesene Inhalte |
| Eigene* | Zugriff auf eigene Inhalte plus fachlich zugeordnete Inhalte, z. B. Untergebene, Teilprojekt oder vertretene Person |
| Projekt | Zugriff auf Inhalte eines konkret zugeordneten Projekts |
| Teilprojekt | Zugriff auf Inhalte eines Teilprojekts |
| Alle | Zugriff auf alle Inhalte innerhalb des Mandanten oder erlaubten Bereichs |

### Regel für „Eigene*“

„Eigene*“ muss systemseitig eindeutig definiert werden. Es kann bedeuten:

- selbst erstellt,
- selbst verantwortlich,
- explizit zugewiesen,
- Mitglied im zugeordneten Team,
- Vorgesetzter der verantwortlichen Person,
- Vertretung der verantwortlichen Person,
- Teilprojektleiter des zugehörigen Teilprojekts,
- Projektleiter des übergeordneten Projekts.

Die konkrete Bedeutung muss pro Modul konfigurierbar und dokumentiert sein.

---

## 6. Modulbasierte Berechtigungsmatrix

Die Plattform soll eine Matrix je Modul bereitstellen.

| Modul | Sehen | Anlegen | Bearbeiten | Löschen | Besonderheiten |
|---|---|---|---|---|---|
| Projekte | Keine / Eigene / Alle | Ja / Nein | Keine / Eigene / Alle | Keine / Eigene / Alle | Projektleiter erhalten erweiterte Rechte |
| Arbeitspakete | Keine / Eigene / Alle | Ja / Nein | Keine / Eigene / Alle | Keine / Eigene / Alle | AP-Verantwortliche dürfen Status pflegen |
| Stories / Epics | Keine / Eigene / Alle | Ja / Nein | Keine / Eigene / Alle | Keine / Eigene / Alle | Product Owner kann priorisieren |
| Aufgaben | Keine / Eigene* / Alle | Ja / Nein | Keine / Eigene* / Alle | Keine / Eigene* / Alle | Eigene* berücksichtigt Zuweisung und Vertretung |
| Termine | Keine / Eigene* / Alle | Ja / Nein | Keine / Eigene* / Alle | Keine / Eigene* / Alle | Kalenderintegration und Ressourcenbuchung |
| Budgets | Keine / Eigene* / Alle | Ja / Nein | Keine / Eigene* / Alle | Keine / Eigene* / Alle | Sensibles Recht, Freigabe erforderlich |
| Kontakte | Keine / Eigene / Alle | Ja / Nein | Keine / Eigene / Alle | Keine / Eigene / Alle | Datenschutz und Zweckbindung beachten |
| Zeiterfassung | Keine / Eigene* / Alle | Ja / Nein | Keine / Eigene* / Alle | Keine / Eigene* / Alle | Bearbeitung fremder Zeiten nur mit Sonderrecht |
| Rechnungen | Keine / Eigene* / Alle | Ja / Nein | Keine / Eigene* / Alle | Keine / Eigene* / Alle | Finanzrecht, Rollenprüfung, Auditpflicht |
| Risiken | Keine / Eigene / Alle | Ja / Nein | Keine / Eigene / Alle | Keine / Eigene / Alle | Risikoverantwortliche pflegen Maßnahmen |
| Entscheidungen | Keine / Eigene / Alle | Ja / Nein | Keine / Eigene / Alle | Keine / Eigene / Alle | Gremienrechte und Beschlusslogik |
| Dokumente | Keine / Eigene / Alle | Ja / Nein | Keine / Eigene / Alle | Keine / Eigene / Alle | Versionierung und Freigabeprozess |
| Berichte | Keine / Eigene / Alle | Ja / Nein | Keine / Eigene / Alle | Keine / Eigene / Alle | Berichtsempfänger nur lesend möglich |
| Dashboards | Keine / Eigene / Alle | Ja / Nein | Keine / Eigene / Alle | Keine / Eigene / Alle | Managementsicht und Projektsicht trennen |

---

## 7. Stakeholder-Typen

Jeder Benutzer kann zusätzlich als Stakeholder klassifiziert werden.

| Stakeholder-Typ | Beschreibung | Typische Rechte |
|---|---|---|
| Internes Teammitglied | Arbeitet aktiv im Projekt mit | Aufgaben, APs, Zeiten, Dokumente |
| Projektleiter | Verantwortlich für Planung, Steuerung und Abschluss | Vollzugriff auf Projektkontext |
| Teilprojektleiter | Verantwortlich für abgegrenzten Projektbereich | Zugriff auf Teilprojekt |
| Auftraggeber | Gibt Ziele, Budget und Abnahmen frei | Leserechte, Freigabe, Entscheidungen |
| Management | Benötigt verdichtete Steuerungsinformationen | Dashboard, Status, Risiken, Budget |
| Lenkungsausschuss | Trifft übergreifende Entscheidungen | Status, Risiken, Entscheidungen, Freigaben |
| Externer Dienstleister | Erbringt definierte Leistungen | Eingeschränkter Zugriff auf zugewiesene APs |
| Lieferant | Liefert Produkt, Dienstleistung oder Ressourcen | Eingeschränkte Kommunikation und Dokumente |
| Kunde | Empfänger oder Nutzer des Projektergebnisses | Leserechte, Feedback, Abnahmen |
| Fachbereich | Liefert Anforderungen und testet Ergebnisse | Anforderungen, Tests, Feedback |
| Betriebsrat / Compliance | Beteiligung bei relevanten organisatorischen Themen | Leserechte auf definierte Vorgänge, Beteiligungsstatus |
| Controller | Überwacht Kosten, Budget, Ist-Werte und Forecast | Budget, Kosten, EVA, Reports |
| Qualitätsverantwortlicher | Prüft Qualität, Tests, Abnahmen | Qualität, Prüfprotokolle, Abnahmen |

---

## 8. Benutzerprofil

Ein Benutzerprofil soll folgende Felder enthalten.

### 8.1 Stammdaten

| Feld | Beschreibung |
|---|---|
| Benutzer-ID | Eindeutiger technischer Schlüssel |
| Anrede | Herr / Frau / divers / keine Angabe |
| Titel | Optional |
| Vorname | Pflichtfeld |
| Nachname | Pflichtfeld |
| E-Mail | Pflichtfeld, eindeutig |
| Telefon | Optional |
| Organisation | Interne oder externe Organisation |
| Abteilung | Fachbereich / Organisationseinheit |
| Standort | Ort / Land / Bundesland |
| Sprache | Sprache für UI und Benachrichtigungen |
| Status | Aktiv, eingeladen, gesperrt, ausgeschieden |

### 8.2 Projekt- und Rolleninformationen

| Feld | Beschreibung |
|---|---|
| Benutzergruppe | Zugeordnete Gruppe(n) |
| Systemrolle | Globale Rolle, z. B. Admin |
| Projektrolle | Rolle im konkreten Projekt |
| Vorgesetzter | Person für Linien- oder Eskalationsbezug |
| Vertretung | Ersatzperson für Abwesenheiten |
| Stakeholder-Typ | Interne/externe Stakeholderklassifikation |
| Beteiligungsgrad | Hoch / Mittel / Niedrig |
| Einfluss | Hoch / Mittel / Niedrig |
| Interesse | Hoch / Mittel / Niedrig |
| Kommunikationsbedarf | Niedrig / Normal / Hoch / Kritisch |

### 8.3 Abrechnung und Kapazität

| Feld | Beschreibung |
|---|---|
| Interner Stundensatz | Für interne Kostenrechnung |
| Externer / abrechenbarer Stundensatz | Für Projektkalkulation oder Rechnung |
| Arbeitszeitmodell | Vollzeit, Teilzeit, extern, frei konfigurierbar |
| Kapazität pro Woche | Stunden oder Prozent |
| Planungspuffer | Anteil für Allgemeintätigkeiten |
| Urlaubstage pro Jahr | Für Kapazitätsplanung |
| Feiertagskalender | Land/Bundesland für Termin- und Ressourcenplanung |
| Pausenregelung | Automatischer Abzug gesetzlicher Pausen, wenn relevant |
| Tageslimit | Maximal erfassbare Zeit je Tag |

### 8.4 Technische Einstellungen

| Feld | Beschreibung |
|---|---|
| API-Zugriff erlaubt | Ja / Nein |
| Mobile Ansicht erlaubt | Ja / Nein |
| Zwei-Faktor-Authentifizierung | Aktiv / Inaktiv |
| Letzter Login | Auditinformation |
| SSO-ID | Externe Identität, z. B. Microsoft Entra ID |
| Externe Benutzerkennung | Für Kunden, Lieferanten oder Partner |

---

## 9. Gruppen- und Rollenmodell

Die Plattform soll Rechte bevorzugt über Gruppen vergeben, damit nicht jeder Benutzer einzeln gepflegt werden muss.

### 9.1 Standardgruppen

| Gruppe | Zweck |
|---|---|
| Systemadministratoren | Vollzugriff auf technische Administration |
| Projektadministratoren | Projektanlage, Rollen, Einstellungen |
| Projektleiter | Planung, Steuerung, Freigaben im Projekt |
| Teilprojektleiter | Steuerung einzelner Teilbereiche |
| Teammitglieder | Bearbeitung eigener Aufgaben und Arbeitspakete |
| Externe Projektmitglieder | Eingeschränkte Bearbeitung zugewiesener Inhalte |
| Management | Lesender Zugriff auf verdichtete Statusinformationen |
| Controlling | Kosten, Budget, Forecast, EVA |
| Qualitätsmanagement | Qualitätsprüfungen, Abnahmen, Prüflisten |
| Stakeholder lesend | Zugriff auf Reports und freigegebene Dokumente |
| Kunde / Auftraggeber | Abnahme, Feedback, Projektstatus |
| Compliance / Datenschutz | Audit-, Datenschutz- und Prüfzugriff |

### 9.2 Gruppenvererbung

Gruppenrechte sollen hierarchisch vererbbar sein, zum Beispiel:

```text
Projektleiter
├── darf Projekt sehen
├── darf Arbeitspakete sehen und bearbeiten
├── darf Statusberichte erstellen
├── darf Risiken bearbeiten
├── darf Projektteam verwalten
└── darf Freigaben anfordern
```

Direkte Benutzerrechte sollen nur für Ausnahmen genutzt werden.

---

## 10. Effektive Rechte anzeigen

Die Plattform soll eine Funktion **„Effektive Rechte anzeigen“** bereitstellen.

Diese Ansicht zeigt:

- welches Recht final gilt,
- aus welcher Gruppe es stammt,
- ob es direkt vergeben wurde,
- ob es projektbezogen eingeschränkt ist,
- ob es zeitlich befristet ist,
- ob es durch eine Sonderfreigabe aktiviert wurde,
- ob es durch eine höhere Schutzregel blockiert wird.

Beispiel:

| Modul | Recht | Effektiv | Quelle | Hinweis |
|---|---|---|---|---|
| Budget | Sehen | Ja | Gruppe Controlling | Sensible Finanzdaten |
| Budget | Bearbeiten | Nein | Projektrolle Teammitglied | Bearbeitung nicht erlaubt |
| Projekte | Sehen | Ja | Gruppe Projektteam | Nur zugewiesene Projekte |
| Zeiterfassung | Bearbeiten alle | Nein | Datenschutzregel | Sonderrecht erforderlich |

---

## 11. Sensible Rechte mit Freigabeprozess

Bestimmte Rechte dürfen nicht ohne Freigabe vergeben werden.

### 11.1 Sensible Rechte

- Administratorrechte
- Budget sehen
- Budget bearbeiten
- Geldbeträge sehen
- Rechnungen sehen oder bearbeiten
- Arbeitszeit aller bearbeiten
- personenbezogene Daten exportieren
- Excel-Export großer Datenmengen
- API-Zugriff
- Löschen von Projekten, Budgets, Rechnungen oder Dokumenten
- Änderung von Rollen und Gruppen
- Zugriff auf vertrauliche Stakeholderdaten

### 11.2 Freigabeprozess

```text
Recht wird beantragt
→ Begründung wird erfasst
→ fachlicher Verantwortlicher wird benachrichtigt
→ Datenschutz / Compliance wird bei sensiblen Rechten eingebunden
→ Freigabe oder Ablehnung
→ Recht wird aktiviert oder verworfen
→ Audit-Log wird geschrieben
```

### 11.3 Mindestinformationen für eine Rechtefreigabe

| Feld | Beschreibung |
|---|---|
| Antragsteller | Wer beantragt das Recht? |
| Betroffener Benutzer | Für wen wird das Recht beantragt? |
| Recht | Welches Recht wird beantragt? |
| Modul | Für welchen Bereich? |
| Projektkontext | Für welches Projekt? |
| Begründung | Warum wird das Recht benötigt? |
| Laufzeit | Unbefristet oder befristet |
| Genehmiger | Wer darf freigeben? |
| Entscheidung | Genehmigt / abgelehnt |
| Kommentar | Begründung zur Entscheidung |
| Audit-ID | Nachverfolgbarkeit |

---

## 12. Zeitlich befristete Rechte

Die Plattform soll temporäre Rechte unterstützen.

Beispiele:

- Vertretung während Urlaub
- externer Dienstleister für ein bestimmtes Arbeitspaket
- temporärer Audit-Zugriff
- Hypercare-Zugriff nach Go-Live
- Projektabschlussprüfung

Regel:

- jedes temporäre Recht benötigt ein Start- und Enddatum,
- der Benutzer wird vor Ablauf informiert,
- der Verantwortliche wird vor Ablauf informiert,
- nach Ablauf wird das Recht automatisch entzogen,
- das Entfernen wird im Audit-Log gespeichert.

---

## 13. Projektbezogene Rechte

Rechte sollen nicht nur global, sondern auch je Projekt vergeben werden können.

| Ebene | Beispiel |
|---|---|
| Systemweit | Benutzer darf Projekte anlegen |
| Mandantenweit | Benutzer sieht alle Projekte seiner Organisation |
| Projektbezogen | Benutzer sieht Projekt A, aber nicht Projekt B |
| Teilprojektbezogen | Benutzer sieht nur Teilprojekt Migration |
| Arbeitspaketbezogen | Benutzer bearbeitet nur zugewiesenes Arbeitspaket |
| Dokumentbezogen | Benutzer sieht nur freigegebene Dokumente |

---

## 14. Stakeholdermanagement-Funktionen

Die Benutzerverwaltung soll mit dem Stakeholdermanagement verbunden werden.

### 14.1 Stakeholdermatrix

| Stakeholder | Rolle | Einfluss | Interesse | Einstellung | Kommunikationsbedarf | Strategie |
|---|---|---|---|---|---|---|
| Auftraggeber | Sponsor | Hoch | Hoch | Unterstützend | Hoch | Eng einbinden |
| Fachbereich | Nutzergruppe | Mittel | Hoch | Neutral | Mittel | Regelmäßig informieren |
| Externer Anbieter | Lieferant | Mittel | Mittel | Unterstützend | Mittel | Über Arbeitspakete steuern |
| Management | Entscheider | Hoch | Mittel | Neutral | Hoch | Status und Entscheidungsbedarf liefern |
| Kritischer Stakeholder | Betroffen | Hoch | Hoch | Widerständig | Hoch | Individuell betreuen |

### 14.2 Kommunikationsprofil je Stakeholder

| Feld | Beschreibung |
|---|---|
| bevorzugter Kanal | E-Mail, Plattform, Teams, Meeting, Dashboard |
| Frequenz | täglich, wöchentlich, monatlich, anlassbezogen |
| Informationsbedarf | operativ, taktisch, strategisch |
| Eskalationsweg | Vorgesetzter, Projektleiter, Lenkungsausschuss |
| Sprache | Kommunikationssprache |
| Sensibilität | normal, vertraulich, kritisch |

---

## 15. KI-gestützter Dialog zur Benutzer- und Rechteanlage

Die KI soll bei der Anlage eines Mitglieds oder Stakeholders dialoggeführt unterstützen.

### 15.1 Beispiel-Dialog

```text
KI: Soll ein neuer Benutzer, eine Gruppe oder ein externer Stakeholder angelegt werden?

User: Neuer externer Stakeholder.

KI: In welchem Projekt soll der Stakeholder beteiligt sein?

User: SharePoint-Migration.

KI: Welche Rolle hat die Person im Projekt?

User: Externer Berater für Migration.

KI: Soll die Person nur zugewiesene Arbeitspakete sehen oder das gesamte Projekt?

User: Nur zugewiesene Arbeitspakete.

KI: Soll die Person Budgets, Rechnungen oder Geldbeträge sehen?

User: Nein.

KI: Soll API-Zugriff erlaubt sein?

User: Nein.

KI: Soll der Zugriff zeitlich befristet sein?

User: Ja, bis Projektende.

KI: Ich schlage folgende Rechte vor:
- Projekte: Sehen = Eigene
- Arbeitspakete: Sehen/Bearbeiten = Eigene
- Aufgaben: Sehen/Bearbeiten = Eigene
- Dokumente: Sehen = Eigene/freigegeben
- Budget/Rechnungen/Geldbeträge = Keine
- Löschen = Keine
- Export = Keine

Soll ich daraus einen Rechteantrag erstellen?
```

---

## 16. Validierungsregeln

### 16.1 Allgemeine Regeln

- Ein Benutzer benötigt mindestens eine Rolle oder Gruppe.
- Direkte Einzelrechte sollen begründet werden.
- Administratorrechte dürfen nicht automatisch vergeben werden.
- Externe Benutzer dürfen standardmäßig keine Budget- oder Rechnungsdaten sehen.
- Löschrechte müssen restriktiv vergeben werden.
- Exportrechte müssen separat vergeben werden.
- API-Zugriff muss separat genehmigt werden.
- Rechte auf personenbezogene Daten müssen zweckgebunden sein.
- Rechteänderungen müssen protokolliert werden.

### 16.2 Konfliktregeln

| Konflikt | Regel |
|---|---|
| Gruppe erlaubt, Direktrecht verbietet | restriktivere Regel gewinnt, außer Admin überschreibt bewusst |
| Benutzer ist extern und hat Budgetrecht | Freigabe erforderlich |
| Benutzer hat Löschen ohne Bearbeiten | unplausibel, Warnung anzeigen |
| Benutzer hat API-Zugriff ohne Projektrolle | nicht erlauben oder gesondert begründen |
| Benutzer hat Arbeitszeit aller bearbeiten | Sonderrecht mit Auditpflicht |
| Benutzer hat Admin und Projektrolle | Rollen sauber trennen und anzeigen |

---

## 17. Audit-Log

Jede Änderung an Benutzern, Gruppen und Rechten muss protokolliert werden.

| Feld | Beschreibung |
|---|---|
| Zeitpunkt | Wann wurde geändert? |
| Ausführender Benutzer | Wer hat geändert? |
| Betroffener Benutzer | Bei wem wurde geändert? |
| Änderungstyp | Rolle, Gruppe, Recht, Status, Profil |
| Alter Wert | Vorheriger Zustand |
| Neuer Wert | Neuer Zustand |
| Begründung | Warum wurde geändert? |
| Freigabe-ID | Falls Freigabe erforderlich |
| IP / Session | Technische Nachvollziehbarkeit |

---

## 18. Offboarding und Zugriffsentzug

Beim Ausscheiden oder Projektende muss ein Benutzer sauber deaktiviert werden.

### Offboarding-Schritte

- offene Aufgaben prüfen,
- Verantwortlichkeiten übertragen,
- Vertretung aktivieren,
- offene Freigaben prüfen,
- API-Zugriff entziehen,
- temporäre Rechte beenden,
- externe Zugänge sperren,
- Audit-Export erzeugen,
- Benutzerstatus auf inaktiv setzen.

Der Benutzer darf nicht gelöscht werden, wenn historische Projektinformationen, Audit-Logs, Zeiterfassungen oder Freigaben erhalten bleiben müssen.

---

## 19. Dashboard-Auswertungen

Die Plattform soll folgende Auswertungen bereitstellen.

| Dashboard-Kachel | Aussage |
|---|---|
| Aktive Benutzer | Anzahl aktiver Mitglieder je Projekt |
| Externe Benutzer | Anzahl externer Stakeholder mit Zugriff |
| Kritische Rechte | Benutzer mit Admin-, Budget-, Export- oder API-Rechten |
| Temporäre Rechte | Rechte mit Ablaufdatum |
| Rechte ohne Gruppe | Benutzer mit direkten Einzelrechten |
| Offene Rechteanträge | Noch nicht genehmigte Anträge |
| Rechteänderungen letzte 30 Tage | Governance-Überblick |
| Benutzer ohne Login | Eingeladene oder inaktive Nutzer |
| Stakeholder mit hohem Einfluss | Steuerungsrelevante Stakeholder |
| Kritische Stakeholder | Widerstand, Konfliktpotenzial oder Eskalationsbedarf |
| Offboarding offen | Benutzer mit ausstehendem Zugriffsentzug |

---

## 20. Beispiel: Berechtigungsmatrix für Projektmanagement-Plattform

| Rolle | Projekte | Arbeitspakete | Aufgaben | Termine | Budget | Kontakte | Zeiterfassung | Rechnungen | Dashboard |
|---|---|---|---|---|---|---|---|---|---|
| Administrator | Alle | Alle | Alle | Alle | Alle | Alle | Alle | Alle | Alle |
| Projektleiter | Eigene Projekte alle Rechte | Alle im Projekt | Alle im Projekt | Alle im Projekt | Sehen/Bearbeiten nach Freigabe | Projektkontakte | Alle im Projekt sehen | Keine oder freigegeben | Projekt-Dashboard |
| Teilprojektleiter | Teilprojekt | Teilprojekt | Teilprojekt | Teilprojekt | Nur sehen, falls erlaubt | Teilprojektkontakte | Eigene/Team | Keine | Teilprojekt-Dashboard |
| Teammitglied | Eigene Projekte sehen | Eigene bearbeiten | Eigene bearbeiten | Eigene sehen | Keine | Eigene Kontakte | Eigene erfassen | Keine | Eigene Übersicht |
| Externer Dienstleister | Zugewiesene Projekte | Zugewiesene AP | Zugewiesene Aufgaben | Eigene Termine | Keine | Eingeschränkt | Eigene erfassen | Keine | Eingeschränkt |
| Auftraggeber | Projekt sehen | Status sehen | Keine Bearbeitung | Meilensteine sehen | Budget sehen optional | Ansprechpartner | Keine | Keine | Managementsicht |
| Management | Portfolio sehen | Status sehen | Keine | Meilensteine | Budget sehen | Keine | Keine | Keine | Portfolio-Dashboard |
| Controlling | Projekte sehen | AP-Kosten sehen | Keine | Keine | Alle freigegebenen Budgets | Keine | Auswertung | Rechnungen sehen | Kosten-Dashboard |

---

## 21. User Story

```markdown
# User Story: Mitglieder und Stakeholder mit rollenbasierten Berechtigungen verwalten

## Status
Proposed

## User Story
Als Administrator oder Projektleiter möchte ich Mitglieder, Gruppen und Stakeholder mit differenzierten Rechten verwalten, damit jeder Projektbeteiligte nur die Informationen und Funktionen erhält, die für seine Rolle und seinen Projektkontext erforderlich sind.

## Akzeptanzkriterien
- [ ] Benutzer können mit Stammdaten, Rolle, Gruppe, Vorgesetztem, Stundensatz, Kapazität und Standort angelegt werden.
- [ ] Benutzer können einer oder mehreren Gruppen zugeordnet werden.
- [ ] Rechte können je Modul für Sehen, Anlegen, Bearbeiten, Löschen und Exportieren vergeben werden.
- [ ] Rechte können mit Keine, Eigene, Eigene*, Projekt, Teilprojekt oder Alle abgestuft werden.
- [ ] Geerbte Gruppenrechte werden sichtbar ausgewiesen.
- [ ] Effektive Rechte können je Benutzer angezeigt werden.
- [ ] Sensible Rechte lösen einen Freigabeprozess aus.
- [ ] Temporäre Rechte können mit Ablaufdatum vergeben werden.
- [ ] Externe Benutzer erhalten standardmäßig restriktive Rechte.
- [ ] Jede Rechteänderung wird im Audit-Log gespeichert.
- [ ] Benutzer können als Stakeholder klassifiziert werden.
- [ ] Stakeholder können nach Einfluss, Interesse, Einstellung und Kommunikationsbedarf bewertet werden.
- [ ] Offboarding kann angestoßen werden und entzieht relevante Rechte kontrolliert.

## Nicht-Akzeptanzkriterien
- [ ] Rechte dürfen nicht ausschließlich und unübersichtlich auf Einzelbenutzerebene gepflegt werden.
- [ ] Budget-, Rechnungs-, Export- oder API-Rechte dürfen nicht ohne gesonderte Prüfung vergeben werden.
- [ ] Benutzer dürfen nicht physisch gelöscht werden, wenn historische Projekt- oder Auditdaten bestehen.
- [ ] Externe Benutzer dürfen nicht automatisch Zugriff auf alle Projekte erhalten.
- [ ] Geerbte Rechte dürfen nicht unsichtbar bleiben.

## Definition of Ready
- [ ] Rollenmodell ist definiert.
- [ ] Standardgruppen sind definiert.
- [ ] Rechtearten und Rechteausprägungen sind festgelegt.
- [ ] Sensible Rechte sind markiert.
- [ ] Freigabeprozess ist beschrieben.
- [ ] Datenschutz- und Audit-Anforderungen sind geklärt.

## Definition of Done
- [ ] Benutzerverwaltung ist umgesetzt.
- [ ] Gruppen- und Rollenrechte funktionieren.
- [ ] Rechtevererbung wird korrekt berechnet.
- [ ] Effektive Rechte werden angezeigt.
- [ ] Freigabeprozess für sensible Rechte funktioniert.
- [ ] Audit-Log ist vollständig.
- [ ] Offboarding-Prozess ist verfügbar.
- [ ] Dashboard-Auswertungen sind verfügbar.
- [ ] Tests für Rechtekombinationen sind erstellt.
```

---

## 22. Systemanforderungen

### Funktionale Anforderungen

- Benutzer anlegen, bearbeiten, deaktivieren
- Gruppen anlegen und verwalten
- Rollen je Projekt vergeben
- Rechte je Modul konfigurieren
- Rechte aus Gruppen erben
- effektive Rechte berechnen
- temporäre Rechte verwalten
- sensible Rechte freigeben lassen
- Audit-Log führen
- Stakeholderprofil pflegen
- Stakeholdermatrix auswerten
- Kommunikationsprofil pflegen
- Offboarding durchführen
- Rechte-Dashboard anzeigen

### Nicht-funktionale Anforderungen

- Rechteprüfung muss serverseitig erfolgen.
- UI-Rechte dürfen nicht alleinige Schutzmaßnahme sein.
- Änderungen müssen nachvollziehbar protokolliert werden.
- Das System muss mandantenfähig sein.
- Rechteberechnung muss performant sein.
- Exportfunktionen müssen geschützt sein.
- API-Zugriffe müssen tokenbasiert und widerrufbar sein.
- Personenbezogene Daten müssen zweckgebunden verarbeitet werden.

---

## 23. Empfehlung für die Umsetzung

Die Plattform sollte die Mitglieder- und Stakeholderverwaltung nicht als einfache Benutzerliste bauen, sondern als zentrales Governance-Modul.

Empfohlene Reihenfolge:

1. Benutzerprofil und Gruppenmodell umsetzen
2. Modulrechte mit Sehen / Anlegen / Bearbeiten / Löschen / Exportieren umsetzen
3. Projektbezogene Rollen ergänzen
4. Effektive Rechte anzeigen
5. Audit-Log ergänzen
6. Freigabeprozess für sensible Rechte umsetzen
7. Stakeholderklassifikation integrieren
8. Dashboard-Auswertungen ergänzen
9. Offboarding-Prozess ergänzen
10. KI-Dialog für Rechtevorschläge integrieren

