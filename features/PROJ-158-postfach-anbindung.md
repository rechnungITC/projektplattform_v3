# PROJ-158: Postfach-Anbindung (IMAP · Microsoft 365 · Gmail)

## Status: Approved
## Deployment Scope: —
**Created:** 2026-08-31
**Last Updated:** 2026-09-01

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

---

## Frontend-Implementierung α (2026-09-01)

Eine Fläche, ein Anlege-Dialog, eine Übersetzungsschicht. **Keine neue Route, keine Migration, kein
neues Paket** — die drei Backend-Routen aus dem Vortag werden bedient, sonst nichts.

### Der Ort ist gegen den Tech Design entschieden — gemessen, nicht bevorzugt

Das Tech Design sah die Fläche bei den Konnektoren. **Das ist nicht baubar, ohne AC-158.5 zu
brechen:** `global-sidebar.tsx:133` trägt für `/konnektoren` ein `adminOnly: true`. Ein Postfach ist
seit der Modell-Umkehr **nutzereigen** — jedes Mitglied bindet sein eigenes an —, hinter einem
Administrations-Gate wäre die Funktion für genau die Nutzer unsichtbar, für die sie gedacht ist.

Die Fläche liegt daher unter `/settings/postfaecher`, neben `/settings/profile`, das ebenfalls kein
`adminOnly` trägt. Erhoben statt vermutet: von den zehn Einträgen unter `SETTINGS_CHILDREN` sind
genau **zwei** ohne Administrations-Gate (Profil, Mitglieder) — die persönliche Ecke der
Einstellungen, und dort gehört ein privates Postfach hin.

### Was die Oberfläche entscheiden musste

**Der Zustand wird nie ohne seinen Zeitpunkt gezeigt.** „Verbunden" ist ein *gespeichertes
Prüfergebnis*, keine Live-Aussage (Tech Design Q3: zwischen zwei Prüfungen bleibt ein Widerruf
unsichtbar). Ein Abzeichen allein läse sich als Gewissheit, deshalb steht unter jedem Postfach
`zuletzt geprüft am …` bzw. `noch nie geprüft`. `describeLastCheck` fällt bei kaputtem Zeitstempel
auf „Prüfzeitpunkt unbekannt" zurück statt auf ein erfundenes Datum — testgepinnt.

**Die zwei OAuth-Anbieter stehen sichtbar zur Wahl, ausgegraut und erklärt.** Sie wegzulassen wäre
bequemer und falsch: der Nutzer soll wissen, dass für Microsoft 365 und Gmail **kein Passwort mehr
zulässig** ist (Erdungsbefund B-2 — Anbieterpolitik, keine Entscheidung dieses Produkts). Wer sie
wählt, bekommt den Grund und einen deaktivierten Speichern-Knopf statt einer stillen Absage.

**Die Zusage „liest keine Nachricht" steht auf der Fläche, nicht nur in der Spec** (AC-158.15) — und
zwar dauerhaft in der Liste, nicht nur im Anlege-Dialog, damit sie auch beim späteren Ansehen
sichtbar ist. Nach erfolgreicher Prüfung sagt die Meldung zusätzlich „Es wurde keine E-Mail
gelesen."

**Kennungen werden an genau einer Stelle zu Sätzen.** Die Routen geben stabile Codes zurück
(AC-158.9, damit kein Fremdtext mit Zugangsdaten durchsickert); `labels.ts` ist die einzige
Übersetzung. Zwei Kopien würden auseinanderlaufen — und die Meldung *ist* hier der Produktwert: sie
entscheidet, ob jemand stundenlang beim Passwort sucht, obwohl `mailbox_disabled` bedeutet, dass der
Zugang **beim Anbieter** abgeschaltet ist. Ein Test hält fest, dass dieser Fall einen anderen Text
und einen anderen nächsten Schritt trägt als `auth_failed`.

**Kein Zustand ohne nächsten Schritt** — außer „Verbunden", das braucht keinen. Testgepinnt über
alle sieben Zustände, damit ein achter nicht ohne Hinweis durchrutscht; `PROVIDER_LABELS` und
`SECURITY_LABELS` sind totale `Record`s, ein neuer Anbieter kompiliert also nicht, bis er einen Satz
hat (γ3-Muster aus PROJ-130).

### Nachweise

