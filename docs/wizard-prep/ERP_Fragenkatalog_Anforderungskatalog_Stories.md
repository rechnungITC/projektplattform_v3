# ERP-Projekt – Fragenkatalog für erfolgreichen Projektstart, Anforderungsanalyse und Story-Ableitung

## Zweck des Dokuments

Dieses Dokument dient als strukturierter Fragenkatalog für den Start, die Analyse und die Steuerung eines ERP-Projekts.

Der Fragenkatalog ist so aufgebaut, dass die Antworten direkt in folgende Projektartefakte überführt werden können:

- Anforderungskatalog
- Arbeitspakete
- Epics
- Features
- User Stories
- Risiken
- offene Punkte
- Entscheidungsbedarfe
- Testfälle
- Schulungsbedarf
- Cutover- und Go-Live-Planung

Der Katalog ist branchenübergreifend nutzbar und besonders geeignet für ERP-Projekte in Maschinenbau, Anlagenbau, Industrie, Handel, Logistik und projektorientierten Unternehmen.

Er kann für SAP, Microsoft Dynamics, Oracle, proALPHA, Infor, Abas, Sage, TaxMetall, Eigenentwicklungen oder andere ERP-Systeme verwendet werden.

---

# 1. Zielbild und strategischer Projektkontext

## 1.1 Projektziel

### Fragen

1. Was ist der Hauptgrund für das ERP-Projekt?

   - Neueinführung
   - Ablösung Altsystem
   - Migration
   - Prozessharmonisierung
   - Unternehmenswachstum
   - Digitalisierung manueller Prozesse
   - Internationalisierung
   - Compliance-/Audit-Anforderungen
   - Kosten-/Effizienzsteigerung
   - Konsolidierung mehrerer ERP-Systeme

2. Welches konkrete Geschäftsziel soll mit dem ERP-Projekt erreicht werden?

3. Welche Probleme bestehen heute, die durch das ERP-Projekt gelöst werden sollen?

4. Welche Ziele sind ausdrücklich **nicht** Teil des Projekts?

5. Woran erkennt die Geschäftsführung nach 6, 12 und 24 Monaten, dass das ERP-Projekt erfolgreich war?

6. Gibt es einen harten Go-Live-Termin?

   - Geschäftsjahreswechsel
   - Wartungsende Altsystem
   - Konzernvorgabe
   - Standorteröffnung
   - Systemabschaltung
   - regulatorische Vorgabe
   - sonstiger Grund

7. Welche Risiken entstehen, wenn das Projekt nicht oder zu spät umgesetzt wird?

## Mögliche Ableitungen

### Mögliche Epics

- ERP-Zielbild und Projektauftrag definieren
- Business Case und Nutzenbewertung erstellen
- Projektumfang und Nicht-Ziele festlegen

### Mögliche Arbeitspakete

- Projektvision formulieren
- Business Case erstellen
- Zielbild mit Geschäftsführung abstimmen
- Erfolgskriterien definieren
- Go-Live-Rahmenbedingungen klären

### Beispiel-User-Story

Als Geschäftsführung möchte ich messbare Projektziele definieren, damit Erfolg, Prioritäten und Projektentscheidungen transparent bewertet werden können.

---

# 2. Unternehmensstruktur und Organisationsmodell

## 2.1 Unternehmen und Standorte

### Fragen

8. Wie viele Gesellschaften, Werke, Standorte oder Niederlassungen sind betroffen?

9. Gibt es mehrere Mandanten, Buchungskreise, Werke, Lagerorte oder rechtliche Einheiten?

10. Gibt es internationale Standorte mit unterschiedlichen Währungen, Sprachen, Steuersystemen oder gesetzlichen Anforderungen?

11. Welche Organisationsstruktur soll im ERP abgebildet werden?

   - Holding
   - einzelne GmbH
   - mehrere Gesellschaften
   - Werke
   - Profit Center
   - Cost Center
   - Business Units
   - Projektorganisation
   - Matrixorganisation

12. Gibt es geplante organisatorische Veränderungen, die im ERP berücksichtigt werden müssen?

13. Welche Abteilungen sind betroffen?

   - Vertrieb
   - Einkauf
   - Arbeitsvorbereitung
   - Konstruktion
   - Produktion
   - Montage
   - Service
   - Lager
   - Logistik
   - Qualitätssicherung
   - Finanzbuchhaltung
   - Controlling
   - HR
   - IT
   - Geschäftsführung
   - Projektmanagement
   - Nachhaltigkeit / ESG

## Mögliche Ableitungen

### Mögliche Epics

- Organisationsstruktur im ERP abbilden
- Mandanten-, Werke- und Lagerstruktur definieren
- Standort- und Gesellschaftsmodell erstellen

### Mögliche Arbeitspakete

- Organisationsmodell aufnehmen
- Mandantenstruktur dokumentieren
- Werke, Lagerorte und Kostenstellen erfassen
- rechtliche Einheiten und Verantwortlichkeiten klären

### Risiken

- Eine falsche Organisationsstruktur führt zu späteren Umbauten im ERP.
- Unklare Mandantenlogik kann Reporting, Berechtigungen und Buchhaltung beeinträchtigen.
- Nicht berücksichtigte internationale Anforderungen können Go-Live-Risiken erzeugen.

---

# 3. Stakeholder, Governance und Entscheidungsstruktur

## 3.1 Rollen und Verantwortung

### Fragen

14. Wer ist interner Auftraggeber des Projekts?

15. Wer hat Budgetverantwortung?

16. Wer ist fachlicher Projektleiter?

