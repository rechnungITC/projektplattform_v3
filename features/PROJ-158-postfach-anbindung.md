# PROJ-158: Postfach-Anbindung (IMAP · Microsoft 365 · Gmail)

## Status: Architected
## Deployment Scope: —
**Created:** 2026-08-31
**Last Updated:** 2026-08-31

Ein Mandant hinterlegt ein E-Mail-Postfach, dessen Zugangsdaten verschlüsselt abgelegt werden, und
kann die Verbindung prüfen. **Diese Slice holt keine Mail ab** — sie stellt nur die Verbindung her
und weist nach, dass sie trägt. Das Abholen ist PROJ-159.

Erste Slice der Kette *Mail-Eingang als Stakeholder-Interaktion*: **158 Anbindung → 159 Abholung und
Posteingang → 160 Zuweisung zum Projekt → 161 Zuleitungsregeln → 162 KI auf der Mail.**

---

## Erdungsbefunde

Vier Messungen vom 2026-08-31, die den Zuschnitt bestimmen. Sie stehen hier, weil sie eine naive
Umsetzung widerlegen — nicht als Schmuck.

**B-1 — Ein Client trägt alle drei Anbieter; unterschiedlich ist nur die Token-Beschaffung.**
`imapflow` unterstützt `auth.accessToken`, also XOAUTH2 — in der Bibliothek selbst nachgesehen
(`lib/imap-flow.js`: `if (this.options.auth.accessToken) … AUTHENTICATE`). Microsoft 365 und Gmail
sprechen weiterhin IMAP, nur eben mit einem OAuth-Token statt einem Passwort. **Es braucht daher
weder `@microsoft/microsoft-graph-client` noch `@googleapis/gmail`** — die wären nur nötig, wenn man
statt IMAP die jeweilige REST-API benutzte.

**B-2 — Bei beiden großen Anbietern ist OAuth heute Pflicht, nicht Kür.** Microsoft weist
SMTP-Basic-Auth seit dem **30. April 2026** zu 100 % ab; IMAP und POP laufen weiter, aber
ausschließlich mit OAuth 2.0, und **App-Passwörter funktionieren nicht mehr und lassen sich nicht
neu erzeugen**. Google verlangt für Drittanbieter-Zugriff auf Workspace seit dem **14. März 2025**
OAuth und baut App-Passwörter 2026 ab. Ein Entwurf, der für diese beiden auf ein Passwortfeld setzt,
ist bei Auslieferung bereits tot.

**B-3 — Kein Lizenzproblem.** Alle geprüften Kandidaten sind MIT oder Apache-2.0. Der PROJ-45-ε-Fall
(libde265 dual GPL gegen einen Prod-Baum ohne eine einzige GPL-only-Abhängigkeit) wiederholt sich
nicht.

**B-4 — Die neue Fläche ist kleiner als bei den Alternativen, aber größer als zunächst gemessen.**
`imapflow` stammt aus demselben Haus wie das bereits eingebaute `mailparser`; **6 seiner 8 direkten
Abhängigkeiten liegen bereits im Prod-Baum**.

**Korrektur vom 2026-09-01, nach der echten Installation:** die Erstfassung dieser Messung nannte
„netto zwei neue Pakete" und zählte damit nur die **direkten** Abhängigkeiten. Tatsächlich wächst der
Prod-Baum um **16** Pakete, weil `pino` selbst elf mitbringt. Die Zahl stand falsch in der
CIA-Vorlage und im ersten Entwurf — hier berichtigt statt stehengelassen.

Gemessen vorher/nachher: **586 → 602** aufgelöste Prod-Pfade. Neu sind `imapflow`, `socks`,
`smart-buffer` — und **13 Pakete der Logging-Bibliothek** (`pino` samt `@pinojs/redact`,
`atomic-sleep`, `on-exit-leak-free`, `pino-abstract-transport`, `pino-std-serializers`,
`process-warning`, `quick-format-unescaped`, `real-require`, `safe-stable-stringify`, `sonic-boom`,
`split2`, `thread-stream`). **Vier Fünftel der neuen Fläche sind also ein Logger, den die Anwendung
wegen Sentry nicht braucht** — das verschärft das im Entwurf notierte Risiko R-4 und ist ein
eigener Followup wert (die Bibliothek lässt sich mit einem stillen Logger konfigurieren, das
Paket bleibt aber im Baum). `npm audit --omit=dev` bleibt bei **0 Vulnerabilities**.
Zur Einordnung der Alternativen: `node-imap` wurde zuletzt **2020** veröffentlicht, `imap-simple`
**2021** — für eine Netzwerkbibliothek, die Zugangsdaten führt, ist das disqualifizierend;
`imapflow` erschien zuletzt am **2026-08-31**.

---

## Dependencies

- **Requires PROJ-14** (Connector-Registry + verschlüsselte Geheimnis-Ablage) — wiederverwendet
  werden dessen **Ver- und Entschlüsselungsfunktionen**, nicht die Eindeutigkeit seiner Tabelle
  (siehe korrigiertes AC-158.4 und Tech Design Abschnitt 1). Es entsteht kein zweites
  Verschlüsselungsverfahren.
- **Requires PROJ-3/PROJ-17** (Mandanten und Mandanten-Administration) — ein Postfach gehört einem
  Mandanten, und nur die Administration darf es einrichten.
- **Blockiert PROJ-159** (Abholung) — ohne geprüfte Verbindung gibt es nichts abzuholen.

---

## User Stories

