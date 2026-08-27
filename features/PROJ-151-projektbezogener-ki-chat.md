# PROJ-151: Projektbezogener KI-Chat

## Status: Architected
## Deployment Scope: —
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

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