| Was | Ergebnis |
|---|---|
| Visual-Regression (angemeldet) | **9/9 grün** nach Neuaufnahme von zwei Baselines |
| Übersetzungsschicht `labels.test.ts` | 8 Fälle |
| Volle Vitest-Suite | **4133/4133** in 470 Dateien |
| ESLint | 0 |
| `tsc` | 11 = Baseline, **0 in Slice-Dateien** |
| Build | clean, `ƒ /settings/postfaecher` registriert |
| `check:index-scope` · `check:token-drift` | je 0 Fehler |

**Die zwei Baselines sind begründet neu aufgenommen, nicht stillschweigend erneuert.** `settings` und
`settings-tenant` wurden rot, weil die Sidebar auf **jeder** angemeldeten Seite sitzt. Vor der
Neuaufnahme geprüft: Bildhöhe unverändert (868 px bzw. 4603 px), Abweichung 3059 bzw. 3084 Pixel —
auf beiden Seiten nahezu gleich, wie es eine geteilte Navigationszeile erzeugt; im Bild kontrolliert,
dass **ausschließlich** „Postfächer" zwischen „Profil" und „Workspace" hinzugekommen ist. Aufnahme
per Löschen der Dateien statt `--update-snapshots`, das unter der Toleranz ein stiller No-op ist
(PROJ-Y-143d/143g-Lehre). Eigener Messfehler dabei festgehalten: meine erste Pixel-Auswertung des
Diff-Bildes meldete „0 Abweichungen", weil ich die PNG-Zeilenfilter nicht rückgängig gemacht hatte —
die Zahlen stammen daher aus Playwrights eigener Meldung.

### Abweichungen

- **D-158.FE.1** Ort `/settings/postfaecher` statt `/konnektoren` — begründet oben, `adminOnly`
  gemessen.
- **D-158.FE.2** Kein Komponententest der Liste selbst; belegt sind die reine Übersetzungsschicht
  (8 Fälle) und die Routen (Backend). Ein Test, der `fetch` wegmockt und dann prüft, dass ein
  Abzeichen erscheint, hätte wenig belegt — der echte Nachweis ist der angemeldete Durchlauf, und
  der steht in `/qa` aus.
- **D-158.FE.3** Kein angemeldeter Browser-Durchlauf in diesem Schritt und **keine echte
  Verbindungsprüfung** — dafür braucht es ein echtes Postfach (dritte Nachweis-Ebene zu AC-158.7,
  Fehlergründe aus AC-158.8). Ausdrücklich **kein erfülltes Kriterium**, sondern offen für `/qa`.

---

## QA Test Results (2026-09-01)

**Stand nach PROJ-Y-158a: 0 Critical / 0 High / 3 Medium / 1 Low / 1 Info → `Approved`.**
Der einzige High-Befund (**F-2**, Verbindungsprüfung strukturell unerreichbar) ist geschlossen —
Nachweise im Abschnitt *PROJ-Y-158a behoben* am Ende dieser Datei. Die vier davon abhängigen
Kriterien (158.7–158.10) sind in der Tabelle unten nachgezogen, der ursprüngliche Stand bleibt
jeweils daneben stehen.

*Verdikt des Durchgangs selbst (vor dem Fix):* **0 Critical / 1 High / 3 Medium / 1 Low / 1 Info —
NICHT produktionsreif**, Status blieb `In Review`.

Der Durchgang hat den Kern geschlossen, den `/backend` und `/frontend` ausdrücklich offen gelassen
hatten — den **angemeldeten Browser-Durchlauf** —, und dabei einen Defekt gefunden, der die halbe
Slice betrifft.

### Akzeptanzkriterien