17. Wer ist technischer Projektleiter?

18. Wer entscheidet über Prozessänderungen?

19. Wer entscheidet über Customizing, Erweiterungen und Sonderentwicklungen?

20. Gibt es einen Lenkungsausschuss?

21. Wer sind die Key User je Fachbereich?

22. Gibt es Fachbereiche ohne klaren Ansprechpartner?

23. Gibt es externe Beteiligte?

   - ERP-Implementierungspartner
   - Steuerberater
   - Wirtschaftsprüfer
   - IT-Dienstleister
   - EDI-Partner
   - MES-Anbieter
   - CAD/PDM-Anbieter
   - Banken
   - Logistikdienstleister
   - Kunden
   - Lieferanten

24. Ist ein Betriebsrat einzubinden?

25. Gibt es bekannte Widerstände gegen das Projekt?

26. Welche Stakeholder müssen regelmäßig informiert werden?

27. Welche Entscheidungen dürfen nicht im Projektteam getroffen werden?

## Mögliche Ableitungen

### Mögliche Epics

- Projektgovernance und Entscheidungsstruktur aufsetzen
- Stakeholder-Management etablieren
- Key-User-Organisation aufbauen

### Mögliche Arbeitspakete

- RACI-Matrix erstellen
- Lenkungsausschuss definieren
- Eskalationswege festlegen
- Stakeholderanalyse durchführen
- Kommunikationsplan erstellen
- Betriebsratseinbindung planen

### Beispiel-User-Story

Als Projektleiter möchte ich klare Entscheidungswege dokumentieren, damit offene Punkte nicht zu Projektverzögerungen führen.

---

# 4. Aktuelle Systemlandschaft

## 4.1 Bestehende IT- und ERP-Systeme

### Fragen

28. Welche Systeme werden aktuell eingesetzt?

29. Welches System ist heute führend für welche Daten?

30. Gibt es bereits ein ERP-System?

   - SAP
   - Microsoft Dynamics
   - Oracle
   - proALPHA
   - Infor
   - Abas
   - Sage
   - TaxMetall
   - Eigenentwicklung
   - Excel-/Access-Lösung
   - Sonstiges

31. Welche Versionen, Module oder Erweiterungen sind im Einsatz?

32. Welche Systeme sollen abgelöst werden?

33. Welche Systeme sollen bestehen bleiben?

34. Welche Systeme müssen integriert werden?

   - CRM
   - MES
   - CAD
   - PDM/PLM
   - DMS/ECM
   - BDE/MDE
   - Zeiterfassung
   - HR
   - Lohnbuchhaltung
   - E-Commerce
   - EDI
   - BI/Reporting
   - Banking
   - Qualitätsmanagement
   - Service-Management
   - Ticketsystem
   - Nachhaltigkeits-/ESG-Systeme

35. Gibt es Schatten-IT in Excel, Access, SharePoint, lokalen Datenbanken oder individuellen Tools?

36. Welche Schnittstellen sind geschäftskritisch?

37. Welche Schnittstellen laufen heute manuell?

38. Welche Medienbrüche bestehen heute?

## Mögliche Ableitungen

### Mögliche Epics

- Systemlandschaft analysieren
- Applikationslandkarte erstellen
- Schnittstellenmatrix aufbauen
- führende Systeme je Datenobjekt definieren

### Mögliche Arbeitspakete

- bestehende Systeme erfassen
- Systemverantwortliche benennen
- Datenflüsse dokumentieren
- Schatten-IT identifizieren
- Integrationsrisiken bewerten

### Beispiel-User-Story

Als IT-Leitung möchte ich alle führenden Systeme und Datenflüsse dokumentieren, damit Integrationsrisiken früh erkannt werden.

---

# 5. Prozessaufnahme End-to-End

# 5.1 Vertrieb und Order-to-Cash

## Fragen

39. Wie entsteht heute ein Lead oder eine Anfrage?

40. Wie wird ein Angebot erstellt?

41. Gibt es Variantenangebote, Projektangebote oder Standardartikelangebote?

42. Wie werden Preise kalkuliert?

43. Gibt es Preislisten, Rabatte, Sonderkonditionen oder kundenspezifische Preise?

44. Wie wird aus einem Angebot ein Auftrag?

45. Gibt es technische Klärungen vor Auftragserfassung?

46. Gibt es Anzahlungen, Teilrechnungen, Abschlagsrechnungen oder Meilensteinabrechnung?

47. Wie erfolgt die Lieferung?

48. Wie erfolgt die Rechnungsstellung?

49. Wie werden Reklamationen, Gutschriften und Nachträge behandelt?

50. Welche Daten müssen vom Vertrieb an Konstruktion, Einkauf, Produktion oder Projektmanagement übergeben werden?

## Mögliche Ableitungen

### Mögliche Epics

- Angebotsprozess abbilden
- Auftragserfassung standardisieren
- Preis- und Rabattlogik definieren
- Auftragsabwicklung digitalisieren
- Faktura- und Gutschriftenprozess abbilden

### Mögliche Arbeitspakete

- Angebotsprozess aufnehmen
- Preisfindung dokumentieren
- Rabattlogik definieren
- Übergabe Vertrieb zu Auftragsabwicklung klären
- Reklamations- und Gutschriftenprozess aufnehmen

---

# 5.2 Einkauf und Procure-to-Pay

## Fragen

51. Wie entstehen Bedarfe?

   - manuell
   - aus MRP
   - aus Projektbedarf
   - aus Mindestbestand
   - aus Kundenauftrag
   - aus Produktionsauftrag
   - aus Serviceauftrag