1. Als **Mandanten-Administration** will ich ein Postfach hinterlegen können, damit die Plattform
   später eingehende Projektkorrespondenz erfassen kann.
2. Als **Mandanten-Administration** will ich zwischen einem eigenen IMAP-Host, Microsoft 365 und
   Gmail wählen können, weil unsere Kunden alle drei einsetzen.
3. Als **Mandanten-Administration** will ich die Verbindung **prüfen** können, bevor irgendetwas
   abgeholt wird, damit ein Tippfehler oder ein abgelaufenes Token sofort auffällt und nicht erst
   nachts im Hintergrund.
4. Als **Mandanten-Administration** will ich sehen, wann die Verbindung zuletzt erfolgreich war und
   woran sie gescheitert ist, damit ich ein abgelaufenes Token erkenne, ohne Protokolle zu lesen.
5. Als **Mandanten-Administration** will ich ein Postfach wieder entfernen und die Zustimmung
   zurückziehen können, ohne dass Reste im System verbleiben.
6. Als **Datenschutzverantwortlicher** will ich vor dem Einrichten sehen, **was** die Anbindung
   erlaubt und **was noch nicht passiert**, damit die Einwilligung informiert ist.

---

## Acceptance Criteria

### A. Einrichtung

- [ ] **AC-158.1** — Genau **drei** Anbietertypen sind wählbar: eigener IMAP-Host, Microsoft 365,
      Gmail. Die Auswahl bestimmt, welche Felder erscheinen.
- [ ] **AC-158.2** — Beim eigenen IMAP-Host werden Host, Port, Verschlüsselung, Benutzername und
      Passwort erfasst. Das Passwort ist nach dem Speichern **nie wieder lesbar**, weder in der
      Oberfläche noch in einer API-Antwort.
- [ ] **AC-158.3** — Bei Microsoft 365 und Gmail gibt es **kein Passwortfeld**, sondern eine
      Zustimmung beim Anbieter; die Oberfläche benennt, dass Passwörter dort nicht mehr zulässig
      sind (B-2).
- [ ] **AC-158.4** *(am 2026-08-31 in `/architecture` korrigiert)* — Zugangsdaten und Token liegen
      **verschlüsselt über dasselbe Verfahren wie die Konnektor-Geheimnisse**; es entsteht **kein**
      zweites Verschlüsselungsverfahren und keine Klartextspalte.
      **Warum der Wortlaut geändert wurde:** die Erstfassung verlangte die Ablage *in* `tenant_secrets`.
      Gemessen hält diese Tabelle je Mandant und Konnektor-Art **genau einen** Eintrag — mehrere
      Postfächer je Mandant (AC-158.6) passen dort nicht hinein, und die Eindeutigkeit zu lockern
      hieße, den Vertrag von **sechs ausgelieferten Konnektoren** zu ändern. Die *Absicht* des
      Kriteriums (ein Verfahren für Geheimnisse, nichts im Klartext) bleibt unverändert und wird
      erfüllt; nur der vorgeschriebene Ablageort war nicht baubar. Siehe Tech Design Abschnitt 1.
- [ ] **AC-158.5** *(am 2026-09-01 korrigiert)* — **Jeder Mandanten-Nutzer** kann **sein eigenes**
      Postfach anlegen, ändern, prüfen und entfernen. **Niemand** kann ein fremdes Postfach anlegen,
      ändern, prüfen, entfernen oder dessen Zugangsdaten lesen — auch die Mandanten-Administration
      nicht. **Warum geändert:** die Erstfassung sagte „nur die Mandanten-Administration" und ging
      von einem *mandantenweiten* Postfach aus. Es ist *nutzereigen* (Q2) — eine
      Administrations-Sperre wäre sachlich falsch und verhinderte den Normalfall.
- [ ] **AC-158.5b** *(am 2026-09-01 vom Nutzer entschieden — strenger als meine Auslegung)* — Die
      Postfach-Liste ist **ausschliesslich** für den Eigentümer sichtbar. Auch die
      Mandanten-Administration sieht **kein** fremdes Postfach, weder Eintrag noch Zustand.
      **Klärung der Vorgabe:** „der Admin sieht die Kommunikation" war auf die **in Projekte
      abgelegten Mails** gemünzt — die laufen über die normale Projekt-Sichtbarkeit und brauchen
      hier keine Sonderregel. Das Postfach selbst bleibt privat.
      **Damit ist die Regel deckungsgleich mit PROJ-151** (Projekt-Chat: privat auch vor der
      Administration) statt eine Ausnahme davon — ein Ergebnis, das ich mit meiner konservativen
      Zwischenauslegung noch verfehlt hatte.