| AC | Ergebnis | Nachweis |
|---|---|---|
| 158.1 drei Anbieter | ✅ | E2E Fall 2: alle drei in der Auswahl, keiner erfunden |
| 158.2 Passwort nie wieder lesbar | ✅ | E2E Fall 3: die Antwort auf das Anlegen enthält weder das Passwort noch das Wort `credential`; Pentest B3 belegt, dass es gespeichert *ist* |
| 158.3 kein Passwortfeld für M365/Gmail | ✅ | E2E Fall 2: beide `aria-disabled`, mit Begründung |
| 158.4 ein Verschlüsselungsverfahren | ✅ | Pentest B3 (101 Byte PGP-Paket in der Spalte), erzeugt über `encrypt_tenant_secret_with_key` |
| 158.5 jeder verwaltet sein eigenes | ✅ | Pentest B1/B2 + E2E Fall 4 |
| **158.5b nur der Eigentümer sieht es** | ✅ | **Pentest B4–B8 unter einem ECHTEN Mandanten-Administrator** (B0 belegt vorab, dass er wirklich Admin ist) **+ E2E Fall 4 in beide Richtungen** |
| 158.6 mehrere Postfächer je Nutzer | ✅ | Pentest D2 (Name je Nutzer eindeutig), D1 (dieselbe Kennung zweimal abgewiesen) |
| **158.7 Prüfung liest nur Ordnernamen** | ✅ *(nach PROJ-Y-158a)* | strukturell (nur `connect`/`list`/`logout`, kein `mailboxOpen`) + `Proxy`-Doppelgänger; **dritte Ebene offen** — kein Lauf gegen ein echtes Postfach, Zugangsdaten fehlen. — *Vorher (F-2):* strukturell unerreichbar, die Prüfung kam nie beim Anbieter an |
| **158.8 Ergebnis mit Grund** | ✅ *(nach PROJ-Y-158a)* | E2E Fall 5 fährt eine **echte** Prüfung gegen einen RFC-2606-Host: `result: "unreachable"`, Zustand und Zeitpunkt gespeichert. — *Vorher (F-2):* Zeitpunkt und Zustand korrekt, ein *Prüfergebnis* konnte nicht entstehen |
| 158.9 kein roher Fehlertext | ✅ *(nach PROJ-Y-158a)* | E2E Fall 5: Grund als **stabile Kennung** statt Systemtext, Passwort nirgends in der Antwort. — *Vorher:* nicht ausübbar, solange 158.7 nicht lief |
| 158.10 Zeitgrenze | ✅ *(nach PROJ-Y-158a)* | `MAILBOX_CHECK_TIMEOUT_MS = 15_000` in `connection-test.ts`, Absage als benannter Zustand `timeout` statt Dauerzustand. — *Vorher:* nicht ausübbar (dieselbe Ursache) |
| 158.11–158.14 | — | OAuth, ausdrücklich **β** |
| 158.15 Zusage vor dem Speichern | ✅ | E2E Fall 1: der Satz steht dauerhaft in der Liste, nicht nur im Dialog |
| 158.16 kein geteilter Audit-Trail | ✅ | Pentest A4/A5: weder im `entity_type`-CHECK noch in `_tracked_audit_columns` |
| **158.17 Sichtbarkeit/Aufbewahrung vor PROJ-159** | ❌ **F-4** | die Spec benennt es nirgends — die einzige Fundstelle ist das Kriterium selbst |
| 158.18 Mandantentrennung | ✅ | Pentest C1 (42501), live gegen Prod |
| 158.19 SSRF-Härtung | ✅ | 32 Fälle in `validation.test.ts`; Bereichsliste aus PROJ-115 **importiert, nicht kopiert** |
| **158.20 anon kann nichts** | ⚠️ **F-3** | Routen: E2E 5/5 exakt 307. Datenbank: `anon` hält 7 Tabellenrechte, davon **TRUNCATE, das RLS umgeht** |
| **158.21 nur zwei neue Pakete** | ⚠️ **F-5** | `audit:prod` 0 Vulnerabilities ✅, aber die Zahl stimmt nicht: gemessen **16** statt 2 |

### Befunde