52. Wie werden Lieferanten ausgewählt?

53. Gibt es Rahmenverträge?

54. Gibt es Freigabeprozesse für Bestellungen?

55. Gibt es Lieferantenbewertungen?

56. Wie werden Wareneingänge gebucht?

57. Gibt es Qualitätsprüfung im Wareneingang?

58. Wie werden Eingangsrechnungen geprüft?

59. Gibt es Drei-Wege-Abgleich zwischen Bestellung, Wareneingang und Rechnung?

60. Gibt es Fremdfertigung oder verlängerte Werkbank?

61. Gibt es Konsignationslager oder Lieferantenlager?

62. Welche Einkaufsdaten müssen historisch übernommen werden?

## Mögliche Ableitungen

### Mögliche Epics

- Bedarfsanforderung und Bestellung abbilden
- Lieferantenmanagement einführen
- Wareneingang und Rechnungsprüfung integrieren
- Fremdfertigung abbilden

### Mögliche Arbeitspakete

- Einkaufsprozess aufnehmen
- Bestellfreigaben definieren
- Lieferantenbewertung konzipieren
- Wareneingangsprüfung abbilden
- Rechnungsprüfungsprozess definieren

---

# 5.3 Lager, Materialwirtschaft und Bestandsführung

## Fragen

63. Welche Lagerarten gibt es?

   - Rohmaterial
   - Halbfabrikate
   - Fertigwaren
   - Ersatzteile
   - Konsignation
   - Projektlager
   - Baustellenlager
   - Serienlager
   - Sperrlager
   - QS-Lager

64. Wie werden Lagerorte strukturiert?

65. Gibt es Chargen-, Seriennummern- oder Variantenverwaltung?

66. Gibt es Mindestbestände oder Meldebestände?

67. Wie laufen Inventuren ab?

68. Gibt es mobile Scanner, MDE oder Barcodes?

69. Wie werden Umlagerungen durchgeführt?

70. Wie wird Material für Produktion oder Projekte reserviert?

71. Gibt es negative Bestände?

72. Welche Bestandsdaten müssen zum Go-Live übernommen werden?

73. Wie wird mit Altbeständen, nicht bewerteten Beständen oder unklaren Lagerbewegungen umgegangen?

## Mögliche Ableitungen

### Mögliche Epics

- Lagerstruktur modellieren
- Bestandsführung und Inventur abbilden
- Seriennummern-/Chargenlogik einführen
- Mobile Lagerprozesse prüfen

### Mögliche Arbeitspakete

- Lagerorte und Lagerarten erfassen
- Bestandslogik definieren
- Inventurprozess aufnehmen
- Barcode-/Scannerbedarf prüfen
- Reservierungslogik für Produktion und Projekte klären

---

# 5.4 Produktion, Fertigung und Maschinenbau

## Fragen

74. Welche Fertigungsart liegt vor?

   - Einzelfertigung
   - Kleinserie
   - Serienfertigung
   - Variantenfertigung
   - Projektfertigung
   - Make-to-Order
   - Engineer-to-Order
   - Make-to-Stock
   - Montagefertigung
   - Lohnfertigung

75. Gibt es Stücklisten?

   - einfache Stücklisten
   - mehrstufige Stücklisten
   - Variantenstücklisten
   - Projektstücklisten
   - Konstruktionsstücklisten
   - Fertigungsstücklisten
   - Service-Stücklisten

76. Wo entstehen Stücklisten heute?

   - ERP
   - CAD
   - PDM/PLM
   - Excel
   - manuell
   - externes System

77. Gibt es Arbeitspläne?

78. Gibt es Ressourcen, Maschinen, Arbeitsplätze oder Kapazitätsgruppen?

79. Gibt es Rüstzeiten, Laufzeiten, Maschinenzeiten oder Personalzeiten?

80. Wie wird Produktionsplanung heute durchgeführt?

81. Gibt es Feinplanung oder nur Grobplanung?

82. Gibt es Rückmeldungen aus der Produktion?

   - Mengen
   - Zeiten
   - Ausschuss
   - Nacharbeit
   - Maschinenstatus
   - Materialverbrauch

83. Gibt es Betriebsdatenerfassung oder Maschinendatenerfassung?

84. Wie werden Produktionsabweichungen dokumentiert?

85. Gibt es Nachkalkulation?

86. Gibt es Qualitätsprüfungen während der Fertigung?

87. Gibt es technische Änderungen nach Produktionsstart?

88. Wie wird mit Änderungsständen, Revisionen und Freigaben gearbeitet?

89. Welche Fertigungsprozesse dürfen zum Go-Live nicht unterbrochen werden?

## Mögliche Ableitungen

### Mögliche Epics

- Stücklisten- und Arbeitsplanstruktur aufbauen
- Produktionsplanung einführen
- Fertigungsaufträge abbilden
- Rückmeldungen aus der Fertigung integrieren
- Variantenfertigung abbilden
- CAD/PDM-ERP-Integration vorbereiten

### Mögliche Arbeitspakete

- Fertigungsarten klassifizieren
- Stücklistenmodell definieren
- Arbeitspläne aufnehmen
- Ressourcen- und Kapazitätsmodell erstellen
- Produktionsrückmeldung definieren
- Änderungsmanagement prüfen

---

# 5.5 Projektgeschäft und Anlagenbau

## Fragen

90. Werden Kundenaufträge als Projekte abgewickelt?

91. Gibt es Projektstrukturpläne?

92. Gibt es Meilensteine?

