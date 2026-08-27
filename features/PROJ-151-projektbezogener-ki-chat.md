# PROJ-151: Projektbezogener KI-Chat

## Status: Deployed
## Deployment Scope: mvp
**Created:** 2026-08-27
**Last Updated:** 2026-08-27

## Herkunft

Aus dem CIA-Review vom 2026-08-27 zur Frage, wie die externe KI-Chat-Plattform **U-Know**
(`U-Know/`, 518 Dateien / 122.891 Zeilen, 41 Tabellen, eigenes Backend auf Cloud Run, Vertex AI)
nach V3 kommt. Verdikt: **Variante A — Nachbau auf V3-Primitiven**, U-Know dient ausschließlich
als fachliche Vorlage. **Es wird keine Zeile Code übernommen.**

Tragender Grund: V3 besitzt fünf der sechs Bausteine bereits — AI-Router mit sechs Providern
(PROJ-12/32/85/92/93), Skill-Framework (PROJ-76/77), DMS (PROJ-79), Audit-Trail (PROJ-130),
Kostendeckel (PROJ-32d). Was fehlt, ist **die Konversation selbst**. `PROJ-13`s `chat-panel.tsx`
(130 Zeilen) ist Mensch-zu-Mensch-Projektchat, kein LLM-Dialog.

Die Migrationsvariante wurde **nicht** aus Lizenzgründen verworfen — der Eigner hat die
Berechtigung bestätigt —, sondern wegen sechs Invarianten-Brüchen und 120–200 PT bei
weitgehender Zweitimplementierung. U-Knows Autorisierung läuft über `is_admin_user(auth.uid())`
(Nutzer/Admin-Achse) statt über Mandanten, es ist ein **Static Export** ohne serverseitige
Route-Handler — also ohne die Schicht, in der V3 seine Zusagen einlöst.

## Dependencies

- **Requires** PROJ-1 (Auth/Tenants/RLS-Helfer) — Mandantentrennung
- **Requires** PROJ-2 (Projekte) — Projektbezug jeder Unterhaltung
- **Requires** PROJ-12/32/85/92/93 (AI-Router, Provider, Class-3-Gate, Cost-Caps) — der Chat
  bringt **kein** eigenes Routing mit
- **Requires** PROJ-76/77 (Skill-Framework) — Skill-Kontext
- **Requires** PROJ-137 (`reason_code`) — erklärbare Absagen
- **Berührt** PROJ-37–41 (Assistant) — offene Architekturfrage, siehe unten
- **Unabhängig von** PROJ-80-β (Retrieval) — ausdrücklich, siehe L6

## Nutzer-Locks (bindend für /architecture)

- **L1 — Nur im Projektraum.** Ein Reiter je Projekt, keine globale Chatfläche. Der Projektkontext
  ist der Unterschied zu einem beliebigen Chatfenster, und die Rechte hängen sauber am Projekt.
- **L2 — Unterhaltungen sind privat je Nutzer.** Auch Projektleitung und Mandanten-Administration
  sehen fremde Unterhaltungen nicht. Muster: PROJ-144-Entwürfe (dort pentest-belegt).
- **L3 — Class-3: klassifizieren, warnen, Nutzer entscheidet.** Der Text wird klassifiziert; bei
  Verdacht erscheint **vor** dem Senden ein Hinweis. Gesendet wird über das bestehende Tor —
  Class-3 geht an Ollama bzw. attestiertes Azure, nie an ein externes Modell. Die Warnung ist ein
  Hinweis, kein Riegel.
- **L4 — V3s Skill-Begriff gilt.** U-Know nennt etwas „Skills", das nicht PROJ-76/77 ist. Zwei
  Skill-Begriffe im selben Produkt wären der Fehler. Der Chat nutzt **ausschließlich** V3-Skills.