**F-1 (Medium, in `/qa` behoben) — der Pentest existierte nicht als Datei.**
`/backend` meldete „Live-Pentest 16/16 gegen Prod", ohne den Lauf zu hinterlassen. Genau die Klasse,
die das INDEX bei **PROJ-102** selbst als Defekt führt („die dokumentierten 6/6 stammen aus einem
Ad-hoc-Lauf und sind nicht reproduzierbar"). Geschrieben als
`tests/sql/PROJ-158-user-mailboxes-pentest.sql`, **28 Vektoren, 26 PASS / 2 FAIL** gegen Prod, 0
Rückstände, Rollback erzwungen.

**F-2 (High, offen) — die Verbindungsprüfung ist in Produktion strukturell unerreichbar.**
`decryptMailboxCredential` ruft `decrypt_tenant_secret_with_key` mit dem Parameter `p_payload`. Die
Funktion in Prod nimmt aber **`p_secret_id uuid`** — sie holt den Chiffretext **selbst** aus
`tenant_secrets`. Live gemessen statt aus der Signatur gefolgert: der Aufruf in genau der Form, die
die Anwendung macht, meldet **`42883 function … does not exist`**; die Gegenprobe mit der echten
Signatur läuft. Es gibt **eine** Überladung, und **keine** der vier Entschlüsselungsfunktionen des
Hauses nimmt einen übergebenen Chiffretext — die Ver-/Entschlüsselungs-Paarung ist **asymmetrisch**
(`encrypt_*` gibt einen Chiffretext zurück, `decrypt_*` liest ihn aus einer bestimmten Tabelle).
Damit endet **jede** Prüfung mit `503 credential_unavailable`, und deren Meldung („Bitte erneut
speichern.") schickt den Nutzer auf einen Weg, der nichts hilft.

*Warum es keine Ebene vorher gefangen hat:* `route.test.ts:75` setzt
`mocks.supabase.rpc.mockResolvedValue({ data: "CHIFFRE", error: null })` — die RPC ist mit einem
**erfundenen** Rückgabewert gemockt, ein Signaturfehler ist dort unsichtbar. Der Pentest prüft die
Datenbankschicht, nicht den Aufruf. Dieselbe Klasse wie PROJ-151 (`content_md`/`markdown_content`),
PROJ-Y-151b (mehrdeutige Einbettung) und PROJ-Y-151d (Bibliothek ohne Aufrufer).
Kein Sicherheitsbefund (fail-closed), aber die zweite Hälfte der Slice — „hinterlegen **und
prüfen**" — funktioniert nicht. Als `test.fail()` in `tests/PROJ-158-mailboxes.spec.ts` Fall 5
festgehalten: der Fall beschreibt den **Soll**-Zustand und schlägt an, sobald jemand ihn behebt,
statt den Defekt einzufrieren.

**F-3 (Medium, vorbestehende Klasse) — `anon` kann `TRUNCATE`.**
Gemessen, nicht behauptet: Lesen, Schreiben, Ändern und Löschen sind für `anon` **zu** — die Policy
ist gar nicht auswertbar (`42501` auf `is_tenant_member`, die PROJ-Y-130q-Härtung). `TRUNCATE`
wertet aber **keine** Policy aus und **gelingt** (Vektor E5, die Sondenzeile war danach weg). Über
die Produktfläche nicht erreichbar, weil PostgREST kein TRUNCATE-Verb hat — dieselbe Einordnung wie
**PROJ-Y-80e**. Gegen die Geschwister gemessen: `user_mailboxes` hat exakt dieselben 7 Rechte wie
`assistant_work_item_drafts` (PROJ-144, das namentliche Vorbild) und `construction_photos`, ist also
**Hausbestand**. Aber `document_summaries` (PROJ-80) ist strenger — dort hat `anon` **nichts**. Die
Slice hätte dem strengeren Vorbild folgen können; zwei `revoke`-Zeilen.

**F-4 (Medium, offen) — AC-158.17 ist nicht eingelöst, und es sperrt die nächste Slice.**
Das Kriterium verpflichtet **die Spec**, vor PROJ-159 zu benennen, wer abgeholte Mails sehen darf
und wie lange nicht zugewiesene bleiben — „ohne diese Festlegung darf PROJ-159 nicht beginnen".
Gemessen: die einzige Fundstelle für Aufbewahrung im ganzen Dokument ist das Kriterium selbst. Es
ist damit nicht bloß unerfüllt, sondern eine **Vorbedingung für die unmittelbar folgende Slice**.

**F-5 (Low, offen) — AC-158.21 nennt eine falsche Zahl.**
Es sagt, `pino` und `socks` seien „die **einzigen** neuen Abhängigkeiten". `/backend` hat selbst
gemessen und korrigiert: es sind **16** (586 → 602 Prod-Pfade), 13 davon der Logger-Baum, den die
Anwendung wegen Sentry nicht braucht (der Client läuft mit `logger: false`). Die Korrektur steht in
der Implementierungsnotiz, das **Kriterium** trägt den falschen Wortlaut weiter — dieselbe
Buchführungs-Klasse, die PROJ-45 als D-45β-DEPLOY-1 festgehalten hat. Die Sicherheitshälfte ist
grün: `npm audit --omit=dev` **0 Vulnerabilities**.

**F-6 (Info) — `SECRETS_ENCRYPTION_KEY` fehlt lokal, in Prod ist er gesetzt.**
Ohne ihn antwortet das Anlegen mit `503 encryption_unavailable` — fail-closed und mit klarer Meldung,
also richtiges Verhalten. Dass Prod ihn hat, ist **gemessen statt gefolgert**: 12 echte
(nicht-`stub`) erfolgreiche KI-Läufe in 14 Tagen, letzter OpenAI-Lauf 2026-08-28 — jeder davon
entschlüsselt ein Mandanten-Geheimnis mit derselben Variable.

### Nachweise

- **Live-Pentest** `tests/sql/PROJ-158-user-mailboxes-pentest.sql` — **26 PASS / 2 FAIL** gegen Prod,
  **0 Rückstände**, Rollback erzwungen. Tragend ist **B0**: er prüft *zuerst*, dass der zweite Akteur
  wirklich Mandanten-Administrator ist, und bricht sonst ab — ohne ihn wären B4–B8 falsch-grün und
  belegten nur die Mandantentrennung, die es auch ohne diese Slice gäbe.
- **E2E** `tests/PROJ-158-mailboxes.spec.ts` — **10/10 chromium, dreimal hintereinander stabil**,
  danach 0 Rückstände. Fall 4 ist der Kern: zwei angemeldete Sitzungen, Administrator und einfaches
  Mitglied, **mit Gegenprobe in beide Richtungen** — ohne die zweite Hälfte („das Mitglied sieht sein
  eigenes sehr wohl") bewiese der Fall nur eine kaputte Liste.
- **Regression** Visual-Regression **9/9 ohne Neuaufnahme**, PROJ-144 und PROJ-151 grün (13/13
  zusammen) — die beiden Geschwister mit derselben Eigentümer-Bindung.
- **Gates** vitest **4133/4133** in 470 Dateien · ESLint 0 · tsc 11 = Baseline, **0 in Slice-Dateien**
  · `audit:prod` 0 Vulnerabilities · index-scope, token-drift, register-consistency je 0.

### Eigene Prüf-Fehler, festgehalten statt weggelassen

Fünf Anläufe, bis der E2E-Durchlauf stand — **jedes Mal war das Produkt richtig und mein Test falsch**:
`getByLabel("Name")` trifft auch „Benutzername" (Teilstring); die Leck-Zusicherung verbot
`mailbox`, das im Rumpf nur als **Eingabe des Aufrufers** in `?next=` steht (dieselbe Falle wie in
PROJ-151); `getByText("Noch nicht geprüft")` trifft Abzeichen **und** Erfolgsmeldung;
`getByRole("listitem")` trifft die **16 Navigationseinträge** der Seitenleiste; und der Wart-Helfer
wartete auf die **Abwesenheit** des Ladezustands — die ist erfüllt, *bevor* React gerendert hat,
womit er null Zeilen zählte und nichts aufräumte (die PROJ-Y-143b-Falle eine Ebene tiefer). Jetzt
wartet er auf ein **positives** Signal. Zusätzlich sind Bezeichner je Lauf eindeutig, weil sonst ein
Playwright-Wiederholungslauf an der Vorarbeit seines eigenen ersten Versuchs mit 409 scheitert — was
wie ein Produktfehler aussieht und keiner ist. Und das Aufräumen wird jetzt **zugesichert** statt nur
ausgeführt: ein ungeprüftes Teardown ist genau die blinde Stelle aus PROJ-Y-143o.

**Nebenbefund ohne Bezug zu dieser Slice:** ein Mandant `[E2E] Gantt Test` ist während des Laufs
entstanden (07:19 UTC) — von einer parallelen Spur (PROJ-Y-155a), nicht von dieser QA. Geprüft statt
als eigener Rückstand gebucht.

### Abweichungen

- **D-158.QA.1** Kein Lauf gegen ein **echtes** Postfach. Er wäre auch sinnlos, solange F-2 offen ist
  — die Prüfung erreicht den Anbieter nicht. Nach dem Fix nachzuholen (Zugangsdaten fehlen).
- **D-158.QA.2** AC-158.9/.10 sind **nicht ausübbar**, nicht „erfüllt". So gebucht.
- **D-158.QA.3** Mobile Safari umgebungsbedingt übersprungen (PROJ-67/F2).

---

## PROJ-Y-158a behoben (2026-09-01) — die Verbindungsprüfung erreicht den Anbieter

Der QA-Befund F-2 ist geschlossen. Migration
`20260901120000_projy158a_mailbox_credential_decrypt` in Prod, eine Funktion, keine neue Tabelle,
kein neues Paket.

### Warum die Wiederverwendung nie möglich war — gemessen, nicht vermutet

Der Fix ist **nicht** „Parametername korrigiert". Die Ursache liegt tiefer, und sie erklärt zugleich,
warum die Vorfassung überhaupt so entstehen konnte:

- `encrypt_tenant_secret(payload)` ist **rein** — nur `pgp_sym_encrypt`, keine Tabelle. Genau deshalb
  war die Verschlüsselung wiederverwendbar, und genau deshalb sah die Gegenrichtung so aus, als
  müsste sie es auch sein.
- `decrypt_tenant_secret(p_secret_id)` liest die Zeile aus `tenant_secrets` **und prüft
  `is_tenant_admin`**. Die Entschlüsselung trägt also die **Berechtigungsregel der Konnektoren** mit.

Für ein nutzereigenes Postfach ist diese Regel in **beide** Richtungen falsch: der Eigentümer ist oft
ein einfaches Mitglied und damit **kein** Admin (er käme nicht an sein eigenes Passwort), und die
Mandanten-Administration darf ein fremdes Postfach gerade **nicht** lesen (AC-158.5b). Die
Asymmetrie war also kein Versehen des Hauses, sondern der eingebaute Zugriffsschutz — und die
Konnektor-Funktion war für Postfächer nie brauchbar.

### `SECURITY INVOKER`, und das ist die eigentliche Entscheidung

`decrypt_user_mailbox_credential(p_mailbox_id uuid, p_key text)` liest `user_mailboxes` im
Rechtekontext des Aufrufers. Damit entscheiden die **vier Policies aus PROJ-158** — es gibt **keine
zweite Berechtigungsstelle**. Eine `DEFINER`-Fassung müsste `user_id = auth.uid()` erneut hinschreiben
und wäre eine zweite Wahrheit, die von der Policy abdriften kann; dasselbe Argument, mit dem
PROJ-116/131/132 ihre Auswertungen als INVOKER bauen. Eine Post-Condition in der Migration scheitert
laut, sollte die Funktion je auf `DEFINER` wechseln.

**Nebenertrag:** die Kennung wird übergeben, nicht der Chiffretext — der verlässt die Datenbank jetzt
gar nicht mehr. Vorher las die Route ihn nach Node, nur um ihn wieder hineinzureichen.

### Nachweise

**Live-Pentest Block F, 6/6 PASS gegen Prod, 0 Rückstände.** Zwei Vektoren tragen:

- **F1** ruft die Funktion mit **genau den Parameternamen, die die Anwendung sendet**, und bekommt
  `s3hr-geheim` zurück. Das ist der Vektor, der den Defekt gefunden hat.
- **F3** ist der Nachweis der **Entwurfsentscheidung**, nicht nur des Fixes: der Mandanten-
  Administrator desselben Mandanten bekommt `P0002 not_found`. Mit `DEFINER` wäre hier das Passwort
  eines fremden Postfachs herausgekommen.
- F2 falscher Schlüssel → `39000`, kein stiller Rückgabewert · F4 leerer Schlüssel → `P0001` ·
  F5 `anon` → `42501` · F0 die Funktion ist nachweislich INVOKER.

**E2E Fall 5 ist von `test.fail()` zur echten Zusicherung geworden** und fährt eine **echte**
Verbindungsprüfung durch `imapflow` gegen einen Host, der nach RFC 2606 garantiert nirgends auflöst:
`result: "unreachable"`, Zustand und Zeitpunkt gespeichert, Grund als stabile Kennung statt
Systemtext, Passwort nirgends in der Antwort. **10/10 chromium, dreimal stabil.**

**Rot-Grün beidseitig ausgeführt** (zurückgesetzt per Dateikopie, nicht `git checkout`): mit der alten
Signatur fällt E2E-Fall 5 **und** 2 der 9 Signatur-Pins; danach wieder alles grün.

**Der Schutz gegen die Wiederholung besteht aus zwei Hälften**, und keine trägt allein:
`src/lib/mailboxes/credentials.test.ts` nagelt fest, **was die Anwendung sendet** (RPC-Name und die
exakte Menge der Parameternamen) — ob die Datenbank es annimmt, kann ein Mock grundsätzlich nicht
sagen; genau daran ist der Defekt vorbeigekommen. Die andere Hälfte ist Pentest-Vektor F1. Beide
verweisen im Kommentar aufeinander.

### Was dabei sonst korrigiert wurde

Die 503-Meldung riet in **jedem** Fehlerfall zum erneuten Speichern — bei „Zeile nicht sichtbar" ein
Rat, der nichts bewirkt. `decryptMailboxCredential` unterscheidet jetzt vier Gründe, und die Route
bildet sie getrennt ab: `not_found` → **404**, „kein Geheimnis hinterlegt" → **422** (erneut speichern
hilft wirklich), fehlender Serverschlüssel → **503**, sonstiger Fehlschlag → **503**.

### Gates

vitest **4142/4142** in 471 Dateien (+9) · ESLint 0 · tsc 11 = Baseline, **0 in Slice-Dateien** ·
Build clean mit allen vier Flächen · migration-naming 0 · index-scope, token-drift,
register-consistency je 0 · **Funktions-Inventar 301 → 307 aufgefrischt**.

**Nach dem Nachziehen auf `main` (`1ec7b20`, bringt PROJ-155-β.1 und PROJ-Y-45r mit) erneut
gemessen statt übernommen:** vitest **4178/4178** in 474 Dateien · ESLint **0 errors** (die 4
Warnungen stammen aus `router-work-items-from-intent.skill-boundary.test.ts`, also PROJ-153, und
stehen unverändert auch auf `main`) · tsc **11 = Baseline**, keiner in einer Slice-Datei — die
erste Messung meldete irreführend **2**, das ist die `.next`-Falle aus PROJ-Y-143e, nach
`rm -rf .next` sind es 11 · Build clean, alle vier Flächen im Manifest (`/api/mailboxes`,
`/api/mailboxes/[id]`, `/api/mailboxes/[id]/test`, `/settings/postfaecher`) · alle vier
Datei-Wächter OK. Der Merge von `main` lief **konfliktfrei**, auch an der Visual-Baseline
`settings-tenant-chromium-linux.png`, die diese Slice mitbringt.

**Zum Inventar gesagt statt stillschweigend:** von den sechs neuen Zeilen stammt **eine** aus dieser
Slice. Die anderen fünf sind Nachtrag fremder Spuren, deren Auffrischung ausgeblieben war —
`accept_work_items_from_intent_bulk`/`_undo` (PROJ-153) und die drei `enforce_chat_*_consistency`
(PROJ-Y-151a). Alle fünf werden von Migrationsdateien im Repo angelegt; es fehlt nichts, es war nur
nicht nachgetragen. Verschwunden ist keine — genau der sichtbare Diff, für den PROJ-Y-148e das
Inventar gebaut hat.

### Offen

**AC-158.7 ist damit erfüllt, aber die dritte Nachweis-Ebene fehlt weiter:** die Zusage „liest keine
Nachricht" ist strukturell (nur `connect`/`list`/`logout`, kein `mailboxOpen`) und im Test über einen
`Proxy`-Doppelgänger belegt, **nicht** gegen ein echtes Postfach, in dem hinterher nachweislich nichts
als gelesen markiert ist. Dafür fehlen weiterhin Zugangsdaten. Die übrigen offenen Befunde bleiben:
**PROJ-Y-158b** (AC-158.17, Vorbedingung für PROJ-159), **PROJ-Y-158c** (`anon`-TRUNCATE),
**PROJ-Y-158d** (Paketzahl).

**Neue Lücke benannt, mit gemessener Instanz:** das Funktions-Inventar aus PROJ-Y-148e führt nur
**Namen**, keine Signaturen — sein Wächter hätte eine *fehlende* Funktion gefangen, aber nicht die
*falsch gerufene* aus F-2. Registriert als **PROJ-Y-158e**.