93. Gibt es projektbezogene Beschaffung?

94. Gibt es projektbezogene Lagerbestände?

95. Gibt es Projektbudgetierung?

96. Gibt es mitlaufende Kalkulation?

97. Gibt es Nachtragsmanagement?

98. Gibt es Projektcontrolling mit Plan/Ist/Vorschau?

99. Gibt es Ressourcenplanung für Projektteams?

100. Gibt es Service- oder Gewährleistungsübergaben nach Projektabschluss?

## Mögliche Ableitungen

### Mögliche Epics

- Projektstruktur im ERP abbilden
- Projektcontrolling einführen
- Nachtragsmanagement abbilden
- projektbezogene Beschaffung und Lagerführung definieren

### Mögliche Arbeitspakete

- Projektstrukturmodell aufnehmen
- Meilensteinlogik definieren
- Projektbudgetierung klären
- Nachtragsprozess beschreiben
- Projektcontrolling-Anforderungen aufnehmen

---

# 5.6 Service, After Sales und Ersatzteile

## Fragen

101. Gibt es Serviceprozesse?

102. Werden Maschinen, Anlagen oder Produkte beim Kunden als installierte Basis geführt?

103. Gibt es Seriennummern oder Equipment-Historien?

104. Wie werden Servicefälle erfasst?

105. Gibt es Wartungsverträge?

106. Gibt es Garantie- und Gewährleistungsprozesse?

107. Gibt es mobile Servicetechniker?

108. Gibt es Ersatzteilverkauf?

109. Gibt es Service-Stücklisten?

110. Gibt es Rücksendungen, Reparaturen oder Austauschgeräte?

111. Wie wird Service abgerechnet?

## Mögliche Ableitungen

### Mögliche Epics

- installierte Basis abbilden
- Serviceaufträge einführen
- Wartungsverträge und Ersatzteilprozesse definieren
- mobile Serviceprozesse prüfen

### Mögliche Arbeitspakete

- Serviceprozess aufnehmen
- Equipment-/Seriennummernlogik definieren
- Garantie- und Gewährleistungsprozess klären
- Ersatzteilprozess beschreiben
- mobile Serviceanforderungen prüfen

---

# 6. Stammdaten und Datenqualität

## 6.1 Stammdatenobjekte

### Fragen

112. Welche Stammdaten sind projektkritisch?

   - Kunden
   - Lieferanten
   - Artikel
   - Materialien
   - Stücklisten
   - Arbeitspläne
   - Preise
   - Konditionen
   - Konten
   - Kostenstellen
   - Projekte
   - Anlagen
   - Maschinen
   - Mitarbeiter
   - Rollen
   - Lagerorte
   - Seriennummern
   - Chargen

113. Wer ist heute verantwortlich für Stammdatenpflege?

114. Gibt es Dubletten?

115. Gibt es unvollständige Stammdaten?

116. Gibt es unterschiedliche Artikelnummernlogiken?

117. Gibt es Klassifizierungen oder Merkmale?

118. Gibt es Variantenkonfiguration?

119. Welche Pflichtfelder werden künftig benötigt?

120. Welche Datenqualität ist für Go-Live zwingend erforderlich?

121. Welche Daten können nach Go-Live bereinigt werden?

122. Wer entscheidet, welche Altdaten übernommen werden?

123. Gibt es ein Ziel-Datenmodell?

124. Gibt es Regeln für Nummernkreise?

125. Gibt es Regeln für Namenskonventionen?

## Mögliche Ableitungen

### Mögliche Epics

- Stammdaten-Governance definieren
- Artikelstamm bereinigen
- Kunden- und Lieferantenstamm migrieren
- Stücklisten- und Arbeitsplandaten vorbereiten
- Datenqualitätsregeln festlegen

### Mögliche Arbeitspakete

- Stammdatenobjekte identifizieren
- Datenverantwortliche benennen
- Dublettenanalyse durchführen
- Pflichtfelder definieren
- Nummernkreise und Namenskonventionen festlegen
- Datenbereinigung planen

---

# 7. Migration und Altdatenübernahme

## Fragen

126. Welche Daten müssen zwingend übernommen werden?

127. Welche Daten sollen nur archiviert werden?

128. Welche historischen Daten werden benötigt?

   - 1 Jahr
   - 3 Jahre
   - 5 Jahre
   - 10 Jahre
   - vollständig
   - nur lesend im Altsystem

129. Müssen offene Aufträge übernommen werden?

130. Müssen offene Bestellungen übernommen werden?

131. Müssen offene Posten übernommen werden?

132. Müssen Lagerbestände übernommen werden?

133. Müssen laufende Produktionsaufträge übernommen werden?

134. Müssen laufende Projekte übernommen werden?

135. Müssen Seriennummern- und Chargenhistorien übernommen werden?

136. Wie wird Migration getestet?

137. Gibt es eine Probemigration?

138. Wer validiert migrierte Daten?

139. Gibt es eine Cutover-Strategie?

140. Gibt es einen Migrations-Freeze?

141. Wie wird nach Go-Live mit dem Altsystem umgegangen?

## Mögliche Ableitungen

### Mögliche Epics

- Migrationsstrategie erstellen
- Datenmapping durchführen
- Probemigration durchführen
- Cutover-Plan erstellen
- Altsystem-Archivierung definieren

### Mögliche Arbeitspakete

- Datenobjekte für Migration definieren
- Mapping Quelle/Ziel erstellen
- Migrationsregeln festlegen
- Datenqualität prüfen
- Probemigration planen
- finale Migration und Cutover abstimmen

---