- **L5 — Der Chat ist rein lesend.** Er schlägt nichts vor, das automatisch Geschäftsdaten ändert
  (Invariante #2). Mutierende Aktionen bleiben dem Assistant-Track (PROJ-39/144) vorbehalten.
- **L6 — Kein pgvector, kein Retrieval.** Bleibt PROJ-80-β. Ein Chat ohne Retrieval ist nutzbar;
  Retrieval ohne Chat ist es nicht. Vorziehen wäre falsch, weil das DMS in Prod leer ist.
- **L7 — Kein Vertex/Gemini.** Nur die sechs registrierten V3-Provider.
- **L8 — Keine Anhänge, keine Bots, keine Bewertungen/Freigaben/Gamification.**

## User Stories

1. Als **Projektleitung** möchte ich im Projektraum eine Frage zu meinem Projekt stellen und eine
   Antwort erhalten, die Projekt, Phase und offene Arbeitspakete kennt, damit ich nicht erst
   Kontext zusammensuchen muss.
2. Als **Projektmitglied** möchte ich, dass meine Unterhaltungen privat bleiben, damit ich auch
   unfertige Gedanken formulieren kann.
3. Als **Projektleitung** möchte ich, dass die für mein Projekt aktiven Skills die Antwort prägen,
   damit sie zur Methode und zum Projekttyp passt statt generisch zu sein.
4. Als **Nutzer** möchte ich gewarnt werden, bevor ich personenbezogene Daten sende, damit ich
   selbst entscheiden kann — und nicht nachträglich feststelle, dass etwas hinausging.
5. Als **Nutzer** möchte ich eine benannte Vorlage auswählen können, damit ich nicht bei jedem Mal
   dieselbe Frage neu formulieren muss.
6. Als **Nutzer** möchte ich meine Unterhaltungen in Ordnern ablegen, damit lange Verläufe
   auffindbar bleiben.
7. Als **Mandanten-Administration** möchte ich sehen, was ein Modell je Million Token kostet,
   damit der Kostendeckel eine Zahl in Geld hat und nicht nur ein Limit.
8. Als **Nutzer** möchte ich bei einer leeren Antwort den Grund lesen, damit ich weiß, ob kein
   Anbieter hinterlegt ist, der Deckel erreicht wurde oder Class-3 gegriffen hat.

## Acceptance Criteria

### Kern — Unterhaltung

- [ ] **AC-151.1** Im Projektraum existiert ein Reiter, über den eine Unterhaltung geführt werden
      kann. Er erscheint **nur** bei aktivem Modul und für Projektmitglieder.
- [ ] **AC-151.2** Eine Frage erzeugt eine Antwort des über den bestehenden Router gewählten
      Anbieters. Der Chat enthält **keinen** eigenen Anbieter-Code.
- [ ] **AC-151.3** Verlauf und Antworten überleben einen Seiten-Neuaufbau.
- [ ] **AC-151.4** Eine Unterhaltung ist **ausschließlich** für ihren Ersteller sichtbar — auch
      nicht für Projektleitung oder Mandanten-Administration (L2). Live-Pentest-pflichtig.
- [ ] **AC-151.5** Keine Zeile ist über Mandantengrenzen sichtbar.
- [ ] **AC-151.6** Die Antwort berücksichtigt Projektname, -typ, -methode, Phasen und offene
      Arbeitspakete — ohne Retrieval, allein aus dem, was V3 ohnehin weiß.
- [ ] **AC-151.7** Der Chat ändert **keine** Geschäftsdaten (L5). Nachweis: keine schreibende
      Route wird aus dem Chat-Pfad erreicht.

### Klassifizierung und Transparenz

- [ ] **AC-151.8** Jede Eingabe wird klassifiziert. Bei Class-3 wählt der bestehende Resolver
      Ollama bzw. attestiertes Azure; **nie** ein externes Modell.
- [ ] **AC-151.9** Vor dem Senden erscheint bei Class-3-Verdacht ein Hinweis, der das Senden
      **nicht** verhindert (L3).
- [ ] **AC-151.10** Die Warnung erzeugt bei gewöhnlichen deutschen Projekttexten **keinen**
      Daueralarm. Nachweis gegen echte Prod-Excerpts, nicht gegen erfundene Beispiele
      (PROJ-86-Lehre: dort galt jedes deutsche Großschreib-Bigramm als Name, 9/9 Prod-Läufe
      fälschlich Class-3).
- [ ] **AC-151.11** Bleibt eine Antwort leer, nennt die Oberfläche den Grund aus dem
      `reason_code` (PROJ-137) statt einer leeren Fläche.
- [ ] **AC-151.12** Jeder Aufruf erzeugt einen `ki_runs`-Eintrag und unterliegt dem Kostendeckel.
- [ ] **AC-151.13** Der neue Zweck ist für **alle** Cloud-Provider implementiert, nicht nur den
      getesteten — sonst fällt der Router still auf den leeren Stub zurück (PROJ-85). Nachweis
      über die datengetriebene Capability-Matrix.

### Skill-Kontext

- [ ] **AC-151.14** Die dem Projekt zugeordneten **aktiven** Skills (PROJ-76/78) prägen die
      Antwort.
- [ ] **AC-151.15** Ein Skill wirkt als **Zusatzanweisung**, nicht als vollständiger Ersatz des
      Prompts — sonst könnte eine Skill-Änderung die Zusicherungen dieser Slice aushebeln
      (PROJ-80-α-Muster).
- [ ] **AC-151.16** Ohne zugeordnete Skills funktioniert der Chat unverändert.
- [ ] **AC-151.17** Die Oberfläche benennt, welche Skills gewirkt haben.

### Vorlagen, Ordner, Preise

- [ ] **AC-151.18** Mandantenweite Prompt-Vorlagen sind pflegbar (Administration) und im Chat
      auswählbar.
- [ ] **AC-151.19** Eine Vorlage lässt sich als Favorit markieren; Favoriten stehen oben.
- [ ] **AC-151.20** Unterhaltungen lassen sich Ordnern zuordnen; ohne Ordner bleiben sie
      erreichbar.
- [ ] **AC-151.21** Je Modell sind Preise je Million Token (Eingabe/Ausgabe, Währung) pflegbar.
- [ ] **AC-151.22** Bei hinterlegtem Preis werden die Kosten einer Unterhaltung beziffert; ohne
      Preis wird das **gesagt** statt 0 € zu behaupten.
- [ ] **AC-151.23** Denk-Token („Thinking") zählen als Ausgabe (U-Know-Vorlage, F-5).

### Härtung

- [ ] **AC-151H.1** Live-Pentest gegen Prod: Fremder Nutzer sieht 0 Zeilen · fremder Mandant 0 ·
      `anon` ohne Rechte · kein Schreibweg an den Funktionen vorbei. 0 Rückstände.
- [ ] **AC-151H.2** Der neue Zweck steht in `ki_runs` **und** `tenant_ai_cost_caps` im Lockstep
      derselben Migration — ein fehlender CHECK-Wert antwortet in Prod mit 5xx.
- [ ] **AC-151H.3** Nicht-Leerlauf-Kontrolle: ein Test belegt, dass ohne Skill-Kontext eine
      **andere** Antwortvorgabe entsteht — sonst prüft AC-151.14 nur, dass etwas lief.
- [ ] **AC-151H.4** Der Verlauf unterliegt der Aufbewahrungs- und Redaktionsschicht aus PROJ-40
      oder einer ausdrücklich begründeten eigenen — **nicht** stillschweigend gar keiner.
- [ ] **AC-151H.5** Beim Löschen eines Projekts ist geklärt und geprüft, was mit Unterhaltungen
      geschieht (PROJ-Y-148a: append-only Inseln blockieren den Hard-Delete).

## Edge Cases

1. **Kein Anbieter hinterlegt** → benannte Absage (`no_provider`), keine leere Fläche.
2. **Class-3 und kein Ollama erreichbar** → Absage mit Grund `class3_blocked`; auf keinen Fall
   Ausweichen auf ein externes Modell.
3. **Kostendeckel erreicht** → `cost_cap_exceeded`, Verlauf bleibt lesbar.
4. **Anbieter antwortet nicht** → `provider_error`; die Frage bleibt erhalten und ist wiederholbar.
5. **Sehr langer Verlauf** → Kontext wird begrenzt; die Begrenzung wird **gesagt**, nicht still
   abgeschnitten.
6. **Projekt wird weich gelöscht** → Unterhaltungen verschwinden aus der Fläche, gehen nicht verloren.
7. **Projekt wird endgültig gelöscht** → AC-151H.5.
8. **Nutzer verlässt das Projekt** → Zugriff endet; die Zeilen bleiben seine (L2).
9. **Skill wird während einer Unterhaltung deaktiviert** → wirkt ab der nächsten Frage, ändert
   Vergangenes nicht.
10. **Vorlage wird gelöscht, während jemand sie nutzt** → die bereits eingefügte Frage bleibt.
11. **Modellpreis fehlt** → „nicht bezifferbar", kein 0-€-Trugschluss (AC-151.22).
12. **Zwei Fenster, dieselbe Unterhaltung** → kein Verlust; letzte Antwort gewinnt oder wird als
    Konflikt benannt.
13. **Fehlalarm der Class-3-Warnung** → der Nutzer kann senden (L3); Häufigkeit ist messbar
    (AC-151.10).

## Offene Fragen für /architecture

- **Q1 — Neue Tabellen oder `assistant_sessions`/`assistant_turns` erweitern?** PROJ-37–41 führt
  bereits `tenant_id`, `project_id`, `user_id`, `input_text`, `response_text`, `input_redacted`
  und mit PROJ-40 eine Governance-Schicht. Dagegen: `recognized_intent`, `confirmation_state`,
  `result_status` sind `NOT NULL` und für einen LLM-Dialog bedeutungslos; der Assistant ist
  **bewusst regelbasiert** (PROJ-144-L3). CLAUDE.md verlangt die Prüfung, bevor Neues modelliert
  wird — sie ist hier ausdrücklich zu führen und zu begründen, nicht zu überspringen.
- **Q2 — Redaktion/Aufbewahrung** (AC-151H.4): PROJ-40 wiederverwenden oder eigene? Vorsicht:
  PROJ-Y-130r hat gemessen, dass die Class-3-Redaktion heute nur `stakeholders` in nur einer
  Fläche abdeckt.
- **Q3 — Verhalten beim Hard-Delete** (AC-151H.5).
- **Q4 — Wie werden Skills in den Prompt eingebettet**, ohne dass eine Skill-Änderung die
  Zusicherungen aushebelt (AC-151.15)?

## Aus U-Know übernommen — als Anforderung, nicht als Code

Konzepte, kein Ausdruck: Vorlagen-Struktur (Vorlage → aktivierbar → favorisierbar) · Preistabelle
je Modell samt der Regel, dass Denk-Token als Ausgabe zählen · Konversations-Ordner ·
Auto-Zusammenfassung langer Verläufe (**nicht** in dieser Slice) · die Beobachtung, dass „Bot" und
„Skill" dasselbe Primitiv mit unterschiedlichem Geltungsbereich sind (validiert PROJ-82 vorab).

**Ausdrücklich nicht übernommen:** Gamification, Changelog, Feedback-Sammlung, Ankündigungen,
Bewertungen, Freigaben — Einfirmen-Binnenbetrieb, in einem Mehrmandanten-SaaS ein anderes Produkt.

**Offener Punkt:** Die Vorlagen-**Inhalte** liegen nicht im Code. `chat_prompt_templates` ist eine
leere Tabelle; in allen 92 Migrationen stehen **0 geseedete Zeilen**. Die Bibliothek ist
Betriebsdatenbestand der Uhrig-Instanz — ihre Übernahme wäre ein Datenexport durch den Eigner.
Diese Slice liefert die **Struktur**; die Inhalte sind nicht Teil der Zusage.

## Für PROJ-80-β vorgemerkt (nicht diese Slice)

U-Knows Retrieval-Parameter sind gemessen und gehören in den ohnehin CIA-pflichtigen β-Pass:
`vector(768)`, HNSW `m=16 / ef_construction=64`, **Hybrid** aus Vektor und `tsvector`, HyDE,
Rerank, dazu ein Retrieval-Protokoll (`hyde_used`, `chunks_retrieved`, `chunks_after_rerank`,
`top_similarity`, `search_type`). **Offener Fork dabei:** 768 ist die Vertex-Embedding-Größe, und
**Anthropic — V3s Primärmodell-Anbieter — hat gar kein Embedding-Modell.** PROJ-80-β braucht eine
eigene Embedding-Provider-Entscheidung.

## Technical Requirements

- Keine neue Laufzeit-Abhängigkeit ohne CIA-Vorgang
- Keine neue Betriebsplattform (kein Cloud Run, kein Firebase)
- Mandantentrennung über die Haus-Helfer (`is_tenant_member` / `has_tenant_role` / `is_tenant_admin`)
- Schreibwege über Funktionen, Auswertungen `SECURITY INVOKER` (Aggregat-Leck-Regel)
- Antwort strömend, damit lange Antworten nicht als Hänger erscheinen

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

_Erstellt 2026-08-27. Alle vier offenen Fragen sind **gegen den gemessenen Stand** entschieden,
nicht gegen die Vermutung der Anforderungen. Zwei Messungen haben den Entwurf verändert._

### Q1 — Eigene Ablage statt Erweiterung des Assistenten

**Entscheidung: zwei neue Tabellen.** Die Anforderungen hielten das für offen, weil der Assistent
(PROJ-37–41) bereits Mandant, Projekt, Nutzer, Eingabe- und Antworttext führt. Die Prüfung hat
zwei Gegenargumente entkräftet und drei tragende gefunden.

**Entkräftet:** die Wertelisten wären *kein* Hindernis — der Assistent kennt bereits die Ergebnisse
„erfolgreich", „blockiert", „fehlgeschlagen", und seine Absichtsspalte ist freier Text ohne feste
Werteliste. Diese Sorge aus den Anforderungen trägt nicht.

**Tragend ist etwas anderes:**

1. **Das Zeilenmodell passt nicht.** Beim Assistenten ist *eine* Zeile ein vollständiger Zug aus
   Frage **und** Antwort. Ein Chat braucht einzelne Nachrichten mit einer Rolle, weil eine Antwort
   während des Schreibens erscheint und weil auf eine Frage mehrere Antwortteile folgen können.
   Das ist kein Feld, das fehlt, sondern eine andere Form.
2. **Vier Pflichtfelder ohne Vorbelegung** (Art der Eingabe, erkannte Absicht, Bestätigungsstand,
   Ergebnis) müssten mit Platzhaltern gefüllt werden, die für ein Gespräch nichts bedeuten. Wer
   später den Trail liest, sähe erfundene Werte.
3. **Der Assistent ist bewusst regelbasiert** — PROJ-144 hat das ausdrücklich festgelegt, um
   Sprachmodell-Abhängigkeit und Class-3-Konflikte zu vermeiden. Einen Sprachmodell-Dialog in
   dieselbe Ablage zu legen, vermischt zwei Konzepte, die getrennt entschieden wurden.

Fehlen würden ohnehin: Titel einer Unterhaltung, Ordnerzuordnung, Token-Zählung für die Kosten und
der Bezug zum Lauf-Protokoll.

**Vom Assistenten übernommen wird trotzdem viel** — als Muster, nicht als Tabelle: seine
Sichtbarkeitsregel („nur eigene Zeilen", genau zwei Regeln) erfüllt Lock L2 wörtlich und wird
gespiegelt; seine Bereinigungsfunktion wird wiederverwendet (siehe Q2).

### Q2 — Bereinigung wiederverwenden, Aufbewahrung eigenständig

**Entscheidung: die Bereinigungsfunktion aus PROJ-40 wird wiederverwendet, die
Aufbewahrungs-Einstellung nicht.**

Der Grund ist gemessen: **alle sechs Mandanten — auch der Produktivmandant — stehen auf
„nur Metadaten speichern".** Beim Assistenten heißt das: kein Text wird abgelegt. Erbt der Chat
diese Einstellung wörtlich, ist **der Verlauf im Produktivmandanten am ersten Tag leer** — und
damit das Feature unbrauchbar. Das ist dieselbe Klasse Fehler wie PROJ-86 (Fehlalarm des
Klassifizierers → null Vorschläge) und PROJ-137 (stiller Rückfall auf den leeren Ersatz).

Die Einstellung ist auch sachlich für etwas anderes gemacht: sie regelt **Sprachtranskripte** des
Assistenten — mitgeschnittene Rede. Ein Chat-Verlauf ist bewusst getippt, und der Nutzer erwartet,
dass er bleibt; das ist der Zweck der Fläche.

Deshalb: eine **eigene** Aufbewahrungs-Einstellung für den Chat, standardmäßig „Verlauf
speichern", mandantenweit abschaltbar. Wer sie abschaltet, sieht das in der Fläche — der Chat
funktioniert weiter, nur ohne Verlauf. Die Bereinigung (E-Mail- und Telefonnummern-Ersetzung,
Längenkappung) kommt unverändert aus PROJ-40, damit es **keine zweite Regelliste** gibt, die
auseinanderdriftet.

### Q3 — Der Verlauf hängt am Projekt und blockiert das Löschen nicht

**Entscheidung: Unterhaltungen verschwinden mit dem Projekt, ohne Unveränderlichkeits-Wächter.**

Der Assistent löst das anders — bei ihm bleibt der Zug erhalten und verliert nur den Projektbezug.
Das ist dort richtig, weil eine Assistenz-Anfrage auch ohne Projekt sinnvoll ist. Ein
**projektbezogener** Chat-Verlauf ohne sein Projekt ist es nicht: übrig bliebe Text ohne Bezug.

Ausschlaggebend ist die Erfahrung aus PROJ-Y-148a: append-only Inseln, die am Projekt hängen,
machen das endgültige Löschen unmöglich — vier Projekte im Papierkorb sind bis heute nicht
löschbar. Der Chat-Verlauf ist **kein** Nachweisdokument (der Assistent protokolliert seine
Aktionen getrennt, und der Chat ändert per Lock L5 ohnehin nichts). Er bekommt daher **keinen**
Unveränderlichkeits-Wächter und wird beim Löschen mitentfernt. Damit entsteht kein neuer Blocker
der Klasse, die PROJ-148 gerade beseitigt hat.

### Q4 — Skills ergänzen die Anweisung, sie ersetzen sie nicht

**Entscheidung: der Grundauftrag steht im Code, ein Skill wird als Zusatz angehängt.**

Das ist das Muster aus PROJ-80-α: dort ist der Zusammenfasser ein gewöhnlicher Skill, sein Inhalt
aber ausdrücklich **Zusatzanweisung**. Sonst könnte eine Skill-Änderung die Zusicherungen dieser
Slice aushebeln — etwa die Regel, dass der Chat nichts verändert, oder die Sprache der Antwort.
Der Grundauftrag ist damit nicht durch Datenpflege überschreibbar. Welche Skills gewirkt haben,
zeigt die Fläche (AC-151.17); ohne zugeordnete Skills arbeitet der Chat unverändert.

### Aufbau der Fläche

```
Projektraum
+-- Reiter „KI-Chat"  (nur bei aktivem Modul, nur für Projektmitglieder)
    +-- Seitenspalte
    |   +-- Ordnerliste
    |   +-- Unterhaltungen (nur eigene) + „Neue Unterhaltung"
    +-- Gesprächsfläche
    |   +-- Nachrichten (Frage / Antwort, Antwort erscheint im Schreiben)
    |   +-- Hinweis „diese Skills wirken"
    |   +-- Grund-Hinweis bei leerer Antwort (kein Anbieter / Deckel / Class-3)
    +-- Eingabe
    |   +-- Vorlagen-Auswahl (Favoriten zuerst)
    |   +-- Textfeld + Senden
    |   +-- Class-3-Warnung  (erscheint vor dem Senden, verhindert es nicht)
    +-- Fußzeile: Kosten dieser Unterhaltung (oder „nicht bezifferbar")

Stammdaten (Administration)
+-- „Prompt-Vorlagen"      Pflege, mandantenweit
+-- „Modellpreise"         Preis je Million Token, Eingabe/Ausgabe, Währung
```

### Datenmodell in Worten

**Unterhaltung** — gehört einem Mandanten, einem Projekt und **einem Nutzer**; hat einen Titel
(aus der ersten Frage abgeleitet, änderbar), optional einen Ordner, Zeitstempel. Sichtbar
ausschließlich für ihren Eigentümer.

**Nachricht** — gehört zu einer Unterhaltung; Rolle (Frage oder Antwort), Text, Zeitpunkt, dazu
die verbrauchten Token je Richtung und der Bezug zum Lauf-Protokoll, damit Kosten und Grund einer
leeren Antwort nachvollziehbar sind.

**Ordner** — Name je Nutzer und Projekt; rein zur Ablage.

**Vorlage** — mandantenweit, Titel und Text, aktiv/inaktiv, je Nutzer als Favorit markierbar.

**Modellpreis** — Anbieter, Modell, Preis je Million Token für Eingabe und Ausgabe, Währung.
Denk-Token zählen als Ausgabe. Wo kein Preis hinterlegt ist, wird das gesagt statt null Euro
zu behaupten.

### Technische Entscheidungen, kurz begründet

| Entscheidung | Warum |
|---|---|
| Kein eigener Anbieter-Code | Der Router besteht; ein zweiter Pfad würde Kostendeckel, Begründungscode und die Anbieter-Abdeckung an dieser Fläche unwirksam machen |
| Neuer Zweck im Router | Erbt Klassifizierung, Schlüsselauflösung, Class-3-Tor, Deckel und Begründungscode automatisch |
| Zweck in **beiden** Wertelisten derselben Migration | Ein fehlender Eintrag antwortet in Produktion mit einem Serverfehler — in diesem Haus mehrfach passiert |
| Alle Cloud-Anbieter, nicht nur der getestete | Sonst fällt der Router still auf den leeren Ersatz zurück, ununterscheidbar von „nichts gefunden" |
| Schreiben nur über Funktionen, Auswertungen mit Aufrufer-Rechten | Hausregel gegen Zusammenfassungen, die an der Zugriffsregel vorbei zählen |
| Antwort im Schreiben anzeigen | Ohne das wirkt eine lange Antwort wie ein Hänger |
| Titel aus der ersten Frage | Ohne Titel ist eine Liste von Unterhaltungen unbenutzbar; ein Pflichtfeld vor der ersten Frage wäre eine Hürde |

### Keine neuen Abhängigkeiten

Kein neues Paket, keine neue Betriebsplattform. Markdown-Darstellung und Virtualisierung langer
Listen sind im Bestand vorhanden.

### Risiken für /qa

1. **Die Class-3-Warnung als Daueralarm** (AC-151.10) — gegen echte Projekttexte prüfen, nicht
   gegen erfundene. PROJ-86 ist der Präzedenzfall.
2. **Skill-Wirkung nur scheinbar geprüft** (AC-151H.3) — ein Test muss belegen, dass *ohne* Skill
   eine andere Anweisung entsteht.
3. **Anbieter-Abdeckung** — die datengetriebene Matrix muss den neuen Zweck erfassen; eine
   handgepflegte Liste bliebe grün und bewiese nichts (PROJ-80-α-Fund).
4. **Kosten ohne Preis** — „nicht bezifferbar" statt 0 €.
5. **Aufbewahrung abgeschaltet** — der Chat muss weiter funktionieren und es sagen.
6. **Löschen des Projekts** — Nachweis, dass Unterhaltungen mitgehen und **nicht** blockieren.

### Reihenfolge

`/backend` zuerst — die Fläche ist ohne Ablage und Router-Zweck nicht sinnvoll baubar
(PROJ-109/144-Präzedenz), danach `/frontend`, dann `/qa`.

### Kein CIA-Pass nötig

Der Zuschnitt **ist** das Ergebnis des CIA-Reviews vom 2026-08-27. Keine neue Abhängigkeit, keine
neue Plattform, kein Eingriff in eine geteilte Funktion. Die vier Entscheidungen folgen
etablierten Hausmustern (PROJ-80-α, PROJ-40, PROJ-144, PROJ-Y-148a).

## Implementation Notes (/backend, 2026-08-27)

**Geliefert — der Kern läuft.**

*Datenschicht (2 Migrationen in Prod):*
`20260827110000` — sechs Tabellen (`ai_chat_conversations`, `ai_chat_messages`, `ai_chat_folders`,
`ai_chat_prompt_templates`, `ai_chat_prompt_favorites`, `ai_model_prices`), RLS überall aktiv, 19
Policies, Indizes, `extensions.moddatetime` schema-qualifiziert. Post-Conditions prüfen RLS,
Policy-Existenz, **die Abwesenheit jedes Admin-Zweigs** auf den drei privaten Tabellen (L2
strukturell) und `ON DELETE CASCADE` auf dem Projekt (Q3).
`20260827111000` — Zweck `project_chat` im **Lockstep** in `ki_runs` *und* `tenant_ai_cost_caps`,
Anker whitespace-tolerant mit Treffer-Eindeutigkeit, Post-Verifikation je Tabelle plus
Clobber-Kontrolle über sechs Geschwister-Werte, dazu eine **Verhaltensprobe** (der Zweck wird
angenommen, ein erfundener abgelehnt) in zurückgerollter Unter-Transaktion.

*Anwendungsschicht:* `AIPurpose` erweitert · geteilter Runner `project-chat-runner.ts`
(`generateText` statt `generateObject` — eine Gesprächsantwort hat kein Schema) · **alle sechs
Provider** implementieren `generateProjectChat` · Klassifizierer (inhaltsbasiert, **kein**
Class-3-Pin) · Kontext-Sammler (Projekt, Phasen, offene Arbeitspakete, Verlauf — ohne Retrieval,
Lock L6) · Skill-Lader (Zusatzanweisung, Q4) · Router-Funktion `invokeProjectChat` · ModuleKey
`ai_chat` · zwei Routen (Unterhaltungen, Nachrichten).

**Drei Wächter haben unterwegs angeschlagen und ihre Arbeit getan:**
die datengetriebene Capability-Matrix (`project_chat` fehlte → Kompilierfehler, genau der
PROJ-85-Schutz), `MODULE_LABELS` als erschöpfender Record, und der Bestandstest, der die
Modulliste festnagelt (Erwartung **nachgezogen**, nicht abgeschwächt).

**Zwei bewusste Abweichungen vom Bestandsmuster, beide begründet:**
1. **Kein Ersatztext bei Anbieterfehler.** `invokeNarrativeGeneration` setzt einen Stub-Text ein,
   damit der Aufrufer nie eine leere Erzählung sieht. Für einen Chat wäre das falsch — eine
   erfundene Gesprächsantwort ist von einer echten nicht zu unterscheiden. Hier bleibt der Text
   leer, der Grund steht im `reason_code` (AC-151.11).
2. **Schreibwege über Policies statt Funktionen.** Präzedenz PROJ-144 (vier Policies für privates
   Nutzer-Scratch). Funktionen nutzt das Haus, wo komplexe Rollenregeln zu prüfen sind; hier
   lautet die Regel „eigene Zeilen", und dafür ist eine Policy klarer als eine RPC. Der
   Pentest-Vektor lautet entsprechend „kein Schreibweg auf fremde Zeilen" statt „kein Weg an den
   Funktionen vorbei".

**Live-Pentest gegen Prod, 0 Rückstände** (`tests/sql/PROJ-151-chat-rls-pentest.sql`), Rollback
erzwungen. **Der erste Lauf war unvollständig und der eigene Kontrollvektor hat es aufgedeckt:**
der zufällig gewählte Zweitnutzer war *kein* Admin, womit nur „irgendjemand sieht nichts" belegt
gewesen wäre statt L2. Zweiter Lauf mit synthetisiertem Admin:

| Vektor | Ergebnis |
|---|---|
| V1 Eigentümer sieht seine Unterhaltung | PASS |
| **V4 der andere ist nachweislich Admin** | **JA** |
| **V2/V3 dieser Admin sieht Unterhaltung und Nachrichten NICHT** | **PASS** |
| V8 derselbe Admin erreicht die Admin-Tabelle | PASS (Regel greift gezielt, nicht pauschal) |
| V5 kein Schreiben auf fremde Zeilen | PASS (42501) |
| V6 `anon` | PASS (42501 — strenger als nötig, Muster PROJ-144/D-144.2) |
| V7 kein append-only-Wächter (Q3) | PASS |

Nebenbefund: `tenant_memberships.user_id` verweist auf `profiles`, nicht `auth.users`.

**Gates:** ESLint **0** · tsc **13 = Baseline / 0 neu** (nach `rm -rf .next`) · vitest
**3832/3832** · Build clean, beide Routen registriert · migration-naming 0 · index-scope 0 ·
Capability-Matrix 45/45 · Routentests 9/9.

### Nachtrag — Nebenflächen fertiggestellt (2026-08-27)

**Fünf weitere Routen**, alle im Build registriert: Ordner (AC-151.20) · Prompt-Vorlagen mit
Favoriten-Sortierung (AC-151.18/.19) · Favorit setzen/entfernen · Modellpreise (AC-151.21) ·
Class-3-Vorprüfung (AC-151.9).

**Kostenberechnung** (`chat-cost.ts`, AC-151.22/.23): reine Funktionen, ohne Datenbank testbar.
Denk-Token zählen als Ausgabe. Fehlt ein Preis, wird das **gesagt** — `{known: false}` statt einer
Null, die von „kostet nichts" nicht zu unterscheiden wäre. Währungen werden nicht vermischt:
abweichende zählen als unbeziffert, ein Umrechner gehört nicht in diese Slice. **7 Tests.**

**Aufbewahrung** (`chat-retention.ts`, AC-151H.4): eigene Einstellung mit Default „speichern",
Bereinigung unverändert aus PROJ-40. Ein Test pinnt ausdrücklich, dass die
**Assistenten-Einstellung nicht geerbt wird** — genau der Wert, der bei allen sechs Mandanten
steht und den Verlauf sonst am ersten Tag geleert hätte. In der Nachrichten-Route verdrahtet: der
Anbieter bekommt immer den vollen Text, die Einstellung regelt nur, was gespeichert wird; bei
`none` wandert die aktuelle Frage trotzdem in den Kontext, sonst antwortete das Modell auf eine
leere Zeile. Die Route meldet den Zustand zurück, damit die Fläche ihn **sagen** kann. **7 Tests.**

**AC-151H.3 Nicht-Leerlauf-Kontrolle** (5 Tests): belegt, dass *ohne* Skill eine **andere**
Anweisung entsteht — und dass ein Skill die Grundregeln nicht verdrängt, weil er den
System-Prompt gar nicht erreicht (Q4). Zusätzlich gepinnt: die Kürzung des Verlaufs wird genannt
statt verschwiegen, und die wahre Gesamtzahl der Arbeitspakete erscheint auch bei gekappter Liste.

**Live-Pentest Block 2 — 7/7 PASS, 0 Rückstände.** Hier lautet die Regel „lesen jeder, schreiben
nur die Administration", also musste ein **Nicht-Admin** synthetisiert werden; `W0` prüft das
ausdrücklich, statt es anzunehmen — in Prod ist jedes Mitglied Admin, und ein Lauf unter Admin
wäre falsch-grün gewesen. Belegt: Mitglied liest aktive Vorlagen und Preise, darf aber weder
Vorlagen anlegen (42501) noch Preise pflegen (42501); Favoriten gehen für sich selbst, nicht für
andere (42501).

**Gates nach dem Nachtrag:** ESLint 0 · tsc 13 = Baseline / 0 neu · vitest **3851/3851** ·
Build clean mit **sieben** Routen · migration-naming 0 · index-scope 0.

### Der Schema-Drift-Wächter hat drei echte Fehler gefunden

Der Check war nach dem Nachtrag **rot** — und zwar zu Recht. Drei Spaltennamen waren falsch, alle
drei hätten **still** versagt:

1. **`tenant_settings.ai_chat_settings` existierte nicht.** Ich habe die Spalte gelesen, ohne sie
   anzulegen. Wirkung wäre gewesen: die Abfrage liefert nichts, die Aufbewahrung steht immer auf
   dem Default — ohne dass irgendwo etwas rot wird. Behoben mit Migration `20260827120000`
   (eigene Spalte, wie jedes andere Modul sie hat).
2. **`skill_versions.markdown_content` heißt nicht `content_md`.** Das ist der gravierendste:
   der Skill-Lader hätte in Prod **nie einen Skill angewendet** — das Feld wäre `undefined`, der
   Längenfilter hätte jeden Skill verworfen, und der Chat wäre stillschweigend ohne Skill-Kontext
   gelaufen. Meine eigenen Tests hätten das **nicht** gefangen: AC-151H.3 prüft den Prompt-Bauer,
   nicht den Lader.
3. **`phases.sequence_number` heißt nicht `position`.** Diesen fand der Wächter gar nicht — er
   prüft `.select()`-Spalten, keine `.order()`-Argumente. Aufgefallen, weil ich nach dem ersten
   Fund **alle** gelesenen Spalten gegen das Schema geprüft habe statt nur die gemeldete.

Danach live gegengeprüft: alle fünf Abfragen des Kontext-Sammlers und des Skill-Laders laufen
gegen das echte Schema, inklusive einer real vorhandenen Skill-Fassung.

Das ist der Ertrag von PROJ-42: drei Fehler, die weder Kompilierung noch Testlauf noch Build
gezeigt hätten.

### Weiterhin offen

- **AC-151.10** Fehlalarm-Nachweis der Class-3-Warnung gegen echte Projekttexte. Die Prüfung ist
  verdrahtet, aber wie oft sie bei gewöhnlichem Deutsch anschlägt, ist **nicht gemessen** — und
  genau das ist die Frage (PROJ-86: dort galt jedes Großschreib-Bigramm als Name).
- Kein echter Anbieter-Durchlauf: wie bei PROJ-88/89 abhängig von erreichbarem Ollama bzw. einem
  Cloud-Schlüssel.
- Keine Oberfläche — das ist `/frontend`.

## Implementation Notes (/frontend, 2026-08-27)

**Geliefert:** Projektraum-Reiter „KI-Chat" (`/projects/[id]/ki-chat`), Nav-Sektion mit
`requiresModule: "ai_chat"` und **ohne** `requiresProjectType` (CORE für alle Projekttypen),
Seitenspalte mit eigenen Unterhaltungen, Gesprächsfläche, Eingabe mit Vorlagen-Auswahl
(Favoriten mit ★ zuerst), Class-3-Warnung, Grund-Hinweis, Skill-Anzeige, Aufbewahrungs-Hinweis.
Client-Wrapper, Hook nach Hausmuster (`{data, loading, error, refresh, …mutators}`, `let cancelled`).

**Drei Entscheidungen, die die Oberfläche treffen musste:**

1. **L2 wird ausgesprochen, nicht nur eingehalten.** Über der Liste steht „Nur für dich sichtbar —
   auch nicht für die Projektleitung". Ohne diesen Satz weiß niemand, dass er frei formulieren
   kann; die Regel allein nützt nur, wenn man ihr traut.
2. **Die Class-3-Warnung lässt den Senden-Knopf aktiv.** Das ist der ganze Unterschied zwischen
   Hinweis und Riegel (L3) — und war eine ausdrückliche Nutzer-Entscheidung. Die Prüfung läuft
   verzögert (600 ms) und erst ab 12 Zeichen: bei jedem Tastendruck zu prüfen wäre Dauerfeuer und
   ein flackernder Hinweis.
3. **Nach dem Senden wird der Verlauf neu geladen, nicht angehängt.** Bei abgeschalteter
   Aufbewahrung steht in der Datenbank etwas anderes als im Browser — angehängt wäre die Anzeige
   eine Behauptung über den gespeicherten Zustand. Die Antwort wird dann einmalig separat gezeigt,
   mit dem Hinweis, dass sie nicht bleibt.

**Ein Lint-Fund, der den Entwurf verbessert hat:** `react-hooks/set-state-in-effect` beanstandete
das synchrone Zurücksetzen der Warnung im Effekt. Statt es zu unterdrücken, wird der Anzeige-
Zustand jetzt beim Rendern **abgeleitet** — dadurch verschwindet die Warnung beim Löschen des
Textes sofort statt einen Wimpernschlag später.

**Ein eigener Testfehler, gefunden und behoben:** meine erste Auth-Gate-Zusicherung verbot das
Wort „conversation" im Antwortrumpf — die Umleitung trägt aber die Ziel-Adresse als
`weiter=`-Parameter, und darin steht der Pfad. Das ist die Eingabe des Aufrufers, kein Leck.
Geprüft wird jetzt, dass nichts JSON-Artiges zurückkommt. Nebenbei aufgefallen: die Anmeldung
liegt seit PROJ-Y-143m unter `/anmelden`, nicht `/login`.

**Nachweise:** Playwright **10/10** chromium — alle neun Routen plus die Seite, jeweils auf
**exakt 307** (nicht „irgendein Umleitungsstatus": PROJ-45-β hatte eine Zusicherung, die vier
Werte erlaubte, wo genau einer auftritt) und ohne Datenrumpf. Reason-Notice-Tests 5/5, davon einer
in der Gegenrichtung (bei echter Antwort **kein** Hinweis — sonst wäre ein Hinweis auf jeder
Antwort ebenfalls grün). Gates: ESLint **0** · tsc **13 = Baseline / 0 neu** · vitest
**3860/3860** · Build clean mit der Seite registriert · index-scope 0.

**Abweichung D-151.1 — Visual-Regression nicht aussagekräftig:** die authentifizierte
Visual-Suite schlägt mit **9 Fehlschlägen** fehl, aber **identisch auf unverändertem `main`**
(Kontrollexperiment gefahren). Ursache ist die abgelaufene Anmeldung des Visual-Nutzers
(`page.evaluate` bekommt HTML statt JSON), nicht die neue Nav-Sektion. Ob die Sektion Baselines
bewegt, ist damit **nicht gemessen** — das gehört in `/qa` mit gültiger Fixture.

## QA Test Results (2026-08-27)

**Verdikt: 0 Critical · 0 High · 1 Medium · 1 Low → PRODUCTION-READY**, mit zwei ausdrücklich
nicht gemessenen Punkten (siehe unten). Status → **Approved**.

### Der wichtigste offene Punkt ist geschlossen: AC-151.10 ist gemessen

Die Fehlalarmquote der Class-3-Warnung wurde gegen **echte Texte aus der Produktionsdatenbank**
bestimmt — Projektbeschreibungen, Arbeitspaket-Titel und Risiken des Kundenmandanten, wörtlich
entnommen, nicht erfunden. Genau daran ist PROJ-86 gescheitert.

| Korpus | Fehlalarme |
|---|---|
| 25 echte Prod-Texte („MS Dynamics", „DSGVO-Prüfung", „ISO 27001 Informationssicherheits-Check" …) | **0** |
| 6 typische Chat-Fragen | **0** |

**Und die Gegenrichtung ist mitgeprüft:** bei einer E-Mail-Adresse und einer Telefonnummer schlägt
der Detektor sehr wohl an. Ohne diese Hälfte wäre der Test auch mit einem kaputten Detektor grün —
ein Detektor, der nie anschlägt, hat ebenfalls null Fehlalarme.

Zusätzlich gepinnt: die Klassifizierung liest den **gesamten** Verlauf, nicht nur die letzte
Nachricht (wer im dritten Satz eine Telefonnummer nennt, darf nicht dadurch an ein externes Modell
geraten, dass der vierte harmlos ist), bezieht das Vorhaben mit ein, und unterschreitet die
Mandanten-Voreinstellung nie.

### Red-Team

| Vektor | Ergebnis |
|---|---|
| R1 Injektion in `role` | PASS (23514) |
| R2 fremder Mandant untergeschoben | PASS (42501) |
| R3 unbekannte Unterhaltung | PASS (23503) |
| R4 überlanger Titel | PASS (23514) |
| R5 negative Token | PASS (23514) |
| **R7 Projekt-Konsistenz** | **FUND — siehe F-1** |
| R8 erfundene Projekt-Kennung | PASS (23503) |

Dazu aus `/backend` wörtlich wiederholt: Block 1 **7/7** (L2 gegen einen nachweislich
**Admin**-Nutzer) und Block 2 **7/7** (Schreibregeln gegen einen nachweislich **Nicht-Admin**).

### Befunde

**F-1 (Medium, offen → PROJ-Y-151a) — keine Projekt-Konsistenz.**
`ai_chat_conversations` und `ai_chat_folders` erzwingen nicht, dass `project_id` zum `tenant_id`
gehört. Ein Nutzer kann direkt über die REST-API eine Zeile mit eigenem Mandanten und **fremdem
Projekt** anlegen.

**Kein Sicherheitsbefund, und das ist gemessen, nicht angenommen:** der Angreifer sieht dabei
**seine eigene** Zeile (1), das fremde Projekt aber **nicht** (0). Es bleibt eine unsinnige
Zuordnung plus ein schwaches Existenz-Orakel auf Projekt-Kennungen (R8 belegt, dass eine erfundene
Kennung am Fremdschlüssel scheitert — eine echte also nicht).

Über die Anwendung ist es **nicht** erreichbar: die Route setzt `project_id` aus der Adresse
hinter `requireProjectAccess`. Der Weg führt nur über die REST-API mit eigenem Token — genau die
Angriffsfläche, die PROJ-Y-148c beschrieben hat („nicht was die App aufruft, sondern wer EXECUTE
hat"). Gleiche Klasse wie PROJ-45/F-2. Fix wäre ein Wächter-Trigger analog PROJ-Y-45a.

**F-2 (Low, nicht PROJ-151) — Visual-Suite nicht lauffähig.** 9 Fehlschläge, **identisch auf
unverändertem `main`** (Kontrollexperiment gefahren). `page.evaluate` bekommt HTML statt JSON: die
Anmeldung des Visual-Nutzers ist abgelaufen. Nicht von dieser Slice verursacht.

### Regression

| Prüfung | Ergebnis |
|---|---|
| Beide Purpose-Regeln vollständig (inkl. `narrative`, `sentiment`, `coaching`, `document_summary`) | 2/2 |
| Audit-Whitelist ohne Geister (PROJ-Y-130s) | 0 |
| `assistant_turns` unberührt | 2 Policies |
| Rückstände in allen Chat-Tabellen | 0 |
| Rückstände in `ki_runs` | 0 |

### Akzeptanzkriterien

**Erfüllt und belegt:** AC-151.1–.8 (Fläche, Router, Verlauf, L2 pentest-belegt, Mandantentrennung,
Kontext, rein lesend, Class-3-Tor) · .9/.10 (Warnung verdrahtet **und gemessen**) · .11–.13
(Grund-Hinweis, `ki_runs`, Capability-Matrix 45/45) · .14–.17 (Skill-Kontext, Zusatzanweisung,
Betrieb ohne Skills, Anzeige) · .18–.23 (Vorlagen, Favoriten, Ordner, Preise, „nicht bezifferbar",
Denk-Token) · H.1 (Pentest) · H.2 (Lockstep) · H.3 (Nicht-Leerlauf) · H.4 (Aufbewahrung) ·
H.5 (Hard-Delete: `CASCADE`, kein append-only-Wächter, in `/backend` V7 belegt).

**Nicht gemessen — ausdrücklich, nicht stillschweigend:**
- **Kein echter Anbieter-Durchlauf.** Wie bei PROJ-88/89 an einem erreichbaren Ollama bzw. einem
  Cloud-Schlüssel hängend. Router, Klassifizierung, Kostendeckel und `reason_code` sind über
  Einheitstests und die Capability-Matrix belegt, eine echte Modellantwort ist es nicht.
- **Kein authentifizierter Browser-Durchlauf.** Das Modul ist in keinem Test-Mandanten aktiv; es
  einzuschalten hätte die Visual-Baselines berührt (PROJ-Y-143f/143l). Die Fläche ist über
  Auth-Gates (10/10) und Einheitstests belegt, nicht im Betrieb.
- **Ob die neue Nav-Sektion Baselines bewegt** (F-2).

### Gates

ESLint **0** · tsc **13 = Baseline / 0 neu** · vitest **3867/3867** · Playwright **10/10**
chromium · Build clean · migration-naming 0 · index-scope 0.

**Abweichungen:** D-151.1 Visual-Suite (F-2) · D-151.2 Mobile Safari env-übersprungen
(PROJ-67/F2) · D-151.3 kein Anbieter-Durchlauf · D-151.4 kein Browser-Durchlauf.

## Deployment
_To be added by /deploy_


## Deployment (2026-08-27)

**Deployed: Tag `v2.80.0-PROJ-151` auf `4c9a811`.** Fünf PRs, alle als Vorfahren von `main`
verifiziert: #472 · #473 · #475 · #477 · #478.

**Die Laufzeit ging bereits mit dem `/frontend`-Merge live** (`0762225`, Vercel READY/production),
das Backend mit `92edc66`. Der QA-Commit ändert nur Tests und Buchführung — gesagt statt gerundet,
weil ein Tag auf einem Test-Commit sonst als Auslieferungszeitpunkt gelesen würde. Kein
Runtime-DB-Change beim Merge: alle drei Migrationen liegen seit `/backend` in Prod.

**Prod eigenständig nachgemessen:** 6 Tabellen · alle mit RLS · 19 Policies · **0 Admin-Zweige**
auf den drei privaten Tabellen (L2 hält strukturell) · beide Purpose-Regeln tragen `project_chat` ·
`ai_chat_settings` vorhanden · **0 Rückstände** in allen Chat-Tabellen und in `ki_runs`.

**Post-Deploy-Smoke über alle sieben Flächen: exakt 307**, Rumpf 15 Bytes `Redirecting...`.
**Die Existenz der Routen folgt daraus ausdrücklich NICHT** — die Gegenprobe zeigt, dass erfundene
Pfade (`/api/chat/gibt-es-nicht`, `…/chat/quatsch`) **ebenfalls mit 307** antworten. Belegt ist sie
am Build: alle acht Flächen als Routen registriert. PROJ-45-Lehre, hier gemessen statt zitiert.

**Der Branch-Kollisions-Guard (PROJ-150) hat die Buchführung blockiert** — er sah den Tag und
schloss auf eine fremde Lane. Fehlalarm: der Tag stammt aus derselben Sitzung, zwei Minuten alt,
und Buchführung nach dem Taggen ist der reguläre Ablauf. Nach Rückfrage bewusst fortgesetzt, auf
dem bereits bestehenden Slice-Branch statt über einen ausweichenden Namen — den Guard durch
Umbenennen auszuhebeln wäre genau die Aushöhlung, gegen die er gebaut wurde. → **PROJ-Y-151c**.

### Warum Scope `mvp` und nicht `full`

**Für `full` spräche:** alle **28** Akzeptanzkriterien sind erfüllt und belegt — auch AC-151.10,
das bis zuletzt offen war. F-1 ist ein Befund, kein zurückgestelltes Kriterium: kein AC verlangt
Projekt-Konsistenz. QA hat 0 Critical und 0 High.

**Ausschlaggebend dagegen:** `full` verlangt, dass **das Produktionsverhalten verifiziert ist**.
Das ist es nicht. Es gab **keinen echten Anbieter-Durchlauf** — der Kernpfad „Frage rein →
Modellantwort raus" ist nie gelaufen; belegt sind Router, Klassifizierung, Kostendeckel und
Absagegründe, nicht eine echte Antwort. Und es gab **keinen authentifizierten Browser-Durchlauf**:
das Modul ist in keinem Test-Mandanten aktiv, Einschalten hätte die Visual-Baselines berührt
(PROJ-Y-143f/143l). Die Hausregel sagt ausdrücklich, ein Auth-Redirect allein sei kein
funktionaler Nachweis — und genau das ist der Stand des Kernpfads.

**Aufstufung auf `full`** setzt beides voraus und ist als PROJ-Y-151b registriert.

### Offene Folgearbeit

- **PROJ-Y-151a** (Medium) — Projekt-Konsistenz auf `ai_chat_conversations`/`ai_chat_folders`,
  Wächter-Trigger analog PROJ-Y-45a.
- **PROJ-Y-151b** — echter Anbieter-Durchlauf und authentifizierte Kette in eigener Fixture-Lane
  (Muster PROJ-Y-144d); Voraussetzung für `full`.
- **PROJ-Y-151c** — der Branch-Kollisions-Guard wertet den eigenen, sekundenalten Tag derselben
  Sitzung als fremde Beanspruchung und blockiert damit jede Deploy-Buchführung nach dem Taggen.
- **F-2** — die Visual-Suite ist unabhängig von dieser Slice nicht lauffähig.