- [ ] **AC-158.6** *(am 2026-09-01 korrigiert)* — **Ein Nutzer** kann **mehr als ein** Postfach
      anbinden; jedes trägt einen selbst vergebenen Namen. *(Erstfassung: „pro Mandant".)*

### B. Verbindungsprüfung

- [ ] **AC-158.7** — Eine ausdrückliche Prüfung stellt die Verbindung her, meldet sich an und liest
      **nur** die Existenz und den Namen der Postfachordner. **Keine Nachricht wird gelesen,
      heruntergeladen oder gespeichert** — das ist der Unterschied zu PROJ-159 und muss nachweisbar
      sein.
- [ ] **AC-158.8** — Das Ergebnis wird mit Zeitpunkt gespeichert und angezeigt: erfolgreich, oder
      gescheitert mit einem **verständlichen deutschen Grund** (falsche Zugangsdaten, Host nicht
      erreichbar, Token abgelaufen, Zustimmung widerrufen, IMAP beim Anbieter deaktiviert).
- [ ] **AC-158.9** — Der Fehlertext des Anbieters wird **nicht roh** durchgereicht; er darf weder
      Zugangsdaten noch interne Adressen enthalten.
- [ ] **AC-158.10** — Die Prüfung läuft in eine **Zeitgrenze** und blockiert die Oberfläche nicht
      unbegrenzt; ein hängender Server führt zu einer benannten Absage, nicht zu einem Dauerzustand.

### C. Zustimmung und Token (nur Microsoft 365 und Gmail)

- [ ] **AC-158.11** — Die Zustimmung läuft über den Anbieter; die Plattform sieht zu keinem Zeitpunkt
      das Passwort des Postfachs.
- [ ] **AC-158.12** — Der Umfang der Zustimmung ist auf **Lesen** beschränkt und wird der
      Administration **vor** dem Weiterleiten im Klartext angezeigt.
- [ ] **AC-158.13** — Ein abgelaufenes Zugriffstoken wird selbsttätig erneuert. Schlägt das fehl,
      erscheint das Postfach als *Zustimmung erforderlich* mit einem Weg zurück zur Erneuerung —
      und **nicht** als technischer Fehler.
- [ ] **AC-158.14** — Beim Entfernen eines Postfachs werden die Token gelöscht und die Zustimmung
      beim Anbieter zurückgezogen, soweit dessen Schnittstelle das anbietet. Was nicht zurückziehbar
      ist, wird der Administration **benannt**.

### D. Datenschutz — was diese Slice zusagt und was nicht

- [ ] **AC-158.15** — Vor dem Speichern erklärt die Fläche in einem Satz, **was diese Anbindung noch
      nicht tut**: es werden keine Mails abgeholt, gespeichert oder ausgewertet. Diese Zusage ist
      technisch eingelöst (AC-158.7) und nicht nur behauptet.
- [ ] **AC-158.16** *(am 2026-09-01 korrigiert — zwei Kriterien widersprachen sich)* — Das
      Einrichten, Ändern, Prüfen und Entfernen eines Postfachs wird **nicht** in den geteilten
      Änderungsprotokoll-Trail (PROJ-10) geschrieben. Nachvollziehbar bleibt es über den
      gespeicherten Zustand am Postfach selbst (Zeitpunkt und Ergebnis der letzten Prüfung), der
      **nur der Eigentümer** sieht. Zugangsdaten und Token geraten in keinen Protokolleintrag.

      **Warum geändert — der Widerspruch ist gemessen, nicht vermutet:** die Erstfassung verlangte
      den Eintrag in den geteilten Trail. Dessen Lesetor `can_read_audit_entry` beginnt mit einem
      **Kurzschluss für die Mandanten-Administration** und löst danach zu jedem Eintrag ein
      **Projekt** auf. Ein Postfach hat kein Projekt, und der Kurzschluss hätte Name, Host und
      Benutzername jedes privaten Postfachs für die Administration lesbar gemacht — **genau das,
      was AC-158.5b verbietet**. Ein privates Objekt in einen geteilten, administrations-lesbaren
      Trail zu schreiben, hebt seine Privatheit auf.

      Damit folgt diese Slice der **PROJ-144-Präzedenz** (nutzerprivate Daten bekommen keinen
      Feld-Audit im geteilten Trail). Sollte später ein Protokoll über Postfach-Änderungen gewünscht
      sein, ist der Weg eine **eigene, eigentümer-lesbare Ereignistabelle** nach dem PROJ-105-Muster
      — nicht der geteilte Trail. Als Followup vorgemerkt, bewusst nicht in α.
- [ ] **AC-158.17** — Die Spec benennt **vor** PROJ-159 verbindlich, wer die später abgeholten Mails
      sehen darf und wie lange nicht zugewiesene Mails bleiben. Ohne diese Festlegung darf PROJ-159
      nicht beginnen. *(Grund: eine nicht zugewiesene Mail hat keinen Projektanker, und die gesamte
      Need-to-know-Schicht aus PROJ-100a hängt an `project_id` — es gibt hier nichts zu erben.)*

### E. Härtung

- [ ] **AC-158.18** — Ein Mandant kann das Postfach eines anderen Mandanten weder sehen, prüfen noch
      entfernen; live gegen Prod belegt, nicht nur über die Oberfläche.
- [ ] **AC-158.19** — Host- und Portangaben werden gegen den Zugriff auf interne Adressbereiche
      geprüft (dieselbe Klasse wie die SSRF-Absicherung aus PROJ-115: `https`-Analogie, keine
      reservierten Bereiche, keine Zugangsdaten in der Adresse).
- [ ] **AC-158.20** — `anon` kann keine der neuen Routen und keine neue Datenbankfunktion aufrufen;
      geprüft wird auch der **PUBLIC**-Eintrag der Rechte, nicht nur `anon` und `authenticated`
      (PROJ-Y-114a-Lehre).
- [ ] **AC-158.21** — Die zwei neuen Pakete (`pino`, `socks`) sind die **einzigen** neuen
      Abhängigkeiten; `npm audit --omit=dev` und der OSV-Wächter bleiben grün.

---

## Edge Cases

- **Der Anbieter hat IMAP für das Konto abgeschaltet.** Häufiger Fall bei Microsoft 365, wo IMAP je
  Postfach freigeschaltet sein muss → eigene, benannte Absage statt „Anmeldung fehlgeschlagen".
- **Zwei-Faktor ohne App-Passwort beim eigenen IMAP-Host** → die Anmeldung scheitert dauerhaft; die
  Meldung muss auf die Ursache zeigen, nicht auf ein falsches Passwort.
- **Die Zustimmung wird beim Anbieter widerrufen**, ohne dass die Plattform es erfährt → beim
  nächsten Erneuern fällt es auf; das Postfach wechselt in *Zustimmung erforderlich*.
- **Dasselbe Postfach wird zweimal angelegt** → erkennen und ablehnen, sonst entstehen später
  doppelte Mails im Posteingang.
- **Das Passwort wird geändert und das Postfach nur bearbeitet, nicht neu angelegt** → die Prüfung
  muss danach zwingend erneut laufen, bevor der Zustand wieder *verbunden* heißt.
- **Ein Mandant entfernt ein Postfach, während PROJ-159 später gerade abholt** → in dieser Slice
  noch nicht erreichbar, aber die Ablage muss das Löschen so gestalten, dass es später nicht zu
  Waisen führt.
- **Der Postfachname enthält Zeichen, die in Protokollen oder Exporten stören** → begrenzen und
  bereinigen.
- **Ein Token läuft mitten in der Verbindungsprüfung ab** → einmal erneuern und wiederholen, nicht
  scheitern.

---

## Out of Scope

Bewusst nicht in dieser Slice, jeweils mit dem Ort, an den es gehört:

- **Mails abholen, speichern, anzeigen** → PROJ-159. Diese Slice stellt die Verbindung her und
  weist nach, dass sie trägt.
- **Zuweisung zu Projekten, Stakeholder-Erkennung** → PROJ-160.
- **Zuleitungsregeln** (wiederkehrender Absender oder Empfänger → festes Projekt) → PROJ-161.
- **KI (Sentiment, Zusammenfassung)** → PROJ-162, dort mit neuem AI-Zweck und vierfachem Lockstep.
- **Senden** (SMTP). PROJ-13 hat bereits einen ausgehenden Weg über Resend und Teams; ein zweiter
  über das Kundenpostfach wäre eine eigene Entscheidung, keine Nebenwirkung dieser Slice.
- **Ablage per Weiterleitung** („E-Mail-Assistent": Mail an eine Sammeladresse weiterleiten oder als
  Blindkopie mitschicken, angenommen nur von hinterlegten Absenderadressen) → **eigene Slice**, am
  2026-09-01 als Ziel benannt. Kein Zusatz zu dieser hier, sondern ein **zweiter, technisch
  gegenläufiger Eingangsweg**: IMAP *holt* Mail ab, die Sammeladresse *empfängt* sie und braucht
  dafür einen eingehenden Mail-Dienst, einen Adressraum und eine Absender-Positivliste. Beides in
  eine Slice zu legen hiesse, zwei Infrastrukturen gleichzeitig ungeprüft einzuführen.
- **Weitere Absenderadressen je Nutzer** (alternative Absender, zugleich Positivliste der
  Weiterleitungs-Ablage) → gehört zur Weiterleitungs-Slice.
- **Chats (Teams, Slack) als Eingang** → als späteres Thema benannt; Mail zuerst.
- **OAuth für Microsoft 365 und Gmail** → **Backend-β**. Nutzer-Entscheid am 2026-09-01: erst der
  IMAP-Weg mit Passwort, weil der OAuth-Weg ohne registrierte Anwendung im Kunden-Konto in **keiner
  Schicht** ausgeübt werden kann — und ungeprüfter Code ist genau das Muster, das PROJ-156 gekostet
  hat. Die Ablage wird so gebaut, dass β nur Felder ergänzt, nichts umbaut.
- **Ein Abstraktionslayer für weitere Anbieter.** Drei sind gefordert, drei werden gebaut.

---

## Technical Requirements

- **Neue Abhängigkeit:** `imapflow` (MIT). Netto zwei neue transitive Pakete (B-4). **CIA-Review ist
  am 2026-08-31 gelaufen**; die Entscheidung für alle drei Anbieter und für `imapflow` ist ein
  Nutzer-Entscheid gegen die Empfehlung „ein Protokoll zuerst" und als solcher dokumentiert.
- **Kein** Microsoft-Graph- und **kein** Google-API-Paket (B-1).
- Zugangsdaten und Token ausschließlich über den bestehenden verschlüsselten Weg (PROJ-14).
- Mandantentrennung über die etablierten RLS-Helfer; Schreibwege nur für die Mandanten-Administration.
- Die Verbindungsprüfung läuft serverseitig; Zugangsdaten erreichen den Browser nie.

---

## Offene Architekturfragen für `/architecture`

1. **Wo landet die Rückleitung der Zustimmung** (eine feste Adresse je Umgebung, und wie wird die
   Zuordnung zum Mandanten fälschungssicher mitgeführt)?
2. **Ein Postfach je Mandant oder je Projekt?** AC-158.6 erlaubt mehrere je Mandant; ob ein Postfach
   fest an ein Projekt gebunden werden kann, entscheidet mit, wie PROJ-161 seine Regeln schneidet.
3. **Wann wird das Token erneuert** — beim Zugriff, oder vorausschauend in einem der bestehenden
   Cron-Läufe? Das Zweite hält die Postfachliste ehrlich, das Erste spart Aufrufe.
4. **Wie wird die Registrierung beim Anbieter geführt** — eine Anwendungsregistrierung des
   Betreibers für alle Mandanten, oder je Mandant eine eigene? Das ist zugleich eine
   datenschutzrechtliche und eine betriebliche Frage.
5. **Wie wird AC-158.7 nachgewiesen** — dass die Prüfung wirklich keine Nachricht liest? Ein
   Nachweis, der nur die Oberfläche betrachtet, genügt dafür nicht.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

**Erstellt 2026-08-31. Alle fünf offenen Fragen sind beantwortet; zwei davon hat eine Messung gegen
den ausgelieferten Stand umgedreht.**

### 1. Der wichtigste Befund: die vorhandene Konnektor-Ablage trägt genau eine Sache nicht

Das Haus hat bereits alles, was eine Postfach-Anbindung braucht: eine Konnektor-Registry mit sechs
eingetragenen Konnektoren, eine verschlüsselte Ablage für Zugangsdaten, eine
Administrations-Oberfläche und sogar **eine fertige Verbindungsprüfungs-Route**. Die naheliegende
Umsetzung wäre gewesen, das Postfach als siebten Konnektor einzutragen.

**Das geht nicht, und der Grund ist messbar:** die Zugangsdaten-Ablage hält je Mandant und
Konnektor-Art **genau einen** Eintrag. Ein Mandant mit drei Postfächern — der Normalfall, den
AC-158.6 fordert — passt dort nicht hinein. Diese Eindeutigkeit zu lockern hieße, den Vertrag zu
ändern, auf dem **sechs ausgelieferte Konnektoren** stehen.

**Entscheidung, nach dem Muster von PROJ-45-α („spiegeln, nicht generalisieren"):** die Postfächer
bekommen eine **eigene Liste**. Wiederverwendet wird die **Verschlüsselung** — dieselben geprüften
Ver- und Entschlüsselungsfunktionen, die die Konnektoren nutzen —, **nicht** die Eindeutigkeit ihrer
Tabelle. Damit bleibt genau ein Verfahren für Geheimnisse im Haus, und kein bestehender Konnektor
wird angefasst.

### 2. Was der Nutzer sieht

```
Konnektoren  (bestehende Seite, Mandanten-Administration)
+-- bestehende Konnektoren (E-Mail-Versand, Slack, Teams, Jira, MCP, Anthropic)  — unverändert
+-- NEU: Bereich „Postfächer"
    +-- Liste der eingerichteten Postfächer
    |   +-- je Zeile: Name · Anbieterart · Zustand · zuletzt geprüft
    |   +-- Zustände: verbunden · noch nie geprüft · Zustimmung erforderlich · Fehler
    |   +-- Zeilenaktionen: Prüfen · Bearbeiten · Entfernen
    +-- „Postfach hinzufügen"
        +-- Schritt 1: Anbieterart wählen (eigener Host · Microsoft 365 · Gmail)
        +-- Schritt 2a (eigener Host): Host, Port, Verschlüsselung, Benutzer, Passwort
        +-- Schritt 2b (Microsoft/Gmail): Registrierungsdaten, dann Weiterleitung zur Zustimmung
        +-- Hinweisfeld: was diese Anbindung NOCH NICHT tut
```

Die Fläche liegt bewusst auf der **bestehenden** Konnektoren-Seite und nicht auf einer neuen: der
Mandanten-Administrator geht dorthin, um Fremdsysteme anzubinden. Eine zweite Seite für dieselbe
Denkfigur würde das Modell aufteilen.

### 3. Welche Informationen gespeichert werden

**Je Postfach:**
- ein vom Nutzer vergebener **Name** (damit später erkennbar ist, aus welchem Postfach eine Mail kam)
- die **Anbieterart**: eigener Host, Microsoft 365 oder Gmail
- bei eigenem Host: **Serveradresse, Port, Verschlüsselungsart, Benutzername**
- der **Zustand** samt Zeitpunkt der letzten Prüfung und, falls gescheitert, ein **Grund als
  Kennung** — nicht als Fehlertext des Anbieters
- die Zugehörigkeit zum **Mandanten**

**Getrennt davon, verschlüsselt:** das Passwort beziehungsweise die Zugriffs- und Erneuerungstoken.
Sie sind nach dem Speichern **nicht mehr lesbar** — auch nicht für die Administration, auch nicht
über die Schnittstelle. Zurückgegeben wird immer nur, *ob* etwas hinterlegt ist.

**Was ausdrücklich NICHT gespeichert wird:** keine Nachricht, kein Betreff, kein Absender, kein
Ordnerinhalt. Diese Slice legt Verbindungsdaten ab, sonst nichts.

### 4. Die fünf offenen Fragen — beantwortet

**Q1 — Wohin führt die Zustimmung zurück, und wie bleibt die Zuordnung fälschungssicher?**
Eine **feste Rückleitungsadresse je Umgebung**, weil Microsoft und Google die zulässigen Adressen
vorab registriert haben wollen; eine je Mandant wäre nicht eintragbar. Die Zuordnung reist in einem
**einmaligen, kurzlebigen Begleitwert**, der serverseitig hinterlegt und beim Rücklauf eingelöst und
verbraucht wird — dasselbe Verfahren, das PROJ-31 für externe Freigaben und PROJ-48 für Zugriffs-
kennungen bereits nutzt. Der Wert selbst trägt keine Bedeutung, ist also nicht manipulierbar.

**Q2 — Postfach je Mandant, je Projekt oder je Nutzer? → JE NUTZER.**
*(Am 2026-09-01 vom Nutzer korrigiert. Die Erstfassung sagte „je Mandant, ohne Projektbindung" — das
war falsch, und der Irrtum zog eine ganze Rechtediskussion nach sich, die sich damit erledigt.)*

**Jeder Nutzer bindet sein eigenes Postfach an.** Nicht der Mandant besitzt es, sondern die Person:
eine Projektleitung ihres, ein Mitglied seines. Zugriff live über IMAP. Abgeholte Mails legt der
jeweilige Nutzer in Projekten ab, in denen **er selbst Mitglied** ist.

**Damit löst sich die Rechtefrage auf, statt beantwortet zu werden.** Die Sorge der Erstfassung —
eine Projektleitung legt ein mandantenweites Postfach an und leitet fremde Korrespondenz in ihr
Projekt — ist gegenstandslos: niemand bindet ein fremdes Postfach an, sondern nur das eigene.

**Folge für die Ablage:** ein Postfach gehört einem **Nutzer** und einem Mandanten; die Sichtbarkeit
ist eigentümergebunden wie bei den Assistant-Entwürfen (PROJ-144) und den Chat-Unterhaltungen
(PROJ-151). Ein Nutzer kann mehrere Postfächer haben.

**Die Nebenbedingung ist am 2026-09-01 geklärt, und zwar strenger als meine Zwischenauslegung:**
die Vorgabe „der Admin sieht die Kommunikation" meint die **in Projekte abgelegten Mails**, nicht
die Postfächer. Abgelegte Mails laufen über die normale Projekt-Sichtbarkeit; das **Postfach selbst
ist ausschliesslich für seinen Eigentümer sichtbar**, auch vor der Mandanten-Administration. Damit
ist die Regel deckungsgleich mit PROJ-151 statt eine Ausnahme davon.

**Q3 — Wann wird das Token erneuert? → beim Zugriff, mit einem Wiederholungsversuch.**
Ein vorausschauender nächtlicher Lauf wäre besser für die Ehrlichkeit der Liste, braucht aber einen
Zeitplan-Eintrag, den diese Slice sonst nirgends benötigt. Er reitet auf dem Abhol-Lauf aus
PROJ-159 mit. **Der Preis ist zu nennen, nicht zu verschweigen:** zwischen zwei Prüfungen bleibt
eine widerrufene Zustimmung unsichtbar. Der Zustand *verbunden* bedeutet also „zuletzt geprüft
erfolgreich", nicht „gerade eben gültig" — und die Oberfläche muss den Zeitpunkt deshalb zeigen.

**Q4 — Eine Anwendungsregistrierung des Betreibers, oder je Mandant eine eigene? → je Mandant.**
Das ist die schwerste Frage, und sie folgt dem Hausmuster: bei den KI-Anbietern (PROJ-32, PROJ-92)
bringt **jeder Mandant seine eigenen Schlüssel** mit. Drei Gründe stützen das hier zusätzlich:

- Eine Registrierung des Betreibers macht ihn zum Zwischenglied in der Einwilligungskette **aller**
  Kunden — genau das, was das Produkt mit tenant-eigenen Schlüsseln sonst vermeidet.
- Googles lesende Postfach-Berechtigungen gehören zu den eingeschränkten Bereichen und verlangen
  für eine veröffentlichte Anwendung eine **Sicherheitsprüfung durch Google**. Eine
  mandanteneigene, interne Registrierung im eigenen Google-Projekt braucht sie nicht. Das ist ein
  Termin- und Kostenrisiko, das hier vollständig entfällt.
- Bei Microsoft ist ohnehin je Mandant eine Administrations-Zustimmung nötig.

**Der Preis ist ausdrücklich benannt:** der Kunde muss einmalig eine Anwendung in seinem eigenen
Microsoft- oder Google-Konto registrieren. Das ist mehr Einrichtungsarbeit, und die Anleitung dafür
gehört zur Slice.

**Q5 — Wie wird bewiesen, dass die Prüfung keine Nachricht liest?**
Auf drei Ebenen, weil eine allein nicht trägt: die Prüfung benutzt einen **eigenen, engen Weg**, der
die Nachrichten-Funktionen der Bibliothek gar nicht kennt; ein Test hält fest, dass diese Funktionen
während einer Prüfung **nie** aufgerufen werden; und in der Abnahme wird gegen ein echtes Postfach
geprüft, dass hinterher **keine Nachricht als gelesen markiert** ist. Ein Nachweis, der nur die
Oberfläche betrachtet, genügt hier nicht.

### 5. Technische Entscheidungen, in Alltagssprache begründet

**Ein Client für alle drei Anbieter statt drei Bibliotheken.** Microsoft 365 und Gmail sprechen
weiterhin dasselbe Mailprotokoll wie ein eigener Server — sie verlangen nur eine andere Art sich
auszuweisen. Die gewählte Bibliothek beherrscht beides. Drei Bibliotheken hätten dreimal dieselbe
Arbeit gemacht, und eine davon wöge allein rund 200 Megabyte.

**Die Bibliothek kommt aus demselben Haus wie die bereits eingebaute Mail-Verarbeitung.** Sechs
ihrer acht Abhängigkeiten liegen dadurch schon im Produktionsbaum; neu sind nur zwei kleine. Die
Alternativen scheiden nicht am Können aus, sondern an der Pflege — sie wurden zuletzt 2020 und 2021
veröffentlicht, was für eine Bibliothek, die Zugangsdaten über das Netz führt, nicht vertretbar ist.

**Passwörter gibt es nur noch für den eigenen Host.** Bei Microsoft und Google ist das keine
Entwurfsentscheidung, sondern Anbieterpolitik: dort werden Passwörter für diesen Zugriff seit 2025
beziehungsweise 2026 abgewiesen. Ein Passwortfeld für diese beiden anzubieten hieße, dem Nutzer
einen Weg zu zeigen, der sicher scheitert.

**Der Zustand eines Postfachs ist ein gespeichertes Prüfergebnis, keine Live-Aussage.** Das ist eine
bewusste Vereinfachung (siehe Q3) und wird in der Oberfläche durch den Zeitpunkt sichtbar gemacht,
statt eine Gewissheit vorzutäuschen.

### 6. Was wiederverwendet und was neu gebaut wird

| | |
|---|---|
| **Wiederverwendet** | Verschlüsselung der Geheimnisse · Mandantentrennung und Administrations-Gate · Änderungsprotokoll (PROJ-10) · Adressprüfung gegen interne Bereiche (Muster aus PROJ-115) · die bestehende Konnektoren-Seite als Ort · Mail-Verarbeitung (bereits im Baum) |
| **Neu** | die Postfach-Liste als eigene Ablage · verschlüsselter Eintrag je Postfach · Start und Rücklauf der Zustimmung · der enge Prüfweg · der Bereich in der Oberfläche |
| **Ausdrücklich nicht angefasst** | die sechs bestehenden Konnektoren und die Eindeutigkeit ihrer Zugangsdaten-Ablage |

### 7. Neue Abhängigkeiten

- **`imapflow`** — Mailprotokoll-Client, beherrscht Passwort und Token. MIT.
- Netto zwei weitere kleine Pakete, die er mitbringt (`pino`, `socks`), beide MIT.
- **Keine** Microsoft- oder Google-Bibliothek: die Zustimmung ist ein normaler Web-Ablauf, den das
  Produkt ohne zusätzliches Paket führen kann.

### 8. Ein Bestandsbefund am Rande, der nicht zu kopieren ist

Die vorhandene Konnektor-Prüfroute leitet den Mandanten aus der **ersten** Mitgliedschaft eines
Nutzers ab. Für einen Nutzer in mehreren Mandanten ist das nicht verlässlich — PROJ-55 hat genau
diese Klasse an anderer Stelle behoben. Die neuen Routen müssen den **aktiven** Mandanten benutzen;
die bestehende Route bleibt unangetastet und ist ein eigener Followup wert.

### 9. Risiken für `/qa`

1. Der Nachweis zu Q5 ist der Kern der Slice — eine Prüfung, die doch eine Nachricht anfasst, bricht
   die Zusage aus AC-158.15, die dem Nutzer vor dem Speichern gegeben wird.
2. Die Zuordnung beim Rücklauf der Zustimmung ist der sicherheitskritische Punkt: ein wiederverwend-
   barer oder ratbarer Begleitwert erlaubte, ein fremdes Postfach an den eigenen Mandanten zu binden.
3. Ein abgelaufenes Token darf **nicht** wie ein Anmeldefehler aussehen — sonst sucht die
   Administration den Fehler beim Passwort.
4. Mandantentrennung ist live zu belegen, nicht über die Oberfläche zu schließen.
5. Die Fehlerkennungen dürfen keine Zugangsdaten und keine internen Adressen tragen.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

## Backend-Implementierung α (2026-09-01)

**Umfang:** Datenschicht, Anwendungsschicht und Verbindungsprüfung für den **eigenen IMAP-Host**.
OAuth für Microsoft 365 und Gmail ist **Backend-β** — Nutzer-Entscheid, weil der Weg ohne
registrierte Anwendung im Kunden-Konto in **keiner Schicht** ausgeübt werden kann und ungeprüfter
Code genau das Muster ist, das PROJ-156 in derselben Woche gekostet hat.

### Was gebaut wurde

Migration `20260901100000_proj158_user_mailboxes` in Prod: eine Tabelle, **vier eigentümergebundene
Policies**, zwei Eindeutigkeiten, ein Vollständigkeits-CHECK, `extensions.moddatetime`.
Anwendungsschicht: drei Routen (`GET`/`POST /api/mailboxes`, `PATCH`/`DELETE …/[id]`,
`POST …/[id]/test`), drei Bibliotheken (Eingabeprüfung, Verbindungsprüfung, verschlüsselte Ablage),
**70 Tests**.

### Drei Entscheidungen, die eine Messung erzwungen hat

**1. Eigene Tabelle statt siebter Konnektor.** Begründet im Tech Design; hier nur die Zahl:
`tenant_secrets` hält je Mandant und Konnektor-Art genau einen Eintrag, sechs ausgelieferte
Konnektoren stehen auf diesem Vertrag. Wiederverwendet sind die **Ver- und
Entschlüsselungsfunktionen**, nicht die Tabelle — es entsteht kein zweites Verfahren.

**2. Kein Eintrag in die geteilten Audit-Register** — und das ist keine Bequemlichkeit, sondern
folgt aus AC-158.5b. `can_read_audit_entry` beginnt mit einem **Kurzschluss für
`is_tenant_admin`** und löst danach zu jedem Eintrag ein **Projekt** auf. Ein Postfach hat kein
Projekt, und der Kurzschluss hätte Name, Host und Benutzername jedes privaten Postfachs für die
Administration lesbar gemacht. **Ein privates Objekt in einen geteilten, administrations-lesbaren
Trail zu schreiben, hebt seine Privatheit auf.** AC-158.16 ist entsprechend korrigiert; Präzedenz
ist PROJ-144. Angenehme Nebenwirkung: der riskanteste Eingriff des Hauses — Anker-Ersetzung an drei
geteilten Funktionen — entfällt ganz.

**3. Keine Schreib-RPCs.** Die Regel lautet „nur die eigenen Zeilen"; dafür sind Policies das
richtige Mittel. `SECURITY DEFINER` nutzt das Haus für zusammengesetzte Rollenregeln
(PROJ-45-β), nicht für Eigentümerschaft — PROJ-144 kommt aus demselben Grund ohne aus.

### Die Zusage „liest keine Nachricht" ist eingelöst, nicht behauptet

AC-158.7 ist das Herz der Slice, weil die Fläche sie dem Nutzer **vor** dem Speichern gibt. Sie steht
auf drei Ebenen:

- **Strukturell** — `connection-test.ts` kennt vom Client nur `connect`, `list`, `logout`. Es wird
  **kein Ordner geöffnet**; `list` liest das Verzeichnis, `mailboxOpen` könnte je nach Server bereits
  Zustand verändern.
- **Im Test** — ein `Proxy`-Doppelgänger schreibt **jeden** Zugriff mit, auch auf Methoden, die es
  gar nicht geben dürfte. Nur so lässt sich belegen, dass etwas **nicht** aufgerufen wurde; eine
  Attrappe mit festen Methoden könnte das nicht. Die Verbotsliste lebt im Produktivcode, damit Test
  und Prüfling dieselbe benutzen.
- **Rot-Grün ausgeführt** — mit eingebautem `mailboxOpen` fallen **5 von 19** Fällen, darunter alle
  drei tragenden; per Dateikopie zurückgesetzt, wieder 19/19.

Offen bleibt die dritte Ebene aus dem Tech Design: der Lauf gegen ein **echtes** Postfach mit der
Gegenprobe, dass hinterher nichts als gelesen markiert ist. Das gehört in `/qa` und ist **kein**
erfülltes Kriterium.

### Live-Pentest gegen Prod — 16/16, 0 Rückstände

Zwei Blöcke, beide mit erzwungenem Rollback. Block 1 (9 Vektoren): Eigentümer sieht und ändert sein
Postfach; ein Fremder sieht **0**, ändert **0**, löscht **0**; Anlegen auf eine fremde `user_id`
→ `42501`; IMAP ohne Host → `23514`; doppelter Name → `23505`.

**Block 1 beweist allerdings die falsche Sache** — der „Fremde" war kein Mitglied dieses Mandanten,
die Isolation könnte also allein aus der Mandantentrennung folgen. Block 2 (7 Vektoren) schließt das:
ein **synthetisierter zweiter Nutzer als Administrator desselben Mandanten** (`W0` bestätigt
`is_tenant_admin` = true, `W0b` die Mitgliedschaft) sieht **kein** Postfach (`W1`/`W2` = 0), kann
nicht ändern und nicht löschen — **während der Eigentümer es sehr wohl sieht** (`W5` = 1). Ohne diese
Gegenprobe hätte `W1` nur belegt, dass die Tabelle für alle unsichtbar ist. Das ist der Nachweis für
AC-158.5b.

Die Migration bringt ihre eigene Post-Condition mit: sie scheitert laut, wenn eine Policy dieser
Tabelle je einen `is_tenant_admin`-Zweig bekommt.

### Ein eigener Messfehler, korrigiert

Die CIA-Vorlage und der erste Entwurf nannten **„netto zwei neue Pakete"** — gezählt waren nur die
**direkten** Abhängigkeiten. Nach der echten Installation: **586 → 602** aufgelöste Prod-Pfade, also
**16** neue Pakete, weil `pino` selbst elf mitbringt. **13 davon sind der Baum der
Logging-Bibliothek**, die die Anwendung wegen Sentry nicht braucht; der Client wird deshalb mit
`logger: false` erzeugt — das Paket bleibt trotzdem im Baum (Followup-Kandidat). `npm audit
--omit=dev`: **0 Vulnerabilities**.

### Wiederverwendet statt kopiert

Die Liste reservierter Adressbereiche kommt aus PROJ-115; die beiden Helfer sind dort **exportiert**
statt hierher kopiert worden (Verhalten unverändert, nur Sichtbarkeit). Eine zweite Liste wäre genau
die Drift, die das Haus an anderer Stelle beklagt. Bewusst **kein** DNS-Aufruf: ein Name kann
zwischen Prüfung und Verbindung auf eine andere Adresse zeigen — eine Auflösung hier wäre
Scheinsicherheit.

### Gates

vitest **4125/4125** (469 Dateien, +70) · tsc **11**, Baseline 13, **0 in einer Slice-Datei** (nach
`rm -rf .next`) · ESLint **0 Fehler** · Build clean mit **allen drei Routen** registriert ·
`audit:prod` 0 Vulnerabilities · alle **fünf** Datei-Wächter OK.

### Abweichungen und offene Punkte

- **D-158.1** — `microsoft365` und `gmail` sind in der Ablage bereits gültige Werte, werden in der
  Anwendungsschicht aber mit eigenem Grund (`provider_not_available_yet`, 422) abgewiesen. β
  entfernt nur diese Abweisung und braucht **keine** Schema-Änderung.
- **D-158.2** — kein Modul-Tor: es gibt keinen passenden `ModuleKey`, und einen einzuführen wäre ein
  Eingriff in `TOGGLEABLE_MODULES` für eine Slice, die ihn nicht braucht.
- **D-158.3** — kein Client-Wrapper und keine Oberfläche; beides gehört zu `/frontend`.
- **Offen für `/qa`:** der Lauf gegen ein echtes Postfach (AC-158.7 dritte Ebene, AC-158.8
  Fehlergründe an echten Servern) und ein angemeldeter Browser-Durchlauf. Beides ist **kein**
  erfülltes Kriterium, sondern ausstehender Nachweis.