# 8. Finance, Controlling und Compliance

## Fragen

142. Welche Finanzprozesse müssen abgebildet werden?

   - Debitoren
   - Kreditoren
   - Hauptbuch
   - Anlagenbuchhaltung
   - Kostenstellenrechnung
   - Kostenträgerrechnung
   - Projektcontrolling
   - Produktionscontrolling
   - Liquiditätsplanung
   - Intercompany
   - Konsolidierung

143. Welche Kontenpläne werden genutzt?

144. Gibt es mehrere Währungen?

145. Gibt es mehrere Steuerlogiken?

146. Gibt es Kostenstellen und Profit Center?

147. Gibt es Gemeinkostenzuschläge?

148. Wie erfolgt Produktkalkulation?

149. Wie erfolgt Projektkalkulation?

150. Wie wird Nachkalkulation durchgeführt?

151. Welche Reports benötigt die Geschäftsführung?

152. Welche Reports benötigt Controlling?

153. Welche gesetzlichen Anforderungen sind relevant?

   - GoBD
   - DSGVO
   - ISO 9001
   - TISAX
   - SOX
   - branchenspezifische Anforderungen
   - E-Rechnung
   - Audit-Anforderungen

154. Welche Prüfungen erwartet der Wirtschaftsprüfer?

155. Welche Belege müssen revisionssicher archiviert werden?

## Mögliche Ableitungen

### Mögliche Epics

- Finanzbuchhaltung einrichten
- Kostenrechnung und Controllingmodell definieren
- Projekt- und Produktkalkulation abbilden
- Compliance- und Archivierungsanforderungen umsetzen
- Reportingstruktur aufbauen

### Mögliche Arbeitspakete

- Kontenplan aufnehmen
- Kostenstellenmodell definieren
- Kalkulationslogik beschreiben
- steuerliche Anforderungen klären
- Prüfungs- und Archivierungsanforderungen aufnehmen

---

# 9. Reporting, BI und Kennzahlen

## Fragen

156. Welche Kennzahlen sollen künftig verfügbar sein?

157. Welche Reports werden heute manuell erstellt?

158. Welche Excel-Reports sollen abgelöst werden?

159. Welche Echtzeitdaten werden benötigt?

160. Welche Management-Dashboards werden benötigt?

161. Welche operativen Dashboards werden benötigt?

162. Welche Datenquellen müssen ins Reporting einfließen?

163. Gibt es Power BI, SAP Analytics, Oracle Analytics oder andere BI-Systeme?

164. Welche KPIs sind kritisch?

   - Auftragseingang
   - Umsatz
   - Deckungsbeitrag
   - Liefertermintreue
   - Lagerwert
   - Bestand
   - Produktionsauslastung
   - Projektmarge
   - Nacharbeit
   - Ausschuss
   - Einkaufsvolumen
   - Lieferantenperformance
   - Forderungen
   - Liquidität

165. Wer darf welche Reports sehen?

166. Müssen Reports auditierbar sein?

## Mögliche Ableitungen

### Mögliche Epics

- Reportinganforderungen aufnehmen
- KPI-Modell definieren
- BI-Anbindung konzipieren
- Management-Dashboard erstellen
- operative Reports ablösen

### Mögliche Arbeitspakete

- bestehende Reports analysieren
- KPI-Katalog erstellen
- Datenquellen definieren
- Berechtigungen für Reporting klären
- Ziel-Dashboards spezifizieren

---

# 10. Rollen, Berechtigungen und Security

## Fragen

167. Welche Benutzergruppen gibt es?

168. Welche Rollen werden benötigt?

   - Geschäftsführung
   - Vertrieb
   - Einkauf
   - Lager
   - Produktion
   - Arbeitsvorbereitung
   - Konstruktion
   - Service
   - Finance
   - Controlling
   - HR
   - IT-Admin
   - Key User
   - externe Nutzer

169. Welche Funktionen dürfen nur eingeschränkt verfügbar sein?

170. Wer darf Preise sehen?

171. Wer darf Kosten sehen?

172. Wer darf Stammdaten ändern?

173. Wer darf Buchungen stornieren?

174. Wer darf Freigaben erteilen?

175. Gibt es Funktionstrennung nach Compliance-Anforderungen?

176. Wird SSO benötigt?

177. Wird Active Directory / Entra ID angebunden?

178. Gibt es externe Benutzer?

179. Gibt es Audit-Logs?

180. Gibt es Anforderungen an Mandantentrennung oder Standorttrennung?

## Mögliche Ableitungen

### Mögliche Epics

- Rollen- und Berechtigungskonzept erstellen
- SSO-Konzept definieren
- Audit- und Berechtigungsprüfungen vorbereiten
- Funktionstrennung umsetzen

### Mögliche Arbeitspakete

- Rollenmodell aufnehmen
- Berechtigungsmatrix erstellen
- kritische Berechtigungen identifizieren
- SSO-Anforderungen klären
- Audit- und Logging-Anforderungen beschreiben

---

# 11. Integrationen und Schnittstellen

## Fragen

181. Welche Schnittstellen sind zwingend für Go-Live?

182. Welche Schnittstellen können später folgen?

183. Welche Schnittstellen sind bidirektional?

184. Welche Datenobjekte werden übertragen?

185. Wer ist führendes System je Datenobjekt?

186. Wie häufig müssen Daten synchronisiert werden?

   - Echtzeit
   - stündlich
   - täglich
   - manuell
   - ereignisbasiert

187. Welche Schnittstellentechnologien sind möglich?

   - API
   - Webhook
   - EDI
   - CSV
   - XML
   - Datenbankzugriff
   - Middleware
   - Standardconnector

188. Gibt es Monitoring für Schnittstellenfehler?

189. Wer ist verantwortlich für Fehlerbehebung?

190. Wie werden Schnittstellen getestet?

191. Gibt es externe Abhängigkeiten von Kunden oder Lieferanten?

## Mögliche Ableitungen

### Mögliche Epics

- Schnittstellenarchitektur definieren
- Datenflüsse dokumentieren
- Schnittstellenmonitoring einführen
- Integrations-Backlog erstellen

### Mögliche Arbeitspakete

- Schnittstelleninventar erstellen
- Datenobjekte je Schnittstelle definieren
- führendes System festlegen
- Übertragungsfrequenz definieren
- Fehlerhandling und Monitoring konzipieren
- Schnittstellentests planen

---

# 12. Customizing, Standardnähe und Sonderentwicklung

## Fragen

192. Welche Anforderungen können im Standard abgebildet werden?

193. Wo werden Anpassungen benötigt?

194. Welche Prozesse sollen bewusst an den ERP-Standard angepasst werden?

195. Welche Prozesse sind differenzierend und dürfen nicht standardisiert werden?

196. Gibt es Sonderlogiken, die geschäftskritisch sind?

197. Gibt es Eigenentwicklungen im Altsystem?

198. Müssen bestehende Makros, Access-Datenbanken oder Excel-Tools ersetzt werden?

199. Wer entscheidet über Sonderentwicklung?

200. Gibt es eine Regel: Standard vor Customizing vor Entwicklung?

201. Wie wird verhindert, dass das neue ERP zum alten System nachgebaut wird?

## Mögliche Ableitungen

### Mögliche Epics

- Fit-Gap-Analyse durchführen
- Customizing-Entscheidungen dokumentieren
- Sonderentwicklungen bewerten
- Standardprozess-Workshops durchführen

### Mögliche Arbeitspakete

- Standardprozesse gegen Anforderungen prüfen
- Fit-Gap-Liste erstellen
- Sonderentwicklungen bewerten
- Entscheidungsvorlagen für Abweichungen erstellen
- Customizing-Leitplanken definieren

---

# 13. Projektmethodik, Phasen und Backlog-Struktur

## Fragen

202. Welches Vorgehensmodell ist passend?

   - klassisch
   - agil
   - hybrid
   - phasenorientiert
   - Rollout nach Standorten
   - Rollout nach Modulen
   - Big Bang
   - Pilotierung

203. Welche Phasen werden benötigt?

   - Initiierung
   - Analyse
   - Zielbild
   - Fit-Gap
   - Konzeption
   - Realisierung
   - Migration
   - Test
   - Schulung
   - Cutover
   - Go-Live
   - Hypercare
   - Optimierung

204. Wie sollen Anforderungen dokumentiert werden?

   - Lastenheft
   - Pflichtenheft
   - Epics
   - Features
   - User Stories
   - Prozesssteckbriefe
   - Fit-Gap-Liste
   - Entscheidungsvorlagen

205. Welches Tool wird genutzt?

   - Jira
   - Azure DevOps
   - DevOps Board
   - Excel
   - Confluence
   - SharePoint
   - anderes Tool

206. Wie werden Anforderungen priorisiert?

   - Must-have
   - Should-have
   - Could-have
   - Won’t-have
   - gesetzlich erforderlich
   - Go-Live-kritisch
   - Business Value
   - Risiko
   - Aufwand

207. Wie werden offene Fragen verwaltet?

208. Wie werden Entscheidungen dokumentiert?

## Mögliche Ableitungen

### Mögliche Epics

- Projektmethodik und Backlog-Struktur festlegen
- Anforderungsmanagement aufsetzen
- Entscheidungslog und RAID-Log einführen
- Projektphasenplan erstellen

### Mögliche Arbeitspakete

- Vorgehensmodell auswählen
- Projektphasen definieren
- Backlog-Struktur festlegen
- Priorisierungsmethode abstimmen
- Entscheidungslog einführen
- Open-Items-Log einführen

---

# 14. Tests, Qualitätssicherung und Abnahme

## Fragen

209. Welche Testarten werden benötigt?

   - Unit Test
   - Integrationstest
   - Schnittstellentest
   - Migrationstest
   - Prozess-End-to-End-Test
   - User Acceptance Test
   - Performance-Test
   - Security-Test
   - Regressionstest

210. Wer erstellt Testfälle?

211. Wer führt Tests durch?

212. Welche Prozesse sind Go-Live-kritisch?

213. Welche Testdaten werden benötigt?

214. Wie werden Fehler dokumentiert?

215. Welche Fehlerklassen gibt es?

   - kritisch
   - hoch
   - mittel
   - niedrig

216. Welche Kriterien müssen erfüllt sein, damit Go-Live freigegeben wird?

217. Wer erteilt fachliche Abnahme?

218. Wer erteilt technische Abnahme?

219. Wie wird sichergestellt, dass End-to-End-Prozesse getestet wurden?

## Mögliche Ableitungen

### Mögliche Epics

- Teststrategie erstellen
- Testfälle für Kernprozesse definieren
- User Acceptance Test durchführen
- Go-Live-Abnahmekriterien festlegen

### Mögliche Arbeitspakete

- Testkonzept erstellen
- Testfälle je Prozess definieren
- Testdaten vorbereiten
- Fehlermanagement aufsetzen
- Abnahmekriterien dokumentieren
- End-to-End-Testplan erstellen

---

# 15. Schulung, Change Management und Adoption

## Fragen

220. Welche Nutzergruppen müssen geschult werden?

221. Welche Schulungsformate sind geeignet?

   - Präsenz
   - Remote
   - Train-the-Trainer
   - E-Learning
   - Prozesshandbuch
   - Kurzvideos
   - Key-User-Sprechstunden
   - On-the-Job

222. Gibt es Key User je Fachbereich?

223. Wie werden Key User befähigt?

224. Gibt es Widerstände gegen das neue System?

225. Welche Prozesse ändern sich stark?

226. Welche Rollen ändern sich?

227. Welche Kommunikationsformate werden benötigt?

228. Wie werden Führungskräfte eingebunden?

229. Wie wird sichergestellt, dass das ERP nach Go-Live tatsächlich genutzt wird?

230. Gibt es ein Supportmodell für die ersten Wochen nach Go-Live?

## Mögliche Ableitungen

### Mögliche Epics

- Schulungskonzept erstellen
- Key-User-Modell aufbauen
- Change-Kommunikation planen
- Hypercare-Support vorbereiten

### Mögliche Arbeitspakete

- Schulungsgruppen definieren
- Trainingsplan erstellen
- Key-User-Rollen definieren
- Kommunikationsplan erstellen
- Supportmodell für Hypercare vorbereiten
- Schulungsunterlagen erstellen

---

# 16. Cutover, Go-Live und Hypercare

## Fragen

231. Welches Go-Live-Szenario ist geplant?

   - Big Bang
   - schrittweise nach Modulen
   - schrittweise nach Standorten
   - Pilot + Rollout
   - Parallelbetrieb

232. Welche Aktivitäten müssen vor Go-Live abgeschlossen sein?

233. Gibt es einen Cutover-Plan mit Verantwortlichen und Zeitfenstern?

234. Wann wird das Altsystem eingefroren?

235. Wann erfolgt die finale Migration?

236. Wann werden Bestände gezählt?

237. Wann werden offene Aufträge übernommen?

238. Wer entscheidet über Go/No-Go?

239. Gibt es einen Fallback-Plan?

240. Welche Supportstruktur gilt in den ersten 2, 4 und 8 Wochen nach Go-Live?

241. Wie werden Go-Live-Probleme priorisiert?

242. Wann endet Hypercare?

## Mögliche Ableitungen

### Mögliche Epics

- Cutover-Plan erstellen
- Go-/No-Go-Kriterien definieren
- Hypercare-Modell aufsetzen
- Fallback-Strategie entwickeln

### Mögliche Arbeitspakete

- Cutover-Aktivitäten planen
- Verantwortlichkeiten definieren
- Freeze-Zeitpunkte festlegen
- finale Migration planen
- Go-/No-Go-Termin vorbereiten
- Supportteam für Hypercare festlegen
- Fallback-Optionen bewerten

---

# 17. Kompakte Struktur für den Anforderungskatalog

Jede relevante Antwort aus dem Fragenkatalog sollte in das folgende Format überführt werden.

```markdown
# Requirement: <Titel>

## Status

Proposed / In Review / Approved / Rejected / Implemented

## Bereich

Vertrieb / Einkauf / Lager / Produktion / Finance / Controlling / Service / IT / Schnittstellen / Migration / Reporting

## Ausgangssituation

<Wie läuft es heute?>

## Zielbild

<Wie soll es künftig laufen?>

## Fachliche Anforderung

<Was muss das ERP fachlich können?>

## Systemrelevanz

SAP / Microsoft Dynamics / Oracle / anderes ERP / systemunabhängig

## Priorität

Must-have / Should-have / Could-have / Later

## Akzeptanzkriterien

- [ ] Kriterium 1
- [ ] Kriterium 2
- [ ] Kriterium 3

## Nicht-Akzeptanzkriterien

- [ ] Was ausdrücklich nicht genügt
- [ ] Welche Lösung nicht akzeptiert wird

## Abhängigkeiten

- Prozess
- Schnittstelle
- Datenmigration
- Rollen/Berechtigungen
- Reporting
- externe Systeme

## Risiken

- Risiko 1
- Risiko 2

## Offene Fragen

- Frage 1
- Frage 2

## Entscheidung erforderlich?

Ja / Nein

## Verantwortlich

<Rolle / Fachbereich>
```

---

# 18. Vorlage für ERP-User-Stories

```markdown
# User Story: <Titel>

## Status

Proposed

## Epic

<Epic-Name>

## User Story

Als <Rolle> möchte ich <Funktion/Prozess>, damit <fachlicher Nutzen>.

## Beschreibung

<Kurze fachliche Beschreibung>

## Akzeptanzkriterien

- [ ] Das System ermöglicht ...
- [ ] Pflichtfelder sind definiert und validiert.
- [ ] Berechtigungen greifen gemäß Rollenmodell.
- [ ] Der Prozess kann durch einen Key User getestet werden.
- [ ] Relevante Daten erscheinen im Reporting.
- [ ] Fehlerfälle werden nachvollziehbar angezeigt oder protokolliert.

## Nicht-Akzeptanzkriterien

- [ ] Keine manuelle Excel-Nebenlösung als dauerhafte Lösung.
- [ ] Keine doppelte Datenpflege ohne definierte Systemführerschaft.
- [ ] Keine Umsetzung ohne geklärte Stammdatenverantwortung.

## Definition of Ready

- [ ] Prozess fachlich beschrieben
- [ ] Verantwortlicher Fachbereich benannt
- [ ] Akzeptanzkriterien messbar
- [ ] Datenobjekte bekannt
- [ ] Schnittstellenbedarf geprüft
- [ ] Berechtigungsbedarf geprüft
- [ ] Reportingbedarf geprüft
- [ ] offene Fragen dokumentiert

## Definition of Done

- [ ] Funktion umgesetzt oder konfiguriert
- [ ] Fachbereich hat getestet
- [ ] Akzeptanzkriterien erfüllt
- [ ] Berechtigungen geprüft
- [ ] Migrationseinfluss geprüft
- [ ] Dokumentation aktualisiert
- [ ] Schulungsbedarf berücksichtigt
- [ ] Abnahme erfolgt

## Abhängigkeiten

- <Abhängigkeit 1>
- <Abhängigkeit 2>

## Risiken

- <Risiko 1>
- <Risiko 2>

## Offene Fragen

- <Frage 1>
- <Frage 2>
```

---

# 19. Empfohlene ERP-Epics für fast jedes Projekt

1. Projektauftrag, Zielbild und Business Case
2. Organisationsstruktur und ERP-Grundmodell
3. Prozessaufnahme und Fit-Gap-Analyse
4. Stammdaten und Datenqualität
5. Vertrieb und Auftragsabwicklung
6. Einkauf und Lieferantenprozesse
7. Lager und Materialwirtschaft
8. Produktion und Fertigungssteuerung
9. Projektgeschäft und Projektcontrolling
10. Service und After Sales
11. Finance und Controlling
12. Reporting und BI
13. Rollen, Berechtigungen und Compliance
14. Schnittstellen und Integrationen
15. Datenmigration und Altsystemstrategie
16. Customizing und Erweiterungen
17. Teststrategie und Abnahme
18. Schulung und Change Management
19. Cutover, Go-Live und Hypercare
20. Betrieb, Support und kontinuierliche Optimierung

---

# 20. Wichtigste Erfolgsfragen vor Projektstart

Diese Fragen sollten vor Projektstart zwingend beantwortet sein:

1. Wer ist der fachliche Entscheider je Kernprozess?
2. Was ist das verbindliche Zielbild des ERP-Projekts?
3. Welche Prozesse werden standardisiert und welche bleiben individuell?
4. Welche Daten sind führend in welchem System?
5. Welche Stammdatenqualität ist für Go-Live zwingend erforderlich?
6. Welche Schnittstellen sind Go-Live-kritisch?
7. Welche Altdaten werden migriert und welche nur archiviert?
8. Welche Prozesse müssen End-to-End getestet werden?
9. Wer nimmt fachlich ab?
10. Was ist der Fallback, falls Go-Live nicht freigegeben wird?

---

# 21. Empfohlene Mindest-Arbeitspakete für den Projektstart

## Phase 1: Initiierung

- Projektauftrag erstellen
- Zielbild definieren
- Stakeholder identifizieren
- Governance-Struktur aufsetzen
- Projektorganisation definieren
- Kommunikationsplan erstellen

## Phase 2: Analyse

- Ist-Prozesse aufnehmen
- Systemlandschaft dokumentieren
- Schnittstellen erfassen
- Stammdatenqualität prüfen
- Risiken und Abhängigkeiten erfassen
- Fit-Gap-Analyse vorbereiten

## Phase 3: Zielbild und Konzeption

- Soll-Prozesse definieren
- ERP-Standardprozesse prüfen
- Fit-Gap-Liste erstellen
- Customizing-Bedarfe identifizieren
- Datenmodell abstimmen
- Rollen- und Berechtigungskonzept erstellen

## Phase 4: Umsetzung

- ERP konfigurieren
- Schnittstellen umsetzen
- Migration vorbereiten
- Reports erstellen
- Rollen einrichten
- Sonderentwicklungen umsetzen

## Phase 5: Test und Abnahme

- Teststrategie erstellen
- Testfälle definieren
- Integrationstests durchführen
- Migrationstests durchführen
- User Acceptance Test durchführen
- Abnahmen dokumentieren

## Phase 6: Schulung und Go-Live

- Schulungsplan erstellen
- Key User schulen
- Endanwender schulen
- Cutover durchführen
- Go-/No-Go-Entscheidung treffen
- Go-Live durchführen

## Phase 7: Hypercare und Optimierung

- Supportstruktur aktivieren
- Go-Live-Probleme priorisieren
- offene Punkte nachverfolgen
- Prozessoptimierungen aufnehmen
- Lessons Learned durchführen

---

# 22. Kurzfazit

Ein erfolgreiches ERP-Projekt benötigt mehr als eine reine Systemauswahl.

Entscheidend ist, dass fachliche Anforderungen, Prozesse, Daten, Schnittstellen, Rollen, Tests, Migration, Schulung und Betrieb gemeinsam betrachtet werden.

Besonders im Maschinenbau und Industrieumfeld sind die kritischsten Themen meist:

- Stammdatenqualität
- Stücklisten und Variantenlogik
- CAD/PDM-Integration
- Produktionsplanung
- Projektfertigung
- Lager- und Bestandslogik
- Kalkulation und Nachkalkulation
- Schnittstellen
- Migration laufender Aufträge und Projekte
- Key-User-Verfügbarkeit
- Go-Live- und Cutover-Fähigkeit

Der Fragenkatalog sollte daher nicht nur als Interviewleitfaden genutzt werden, sondern als direkte Grundlage für:

- Anforderungen
- Arbeitspakete
- Epics
- User Stories
- Risiken
- Testfälle
- Schulungsplanung
- Cutover-Planung
- Entscheidungsmanagement
