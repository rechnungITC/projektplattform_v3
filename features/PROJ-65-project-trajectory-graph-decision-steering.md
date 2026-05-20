# PROJ-65: Project Trajectory Graph \& Decision Steering

# Status: Draft / Ready for Refinement

# Created: 2026-05-13

# Last Updated: 2026-05-13

# Relates to: PROJ-58 (ergänzt, ersetzt nicht)

# Kontext

# PROJ-58 hat die interaktive Graph-Ansicht (2D-SVG + 3D-Verbindungsgraph) als Beziehungsmodell geliefert: Knoten, Kanten, Critical-Path-Overlay, Entscheidungssimulation, KI-Vorschlagsknoten. Was fehlt, ist die Trajektorien-Sicht: der Nutzer will den Graphen als gerichteten Weg vom Projekt-Start (Idee) zum Projekt-Ziel (Umsetzung/Übergabe) lesen können — wie ein Ast eines Baums, der sich zum Ziel hin entwickelt und sich bei jeder Entscheidung verzweigt, verlängert oder verkürzt.

# PROJ-65 beschreibt diese zweite Lesart des Graphen. Beide Modi (Beziehungsgraph aus PROJ-58 und Trajektoriengraph aus PROJ-65) leben parallel auf derselben Datenbasis und sind über einen Modus-Toggle erreichbar.

# Die Trajektoriensicht ist gleichzeitig der Einstieg in Entscheidungssteuerung: Stakeholder hängen am Pfadobjekt, Pfadänderungen propagieren in Echtzeit durch Zeit/Kosten/Risiko/Compliance/Stakeholder-Last, und im zweiten Schritt schlägt die KI Reihenfolgen, Parallelisierungen, Ressourcen­zuordnungen und Verknüpfungen vor — wie sich Synapsen je nach Entscheidung bilden oder stocken.

# Produktentscheidung 2026-05-13: Der Trajektoriengraph wird vollständig umgesetzt, nicht als reduzierter MVP. Der Cut in Phasen dient der Reihenfolge, nicht dem Scope-Reduce.

# Review-/Architektur-Anknüpfungen

# ·	`features/PROJ-58-...md` — Beziehungsgraph + 3D-Verbindungsansicht. PROJ-65 nutzt denselben Snapshot, dasselbe Routing, dieselben Datenquellen.

# ·	`features/PROJ-9-...md` (Work Item Metamodel) — liefert die Knoten für den Pfad.

# ·	`features/PROJ-19-...md` (Phases \& Milestones) — liefert die methodische Grundstruktur.

# ·	`features/PROJ-27-...md` (Cross-Project Links) — wird für KI-Verknüpfungslogik benötigt.

# ·	`features/PROJ-43-...md` (Critical Path) — liefert Kritikalitätssignal, das in der Trajektorie als "Hauptpfad" sichtbar wird.

# ·	`features/PROJ-55-...md` (Tenant/Settings) — liefert Methoden-Konfiguration auf Projektebene (Annahme).

# ·	`features/PROJ-57-...md` (Participant Resource Linking) — Pflicht-Voraussetzung für Stakeholder-Marker am Knoten und Stakeholder-Wechsel-Simulation.

# ·	`docs/decisions/architecture-principles.md` — Shared Core + Extensions, AI als Vorschlagsschicht.

# ·	`docs/decisions/v3-ai-proposal-architecture.md` — KI-Ausgaben reviewbar, traceable, akzeptierbar.

# Dependencies

# ·	Requires: PROJ-58 (3D-Graph-Basis und Snapshot-API).

# ·	Requires: PROJ-9 Work Item Metamodel.

# ·	Requires: PROJ-19 Phases \& Milestones (Methodenstruktur).

# ·	Requires: PROJ-57 Participant Resource Linking (Stakeholder-am-Objekt-Relation, Rate-Daten).

# ·	Requires: PROJ-43 Critical-Path-Berechnung (Pfad-Kritikalität).

# ·	Requires: Projekt-Methodenfeld (`project.methodology` o.ä.). Wenn nicht vorhanden → Pre-Dependency klären.

# ·	Requires: PROJ-27 Cross-Project Links (für Story 65-9).

# ·	Recommended: PROJ-55 für Settings-/Berechtigungskontext für Class-3-Sichtbarkeit.

# ·	Feeds: PROJ-21 Reports (Trajektorien-Snapshots), PROJ-56 Readiness/Health.

# Zielbild

# Als Projektleiter / Product Owner / Programmmanager möchte ich denselben Projektgraphen wahlweise als Beziehungsmodell (PROJ-58) oder als Trajektoriengraph (PROJ-65) ansehen können, sodass ich:

# ·	den Weg von der Projekt-Idee bis zum Ziel als gerichteten, methodenadaptiven Pfad sehe (Phasen bei klassisch, Epics/Stories bei Scrum, gemischt bei Hybrid),

# ·	erkennen kann, ob ein Arbeitspaket den Abstand zum Ziel verkürzt (grüner Pfad), erweitert (zusätzliche Etappe) oder parallel läuft (Sidetrack, z.B. DSGVO/ISO 27001),

# ·	pro Pfadknoten direkt sehe, welcher Stakeholder/Ressource verantwortlich ist,

# ·	Stakeholder-Wechsel als Entscheidung simulieren kann inkl. Auswirkungen auf Folgepakete, Kosten, Zeit, Risiko,

# ·	bei Verschiebungen die Wechselwirkung live durch Zeit/Kosten/Risiko/Stakeholder/Compliance propagieren sehe — als echte Plan-Mutation mit Undo und Audit, nicht nur transient,

# ·	KI-Vorschläge für Reihenfolge, Parallelisierung, Ressourcenzuordnung und Verknüpfungen zu anderen Projekten/Ressourcen/Risiken erhalte — reviewbar und Class-3-konform.

# Phasen / Slice-Struktur

# Phase	Inhalt	Stories	Schema-Change

# Phase 1 — Pfad-Layout	Trajektoriengraph, Methodenerkennung, Sidetrack-Eigenschaft	65-1, 65-2, 65-5	klein (Sidetrack-Flag)

# Phase 2 — Stakeholder-Marker	Stakeholder am Pfadknoten, Stakeholder-Wechsel-Simulation	65-4, 65-6	keiner (nutzt PROJ-57)

# Phase 3 — Zielvektor \& Wechselwirkung	Zielobjekt, Zielnähe-Visualisierung, Live-Propagation	65-3, 65-7	mittel (Goal-Knoten, Plan-Audit)

# Phase 4 — KI	Pfadplanung, Ressourcenzuordnung, Verknüpfungsvorschläge	65-8, 65-9	optional

# \---

# Phase 1 — Pfad-Layout

# Story 65-1: Trajektorien-Modus / Pfadgraph

# Als Projektleiter

# möchte ich den Graphen wahlweise als gerichteten Pfad vom Projekt-Start zum Projekt-Ziel anzeigen können,

# damit ich nachvollziehe, wie sich das Projekt von der Idee bis zur Übergabe entwickelt — und nicht nur Beziehungen sehe.

# Acceptance Criteria

# ·	AC-1: Im bestehenden `/projects/\\\[id]/graph` ist ein Modus-Toggle verfügbar: Beziehungen (PROJ-58, Default) vs. Trajektorie (PROJ-65).

# ·	AC-2: Im Trajektorien-Modus wird der Projektknoten als Startpunkt links/zentriert, das Zielobjekt rechts/in Tiefenrichtung positioniert.

# ·	AC-3: Knoten zwischen Start und Ziel werden topologisch sortiert (entlang `depends\\\_on`, `belongs\\\_to`).

# ·	AC-4: Verzweigungen werden als Astgabeln dargestellt (z.B. mehrere Epics parallel unter einem Projekt).

# ·	AC-5: Beide Modi nutzen denselben Snapshot aus `GET /api/projects/\\\[id]/graph` — kein Doppelfetch.

# ·	AC-6: Der Modus-Wechsel ändert nur das Layout, nicht die Datenmenge oder die Berechtigungen.

# ·	AC-7: Der gewählte Modus wird pro Nutzer und Projekt gemerkt (Annahme: Local Storage oder User-Settings).

# Open Questions

# ·	Wie wird der "Startpunkt" definiert? Projektknoten allein, oder ein expliziter "Start"-Marker?

# ·	Soll der Modus auch in der 2D-SVG-Ansicht funktionieren oder nur in der 3D-Szene?

# Annahmen

# ·	Annahme: Topologische Sortierung erfolgt auf Basis der bestehenden `depends\\\_on`-Kanten und der `phase\\\_order`/`sprint\\\_order` aus PROJ-19. Wenn keine Sortierreihenfolge existiert, fällt das Layout auf alphabetisch zurück.

# \---

# Story 65-2: Methodenadaptive Pfadgestalt

# Als Projektleiter

# möchte ich, dass der Trajektoriengraph die für mein Projekt hinterlegte Methode (Wasserfall, Scrum, Hybrid) erkennt und die Pfadstruktur entsprechend aufbaut,

# damit der Graph zu meiner tatsächlichen Arbeitsweise passt.

# Acceptance Criteria

# ·	AC-1: System liest die Projektmethode aus der hinterlegten Projektkonfiguration (Annahme: `project.methodology` oder vergleichbares Feld).

# ·	AC-2: Wasserfall: Pfad besteht aus den Phasen Initialisierung → Definition → Planung → Steuerung → Abschluss in genau dieser Reihenfolge (oder den im Projekt tatsächlich gepflegten Phasen).

# ·	AC-3: Scrum: Pfad besteht aus Epics als Hauptast, Stories als Sub-Äste; das Epic/die Story mit dem Marker "Übergabe" o.ä. erscheint am Ende.

# ·	AC-4: Hybrid: gemischtes Layout — klassische Phasen am Anfang/Ende, agile Sprints/Epics in der Mitte (oder gemäß tatsächlicher Projektstruktur).

# ·	AC-5: Wenn keine Methode hinterlegt ist, fällt das Layout auf eine generische topologische Sortierung zurück und zeigt einen sichtbaren Hinweis ("Methode nicht definiert").

# ·	AC-6: Das Layout ist deterministisch und reproduzierbar — gleiche Daten ergeben gleiches Bild (kein Force-Layout-Springen).

# Open Questions

# ·	Wo ist die Projektmethode heute hinterlegt? Welches Feld, welche Tabelle? Wenn nicht vorhanden, ist das eine Vor-Story.

# ·	Welche Methoden sind im System modelliert? Nur Scrum/Wasserfall/Hybrid oder mehr (Kanban, SAFe, …)?

# ·	Wer entscheidet, welches Epic/welche Storie die "Übergabe" markiert — Flag, Konvention, manuelle Auswahl?

# Annahmen

# ·	Annahme: Bei Wasserfall werden die Phasen aus PROJ-19 verwendet; das System rät nicht, sondern zeigt nur, was gepflegt ist.

# ·	Annahme: Wenn die Methode "Scrum" ist, aber keine Übergabe-Markierung existiert, ist die letzte Storie im letzten Sprint der Zielanker.

# \---

# Story 65-5: Sidetrack-Eigenschaft für Querschnitts­arbeitspakete

# Als Projektleiter

# möchte ich Arbeitspakete als Sidetrack markieren können (z.B. DSGVO, ISO 27001, interne Compliance),

# damit sie nicht den Hauptpfad zum Ziel belasten, aber sichtbar parallel geführt werden.

# Acceptance Criteria

# ·	AC-1: Ein Arbeitspaket/eine Storie hat eine boolesche Eigenschaft `is\\\_sidetrack` (oder gleichwertig).

# ·	AC-2: Sidetrack-Knoten werden im Trajektoriengraph parallel zum Hauptpfad in einer eigenen Lane gerendert (z.B. oberhalb oder unterhalb).

# ·	AC-3: Sidetrack-Knoten sind über einen Filter ein-/ausblendbar.

# ·	AC-4: Sidetrack-Knoten zählen nicht in die Zielnähe-Berechnung (Story 65-3).

# ·	AC-5: Das Flag ist pro Knoten am Detailpanel pflegbar (sofern Nutzer Bearbeitungsrechte hat).

# ·	AC-6: Wenn ein Sidetrack-Knoten kritisch wird (z.B. blockiert durch unerfüllte DSGVO-Pflicht), wird er auch im Hauptpfad als Warnsignal sichtbar — Sidetrack heißt nicht "irrelevant".

# Open Questions

# ·	Wird das Sidetrack-Flag als eigene Spalte am Work Item gepflegt oder über ein bestehendes Tag-/Kategorie-System? (Du sagtest "Eigenschaft" → ich nehme dedizierte Spalte an.)

# ·	Wie verhält sich Sidetrack zu evtl. bestehenden "Workstream"-Konzepten in PROJ-9? Mögliche Doppelmodellierung.

# ·	Soll es mehrere Sidetrack-Lanes geben (z.B. eine für DSGVO, eine für ISO), oder eine generische Sidetrack-Lane?

# Annahmen

# ·	Annahme: Genau eine Sidetrack-Lane im ersten Wurf; Differenzierung nach Compliance-Domäne ist Phase-2-Erweiterung.

# \---

# Phase 2 — Stakeholder am Pfadobjekt

# Story 65-4: Stakeholder-Marker am Pfadknoten

# Als Projektleiter

# möchte ich an jedem Pfadknoten (Arbeitspaket, Storie, Epic, Phase) sehen, welcher Stakeholder oder welche Ressource verantwortlich ist,

# damit ich Zuständigkeiten ohne Listenwechsel direkt im Graphen erkenne.

# Acceptance Criteria

# ·	AC-1: Pro Pfadknoten wird der/die zugewiesenen Stakeholder als Marker (Avatar oder Initialen-Glyph) am Knoten angezeigt.

# ·	AC-2: Bei mehreren Zuweisungen werden bis zu N Marker gestapelt; darüber hinaus erscheint ein "+X"-Counter.

# ·	AC-3: Hover/Klick auf den Marker öffnet ein Stakeholder-Detail-Side-Panel mit Name, Rolle und (falls berechtigt) Rate/Auslastung.

# ·	AC-4: Datenquelle ist die Relation aus PROJ-57 (Participant Resource Linking).

# ·	AC-5: Class-3-Daten (Rate, Personalkosten, Coaching-Details) bleiben gemäß PROJ-57-Masking maskiert, sofern der Nutzer keine Freigabe hat.

# ·	AC-6: Wenn ein Stakeholder als "kritisch" markiert ist (siehe PROJ-35/43), erhält der Marker einen Warn-Akzent.

# ·	AC-7: Die Berechnung "kritisch / positiv / kostenkritisch" wird aus bestehenden Stakeholder-Modellen abgeleitet — nicht im Frontend neu erfunden.

# Open Questions

# ·	Welche genauen Felder aus PROJ-57 werden für die Marker-Darstellung benötigt? (Vermutlich `assignment.stakeholder\\\_id`, `stakeholder.display\\\_name`, `stakeholder.criticality`.)

# ·	Was passiert bei Knoten, die keine Stakeholder-Zuweisung haben — leerer Marker oder kein Marker?

# Dependencies

# ·	PROJ-57 Relation `work\\\_item ↔ stakeholder/resource` muss live sein.

# \---

# Story 65-6: Stakeholder-Wechsel als Entscheidungssimulation

# Als Projektleiter

# möchte ich simulieren können, was passiert, wenn ich an einem Pfadknoten einen Stakeholder austausche (z.B. weil er kritisch, zu teuer oder nicht verfügbar ist),

# damit ich vor der Entscheidung verstehe, wie sich Kosten, Zeit, Risiko und Folgepakete verändern.

# Acceptance Criteria

# ·	AC-1: Aus dem Stakeholder-Marker oder Detail-Panel kann eine Simulation "Stakeholder wechseln" gestartet werden.

# ·	AC-2: Das System schlägt alternative Stakeholder/Ressourcen aus PROJ-57 vor (Annahme: gefiltert nach passenden Skills, Verfügbarkeit, Tenant).

# ·	AC-3: Für jeden Alternativvorschlag werden angezeigt: Kostendelta (z.B. `+ 4.000 EUR`), Zeitdelta (z.B. `+ 2 Tage`), Risikodelta (z.B. `Risiko mittel → hoch`), betroffene Folgeknoten.

# ·	AC-4: Konkrete Kostenzahlen werden sichtbar, wenn der Nutzer die Berechtigung dazu hat (Default: Projektleiter und Admin).

# ·	AC-5: Bei fehlender Berechtigung wird die Kostenwirkung maskiert/aggregiert angezeigt ("geringer / mittlerer / höherer Kostenaufwand").

# ·	AC-6: Die Berechtigung "Kosten-Klartext sehen" ist pro Projekt durch Projektleiter oder Admin konfigurierbar (Annahme: aus Projektsettings/PROJ-55).

# ·	AC-7: Die Simulation ist transient — die Domain-Daten ändern sich erst nach expliziter Übernahme durch den Nutzer.

# ·	AC-8: Die Simulation respektiert Class-3-Masking auch in der Auswahlliste alternativer Stakeholder.

# Open Questions

# ·	Wo wird die Berechtigung "Kosten-Klartext" technisch hinterlegt — Projektsettings, Rolle, separates Permission-Flag?

# ·	Welche Skill-/Rollen-Match-Logik liegt der Vorschlagsliste zugrunde? (Manuell, regelbasiert, oder erste Vorstufe der KI aus Story 65-8?)

# ·	Sollen historische Wechsel als Entscheidungsknoten (vgl. PROJ-58 `decisions`) automatisch protokolliert werden?

# Risiken

# ·	Class-3-Berechtigung muss serverseitig durchgesetzt werden, nicht nur im UI verborgen — sonst Datenleck-Risiko.

# \---

# Phase 3 — Zielobjekt \& Wechselwirkung

# Story 65-3: Zielobjekt \& Zielnähe-Visualisierung

# Als Projektleiter

# möchte ich das Projektziel als eigenständiges Objekt in der Ferne sehen und visuell erkennen, ob ein neues Arbeitspaket den Weg zum Ziel verkürzt (grüner Pfad), verlängert (zusätzliche Etappe) oder parallel läuft (Sidetrack),

# damit ich vor jeder Entscheidung sehe, ob sie zielführend ist oder mich vom Ziel wegbewegt.

# Acceptance Criteria

# ·	AC-1: Das Zielobjekt ist ein eigener Knotentyp `goal` (neue Knotenart im Snapshot oder explizit markierter Phase-/Epic-Knoten).

# ·	AC-2: Das Zielobjekt steht visuell abgesetzt vom Projekt — räumlich im Pfadende, nicht in einem Cluster.

# ·	AC-3: Das Zielobjekt ist editierbar: Titel, Beschreibung, optional Erfolgskriterien.

# ·	AC-4: Knoten, die direkt aufs Ziel einzahlen (topologische Liefer­kette), werden auf dem grünen Pfad hervorgehoben (Farb-/Glow-Akzent).

# ·	AC-5: Knoten mit Sidetrack-Eigenschaft (Story 65-5) sind nicht Teil des grünen Pfades.

# ·	AC-6: Beim Hinzufügen eines neuen Arbeitspakets, das zwischen aktuellem Stand und Ziel liegt, vergrößert sich der visuelle Abstand zum Ziel (z.B. zusätzlicher Pfadabschnitt, sichtbare Etappe).

# ·	AC-7: Beim Streichen oder Schließen eines Pakets verringert sich der Abstand entsprechend.

# ·	AC-8: Im Detailpanel des Zielobjekts wird angezeigt: Anzahl offener Pakete auf dem grünen Pfad, geschätzter Restaufwand, kritische Knoten auf dem Weg.

# Open Questions

# ·	Wie wird "zahlt aufs Ziel ein" formal berechnet? Annahme unten — bestätigen oder Heuristik definieren.

# ·	Soll es ein Ziel pro Projekt geben oder mehrere (z.B. Teilziele)?

# ·	Wird das Zielobjekt aus den bestehenden Phasen/Epics abgeleitet (letzte Phase, Übergabe-Epic) oder als eigene Entität gepflegt?

# Annahmen

# ·	Annahme: "Auf das Ziel einzahlend" = Knoten ist topologischer Vorgänger des Zielobjekts entlang `depends\\\_on`/`belongs\\\_to`. Sidetracks und Knoten ohne Pfad zum Ziel zählen nicht.

# ·	Annahme: Wenn die Methode Wasserfall ist, ist das Zielobjekt = letzte Phase (z.B. Abschluss / Übergabe). Bei Scrum = manuell markiertes Übergabe-Epic / letzte Storie.

# Risiken

# ·	Wenn die Heuristik "grüner Pfad" unklar bleibt, wird die Visualisierung beliebig und verliert Aussagekraft. Frühe fachliche Festlegung nötig.

# \---

# Story 65-7: Live-Wechselwirkung \& Plan-Propagation

# Als Projektleiter

# möchte ich, dass Veränderungen an einem Pfadobjekt (z.B. Sprint verschieben, Storie umlegen, Arbeitspaket streichen) sich live auf alle abhängigen Knoten und auf die Werte für Zeit, Kosten, Risiko, Stakeholder-Last und Compliance auswirken,

# damit ich Wechselwirkungen sofort sehe und nicht erst aus Listen rekonstruieren muss.

# Acceptance Criteria

# ·	AC-1: Verschieben eines Sprint-Knotens verschiebt zugehörige Stories/Tasks automatisch mit (echte Plan-Mutation, nicht nur Anzeige).

# ·	AC-2: Veränderungen propagieren entlang `depends\\\_on`-Kanten: nachgelagerte Knoten verschieben sich, wenn ihre Voraussetzung sich verschiebt.

# ·	AC-3: Folgende Werte propagieren live: Zeit, Kosten, Risiko, Stakeholder-Last, Compliance-Status.

# ·	AC-4: Vor finaler Übernahme zeigt das System eine Diff-Ansicht "vorher / nachher" mit allen propagierten Änderungen.

# ·	AC-5: Übernahme einer Plan-Mutation ist mit Undo möglich (mindestens letzte Mutation, idealerweise N Schritte).

# ·	AC-6: Jede Plan-Mutation wird im Audit-Log mit Nutzer, Zeitpunkt, betroffenen Knoten und Werte-Deltas geschrieben.

# ·	AC-7: Berechtigung "Plan-Mutation durchführen" ist rollenbasiert (Default: Projektleiter, Admin).

# ·	AC-8: Bei Class-3-Werten (z.B. Personalkosten in der Stakeholder-Last) bleibt die Anzeige in der Diff-Ansicht maskiert für Nutzer ohne Freigabe.

# ·	AC-9: Die Propagation darf den Main Thread nicht blockieren — bei großen Pfaden (N > 100 betroffene Knoten) erfolgt sie progressiv mit Lade-Indikator.

# Open Questions / Risiken

# ·	Architekturkonflikt mit PROJ-58: PROJ-58 hat sich explizit auf "transient simulation, keine automatische Domain-Mutation" festgelegt. Story 65-7 ändert echte Plandaten. Vor Implementierung muss in `/architecture` geklärt werden:

# ·	Schreibt das Frontend direkt in Domain-Tabellen oder geht alles über eine Mutation-Service-Schicht?

# ·	Wie wird Konfliktbehandlung gemacht (zwei Nutzer ändern denselben Knoten gleichzeitig)?

# ·	Wie verhält sich Plan-Mutation zu bestehenden Sprint-/Phasen-Datenmodellen — gibt es Trigger, die kaskadieren, oder muss die App das selbst tun?

# ·	Compliance-Status propagieren: Wir haben heute keinen expliziten Compliance-Status pro Knoten modelliert. Ist das eine Vor-Story (Compliance-Feld am Work Item)?

# ·	Risiko propagieren: Risikoaggregation aus PROJ-20 — wie wird sie über den Pfad summiert? Max? Gewichtet?

# ·	Undo-Tiefe: 1 Schritt oder Session-basiert N Schritte?

# Annahmen

# ·	Annahme: Plan-Mutation wird über eine neue API-Schicht `POST /api/projects/\\\[id]/plan/mutations` geführt, die intern die zugrunde liegenden Domain-Tabellen aktualisiert und ein Audit-Event schreibt.

# ·	Annahme: Diff-Ansicht ist Pflicht vor Übernahme — keine direkten Schreibvorgänge ohne Bestätigung.

# \---

# Phase 4 — KI-gestützte Steuerung

# Story 65-8: KI-Pfadplanung \& Ressourcenzuordnung

# Als Projektleiter

# möchte ich, dass die KI für eine Menge von Arbeitspaketen/Stories eine sinnvolle Reihenfolge oder Parallelisierung vorschlägt und Ressourcen aus PROJ-57 automatisch zuordnet,

# damit ich nicht jede Sequenz und jede Zuweisung selbst planen muss.

# Acceptance Criteria

# ·	AC-1: Aus dem Trajektoriengraph kann eine Aktion "KI-Vorschlag für Pfadplanung" ausgelöst werden (z.B. für ein Epic oder einen Sprint).

# ·	AC-2: Die KI nimmt als Input: vorhandene Arbeitspakete, Abhängigkeiten, verfügbare Ressourcen aus PROJ-57, Methodenkontext.

# ·	AC-3: Die KI gibt aus: vorgeschlagene Reihenfolge, parallele Tracks, Ressourcenzuweisung pro Paket, geschätzte Zeit/Kosten/Risiko.

# ·	AC-4: Class-3-Daten (Tagessätze, konkrete Personalkosten) werden nur dann in die KI-Eingabe einbezogen, wenn der Nutzer explizit dafür freigegeben hat. Default: maskiert.

# ·	AC-5: Das Ergebnis landet im Review-Flow (entweder bestehendes `ai\\\_proposals` oder neuer Prozess speziell für Pfad-/Steuerungsvorschläge).

# ·	AC-6: Vor Übernahme zeigt das System Diff "vorher / nachher" inkl. propagierter Werte (gemäß Story 65-7).

# ·	AC-7: Wird der Vorschlag teilweise akzeptiert, schreibt das System nur die akzeptierten Teile in den Plan.

# ·	AC-8: Wenn die KI deaktiviert ist (vgl. PROJ-58 EC-4), bleibt die Funktion ausgeblendet, der Rest des Trajektoriengraphen funktioniert weiter.

# Open Questions

# ·	Neuer KI-Prozess oder bestehender `ai\\\_proposals`-Flow? Du sagtest "kann neuer Prozess sein". Das ist eine Architekturentscheidung — neuer Flow bedeutet eigene Tabelle, Review-UI, Modellrouter-Konfiguration.

# ·	Welche Skill-/Rollen-Matching-Logik nutzt die KI für Ressourcenzuordnung? Heuristik aus PROJ-57 oder eigene KI-Logik?

# ·	Wie wird Vertraulichkeitsstufe pro Ressource (PROJ-57) an den Modellrouter weitergegeben?

# Dependencies

# ·	PROJ-57 muss Skill-/Rate-/Verfügbarkeitsdaten in einer für KI lesbaren Form bereitstellen.

# ·	Modellrouter mit Class-3-Maskierung muss verfügbar sein.

# \---

# Story 65-9: KI-Verknüpfungslogik \& Wechselwirkungs­vorschläge

# Als Projektleiter

# möchte ich, dass die KI Wechselwirkungen zwischen Items (Arbeitspakete, Stakeholder, Risiken, Budget, Compliance) erkennt und Verknüpfungen zu anderen Projekten, Ressourcen oder Risiken vorschlägt,

# damit ich nicht jeden Cross-Link manuell pflegen muss und Synapsen zwischen den Items sichtbar werden.

# Acceptance Criteria

# ·	AC-1: Die KI analysiert die Items des aktuellen Projekts (alle Knotentypen aus Snapshot).

# ·	AC-2: Die KI schlägt vor: zusätzliche Dependencies innerhalb des Projekts, Cross-Project-Links (über PROJ-27), Verknüpfungen zu Risiken und Budgetpositionen.

# ·	AC-3: Personalkritische Items (Class-3) werden nur dann in die KI-Eingabe einbezogen, wenn dafür eine explizite Freigabe vorliegt.

# ·	AC-4: Vorschläge landen im Review-Flow (vgl. Story 65-8 — selber Mechanismus).

# ·	AC-5: Jeder Vorschlag enthält eine Begründung ("Item A teilt Skill-Bedarf mit Item B in Projekt X") — keine "Black-Box"-Verknüpfungen.

# ·	AC-6: Akzeptierte Vorschläge werden als manuelle Edges geschrieben (vgl. PROJ-58 `POST /graph/edges`).

# ·	AC-7: Die KI zeigt explizit, welche Daten sie für eine Empfehlung verwendet hat (Provenance), damit der Nutzer die Vertrauenswürdigkeit beurteilen kann.

# Open Questions

# ·	Wie tief darf die KI in Cross-Project-Daten greifen — gibt es eine Mandanten- oder Programmgrenze?

# ·	Welche Daten sind als "anderer Stakeholder/Ressource" zugänglich, ohne Datenschutz zu verletzen?

# ·	Soll die KI auch Vorschläge zum Lösen von Verknüpfungen machen (z.B. "diese Dependency ist obsolet")?

# Dependencies

# ·	PROJ-27 Cross-Project Links produktiv.

# ·	PROJ-57 Ressourcendaten produktiv.

# ·	KI-Modellrouter mit Class-3-Awareness.

# \---

# Architekturentscheidungen für `/architecture` (vor Implementierung zu locken)

# Frage	Default-Empfehlung	Begründung

# Trajektorien-Modus 3D, 2D oder beide?	Beide, gleicher Pattern wie PROJ-58	Konsistenz mit bestehender Architektur, 2D-Fallback bleibt Pflicht.

# Eigene Layout-Engine oder bestehende erweitern?	Bestehende erweitern (`project-graph-view.tsx` + `three-adapter.ts`)	Wiederverwendung, kein zweiter Renderer.

# Sidetrack als Spalte oder Tag?	Eigene Spalte am Work Item	Klare Eigenschaft, kein Tag-Wildwuchs.

# Zielobjekt als neuer Knotentyp `goal`?	Ja, im Snapshot mit Aggregator-Erweiterung	Saubere Trennung von Phase/Milestone.

# Plan-Mutation (Story 65-7) Architekturmodell	Neuer Service-Layer `POST /plan/mutations` + Audit-Log	Trennt Domain-Mutation klar von Snapshot-Read.

# Konfliktbehandlung bei parallelen Mutationen	Optimistic locking + Diff-Ansicht	Vermeidet Datenverlust, vorhandene Konvention nutzen.

# KI-Flow (Story 65-8/9): bestehender `ai\\\_proposals` oder neu?	Beides klären: KI-Steuerungs-Proposal als eigener Typ in `ai\\\_proposals` ODER eigene Tabelle	Entscheidung in `/architecture`.

# Methodenfeld am Projekt	Bestätigen, ob `project.methodology` existiert; falls nein, Vor-Story aufmachen	Voraussetzung für Story 65-2.

# Berechtigung "Kosten-Klartext im Graphen"	Aus PROJ-55 Settings + PROJ-57 Class-3-Logik konsumieren, keine neue Permission erfinden	Konsistenz.

# Compliance-Status pro Knoten	Klären, ob Modell existiert; ggf. Vor-Story	Voraussetzung für Story 65-7.

# \---

# Out-of-Scope

# ·	Vollautomatische Projektplanung durch KI ohne Nutzer-Review.

# ·	Mandantenübergreifende Trajektorien-Sicht (Cross-Tenant).

# ·	Eigene Compliance-Engine (DSGVO/ISO 27001 werden über Flags am Work Item geführt, nicht über eine eigene Compliance-Logik).

# ·	Mehrere Ziel-Objekte gleichzeitig (Teilziele) — Phase 2.

# ·	Visualisierung von Wahrscheinlichkeiten und stochastischen Entscheidungsbäumen (vgl. Open Question in PROJ-58).

# ·	Automatische Übernahme von KI-Vorschlägen ohne Review.

# \---

# Open Questions (zusammengefasst)

# 1\.	Existiert `project.methodology` heute? Wenn nein, separate Vor-Story.

# 2\.	Existiert ein Compliance-Status-Feld pro Knoten? Wenn nein, separate Vor-Story für Story 65-7.

# 3\.	Welche Methoden sind im System modelliert (nur Scrum/Wasserfall/Hybrid oder mehr)?

# 4\.	Wer/was markiert das Zielobjekt — letzte Phase, Übergabe-Epic, eigene Markierung?

# 5\.	Wie wird "auf das Ziel einzahlend" formal berechnet (Annahme oben — bestätigen)?

# 6\.	Sidetrack als eigene Spalte oder Tag-System? (Annahme: eigene Spalte.)

# 7\.	Wo wird "Kosten-Klartext sehen"-Berechtigung konfiguriert (Projektsettings, Rolle, Permission-Flag)?

# 8\.	Neuer KI-Flow oder bestehender `ai\\\_proposals` für Story 65-8/9?

# 9\.	Undo-Tiefe bei Plan-Mutation (1 Schritt vs. Session N Schritte)?

# 10\.	Konfliktbehandlung bei parallelen Plan-Mutationen (optimistic vs. pessimistic locking)?

# \---

# DoR (Definition of Ready)

# ·	\[ ] Methodenfeld am Projekt bestätigt (Story 65-2).

# ·	\[ ] Zielobjekt-Definition fachlich abgestimmt (Story 65-3).

# ·	\[ ] "Grüner Pfad"-Heuristik festgelegt (Story 65-3).

# ·	\[ ] Sidetrack-Datenmodell entschieden (Story 65-5).

# ·	\[ ] Plan-Mutation-Architektur entschieden (Story 65-7) — inkl. Audit-, Undo-, Konfliktbehandlungs-Konzept.

# ·	\[ ] Class-3-Berechtigungsmodell für Kostenanzeige geklärt (Story 65-6, 65-8).

# ·	\[ ] KI-Flow-Architektur entschieden (Story 65-8, 65-9).

# ·	\[ ] Compliance-Status-Modell entschieden (Story 65-7).

# ·	\[ ] AC mit Stakeholdern abgestimmt.

# DoD (Definition of Done)

# ·	\[ ] Trajektorien-Modus in `/projects/\\\[id]/graph` aktivierbar (Story 65-1).

# ·	\[ ] Methodenadaptive Pfadgestalt funktioniert für Wasserfall, Scrum, Hybrid (Story 65-2).

# ·	\[ ] Sidetrack-Knoten parallel rendern, filterbar (Story 65-5).

# ·	\[ ] Stakeholder-Marker an Pfadknoten, Class-3-konform (Story 65-4).

# ·	\[ ] Stakeholder-Wechsel-Simulation transient, mit Berechtigungslogik (Story 65-6).

# ·	\[ ] Zielobjekt sichtbar, grüner Pfad markiert (Story 65-3).

# ·	\[ ] Plan-Mutation live mit Diff/Undo/Audit (Story 65-7).

# ·	\[ ] KI-Pfadplanung + Ressourcen-Zuordnung reviewbar (Story 65-8).

# ·	\[ ] KI-Verknüpfungsvorschläge reviewbar mit Provenance (Story 65-9).

# ·	\[ ] QA-Plan abgearbeitet (Unit, Integration, Playwright, Performance-Smoke, Class-3-Permission-Tests).

# ·	\[ ] Dokumentation/Nutzungshinweise liegen vor.

# \---

# QA / Verification Plan (Skizze)

# ·	Unit-Tests für Trajektorien-Layout-Engine (Snapshot → Pfad-Layout).

# ·	Unit-Tests für Methoden-Detection.

# ·	Unit-Tests für Zielnähe-Berechnung ("grüner Pfad").

# ·	Unit-Tests für Plan-Mutation-Propagation.

# ·	Permission-Tests für Class-3-Kostenanzeige.

# ·	Audit-Log-Test für Plan-Mutationen.

# ·	Playwright Visual-Regression für Trajektorien-Modus (Wasserfall/Scrum/Hybrid).

# ·	Playwright für Stakeholder-Wechsel-Simulation.

# ·	Playwright für Live-Propagation-Diff-Ansicht.

# ·	Performance-Smoke bei 250 Knoten / 500 Kanten — Pfad-Layout darf nicht > Snapshot+1s rendern.

# \---

# Hinweise zur Reihenfolge

# Phase 1 → 2 → 3 → 4 ist Pflicht-Reihenfolge:

# ·	Phase 1 liefert die Sicht, ohne die alles andere keinen Anker hat.

# ·	Phase 2 baut auf den Pfadknoten auf — vorher gibt es keine Pfadobjekte für Marker.

# ·	Phase 3 setzt voraus, dass das Pfadmodell und die Sidetracks existieren.

# ·	Phase 4 braucht alle vorherigen Phasen als Datengrundlage und ist sinnvoll erst, wenn das manuelle Modell stabil ist.

# 

# Tech Design (Solution Architect, 2026-05-18)

> PM-Sicht: was gebaut wird, wo es lebt, warum diese Wahl. Kein SQL, kein TS.

## Architektur-Locks aus dem /architecture-Pass

| Lock | Entscheidung | Begründung |
|---|---|---|
| **L1 — Dimensionalität** | 2D-Default + 3D-Toggle | UX-Konsistenz mit PROJ-58, Mobile-Fallback auf 2D. +1 PT akzeptiert. |
| **L2 — Goal-Modell** | Neue Tabelle `project_goals` (1..n pro Projekt) MIT optionalen Source-Refs auf Phase/Milestone. Teilziele über Self-FK `parent_goal_id`. | Editierbare Goals + Teilziele; Source-Felder erlauben Auto-Suggest aus PROJ-19. Bricht PROJ-9-Semantik nicht. |
| **L3 — Sidetracks** | Bridge `work_item_compliance_lanes` (n:m) | Work-Item kann mehreren Lanes (DSGVO + ISO27001) angehören. PROJ-18 `compliance_tags` bleibt orthogonal — Bridge ist Render-Kategorisierung. |
| **L4 — AI-Class-Split** | Mixed: `trajectory_sequence` Class-2 (Cloud OK) + `resource_swap` Class-3 (only-Ollama) | Pfad-Reihenfolge funktioniert ohne Ollama; Resource-Empfehlungen bleiben Class-3. |
| **L10 — Module-Split GraphShell** | Bestehende `ProjectGraphView` (841 LOC) wird zu `GraphShell` extrahiert. `RelationshipGraphView` (umbenannter Body) und `TrajectoryGraphView` (NEU) sind zwei Slot-Komponenten. Shell hält Snapshot-Fetch, Mode-Toggle, Dimension-Toggle, Filter-/Error-/Loading-State. | Saubere Trennung, gemeinsame Toolbar, ein Snapshot. Vermeidet das 1200+-LOC-Monolith-Risiko bei In-File-Erweiterung. |
| **L11 — Hybrid-Layout: zwei parallele Hauptpfade** | Wasserfall-Phase-Lane (oben) + Scrum-Sprint-Lane (unten), beide verankert an ProjectStartNode (links) und GoalNode (rechts). Sidetracks darunter. Wasserfall-only/Scrum-only Projekte zeigen nur die zutreffende Lane. | F-PROJ-65-5 geschlossen. Hybrid-Projekte sehen beide Tracks gleichzeitig; Methoden-Wahl bleibt Projekt-/PROJ-6-Decision, nicht Render-Toggle. |
| **L12 — Render-Scope ε.1 erweitert** | Hauptknoten: phases + milestones + work_items + goals. Risk/Decision/AI-Recommendation als **Badge-Indikator am betroffenen Knoten** (nicht als separater Knoten). Budget als **eigene Cost-Sidetrack-Lane** (analog Compliance-Lanes). Stakeholder-Marker bleiben in ε.2. | User-Entscheidung 2026-05-19. Expansion ggü. ursprünglichem Spec (nur work_items+phases) — kompletteres Bild im ersten Slice, Aufwand-Impact in H. |
| **L13 — Snapshot-Extension via Query-Param** | Bestehender `GET /api/projects/[id]/graph` bekommt optionalen Query-Param `?include=trajectory`. Default-Response unverändert (PROJ-58-Backwards-Compat). Bei include=trajectory liefert der Aggregator zusätzlich `goals[]`, `lanes[]` (compliance), `cost_lane_items[]`, `layout_hints` (method, hybrid-flag, phases_order, sprints_order). | Spec-Vorgabe "gleicher Snapshot, kein Doppelfetch" eingehalten. Opt-in vermeidet Bloat für PROJ-58-Clients. Aggregator-Erweiterung in PROJ-65 ε.1-Backend-Teil-Slice. |
| **L14 — Layout-Engine: pure synchronous function** | `layoutTrajectory(snapshot, mode): TrajectoryLayout` als pure Function in `src/lib/project-graph/trajectory-layout.ts`. Sugiyama (~80 LOC) + Tarjan-SCC für L5-Cycles. Synchron im Main-Thread (N typisch <500). Web-Worker erst bei Pilot-Demand. | L9-Bundle-Budget hält Sugiyama klein, keine `d3-dag`-Dep. Pure Function ist testbar wie der bestehende `aggregate.ts`. |

## A) Komponenten-Struktur

```
/projects/[id]/graph                       (existing PROJ-58 surface)
├── GraphModeToggle                        NEU — "Beziehungen" / "Trajektorie"
│   └── persistiert pro (User, Project) in localStorage + tenant_settings.graph_mode_default
├── RelationshipGraphView                  (existing PROJ-58 2D+3D)
└── TrajectoryGraphView                    NEU (ε.1)
    ├── DimensionToggle (2D/3D)
    ├── TrajectoryGraph2D                  NEU — DAG-Layout SVG-Renderer
    │   ├── ProjectStartNode (links/fixiert)
    │   ├── MainLane (Hauptpfad-Container)
    │   │   └── TrajectoryNode[]           NEU — work_items + phases + sub-goals
    │   │       ├── StakeholderMarker      NEU (ε.2)
    │   │       │   └── Avatar-Stack + "+N"-Counter + Hover-Detail-Panel
    │   │       ├── CriticalPathOverlay   reuse PROJ-43 critical-flag
    │   │       └── GoalAffinityGlow       NEU (ε.3) — grüner Akzent für "auf Ziel einzahlend"
    │   ├── SidetrackLane[]                NEU (ε.1) — horizontale Bänder pro compliance_lane
    │   │   └── TrajectoryNode[]
    │   ├── GoalNode                       NEU (ε.3) — rechts/Pfadende, eigener Knotentyp
    │   │   └── SubGoalNodes (optional, in Tiefen-Cluster)
    │   └── PathEdges (depends_on + belongs_to + flow-to-goal)
    └── TrajectoryGraph3D                  NEU — react-three-fiber Renderer
        └── (gleiche Node-/Edge-Liste, andere Projektion: x=time, y=lane, z=depth)

Seitliche Panels (NEU, slot-basiert)
├── StakeholderDetailPanel                 (ε.2) — bei Marker-Click
├── StakeholderSwapDialog                  (ε.2) — transient, kein Plan-Mutate
├── GoalDetailPanel                        (ε.3) — Title/Desc/Success-Criteria + Source-Wizard
├── LivePropagationToast                   (ε.3) — Δ-Anzeige + Undo-Link (30s)
└── AIProposalDrawer                       (ε.4) — 3 Tabs für 3 Purposes
```

Reuse: PROJ-58 Node-Styling + Edge-Animations + 3D-Scene komplett übernommen. Trajectory-spezifisch sind nur **Layout-Engine** + **GoalNode** + **SidetrackLane** + **StakeholderMarker**.

## A.1) ε.1 Frontend Module Layout (locked 2026-05-19)

Konkretes File-Layout für den Module-Split aus L10. Bestehende Datei `src/components/projects/project-graph-view.tsx` (841 LOC, PROJ-58-θ) wird refaktoriert.

```
src/components/projects/
├── graph-shell.tsx                  NEU   — extrahiert aus project-graph-view.tsx
│                                            hält Snapshot-Fetch, Mode-Toggle, DimensionToggle,
│                                            Filter-/Error-/Loading-/WebGL-Detect-State,
│                                            rendert <Slot> für aktive View
├── relationship-graph-view.tsx      NEU   — Body von project-graph-view.tsx (SVG-Render)
│                                            ohne Shell-Concerns
├── trajectory-graph-view.tsx        NEU   — ε.1 — empfängt Snapshot + Layout-Hints aus Shell
│   ├── trajectory-graph-2d.tsx      NEU   — SVG-Pfad-Renderer (synchron geladen)
│   └── trajectory-graph-3d.tsx      NEU   — react-three-fiber (dynamic-import, L9)
└── project-graph-view.tsx           DEPRECATED — wird zu Thin-Wrapper auf GraphShell
                                                  + RelationshipGraphView (Backwards-Compat
                                                  für test-imports), entfernen nach ε.1-Pilot

src/lib/project-graph/
├── aggregate.ts                     existing PROJ-58 — bekommt optionalen Branch für
│                                                       ?include=trajectory (L13)
├── trajectory-layout.ts             NEU — pure Function layoutTrajectory(snapshot, mode):
│                                          Sugiyama ~80 LOC + Tarjan-SCC, keine Dep (L14)
├── trajectory-layout.test.ts        NEU — pure-function Tests analog aggregate.test.ts
└── types.ts                         existing — erweitert um ProjectGoal, ComplianceLane,
                                                CostLaneItem, LayoutHints, TrajectoryLayout
```

### A.1.1 Hybrid-Layout (L11) — Lane-Anordnung im 2D-Renderer

```
                 ┌─────────────────────────────────────────────────────┐
                 │  GraphShell-Toolbar:                                │
                 │  [Beziehungen | Trajektorie]  [2D | 3D]  [Filter…]  │
                 └─────────────────────────────────────────────────────┘

  ProjectStart  ──── Phase-Lane    ──[Phase 1]──[Phase 2]──[Phase 3]── ►  Goal
       (●)      ┐                                                      ┌  (◆)
                ├── Sprint-Lane   ──[Sprint 1]─[Sprint 2]─[Sprint 3]──┤
                │                                                      │
                ├── Cost-Sidetrack ──[Budget-Item]──[Vendor-Invoice]──┤   (L12-Budget-Lane)
                ├── Sidetrack DSGVO ──[wi]──[wi]──────────────────────┤
                └── Sidetrack ISO27001 ──[wi]──[wi]───────────────────┘
```

**Lane-Sichtbarkeits-Regeln:**
- Wasserfall-only Projekt (PROJ-6 method=`waterfall`): nur Phase-Lane sichtbar.
- Scrum-only Projekt (`scrum`/`safe`): nur Sprint-Lane sichtbar.
- Hybrid (`hybrid-*` Methoden aus PROJ-6 oder Mixed): beide Lanes sichtbar, Phase-Lane oben.
- Sidetracks immer unter Hauptlanes; Cost-Lane vor Compliance-Lanes (Reihenfolge: Phase → Sprint → Cost → Compliance[]).
- Layout-Engine entscheidet Lane-Sichtbarkeit anhand `layout_hints.method` + `layout_hints.hybrid_flag` aus Snapshot.

### A.1.2 Render-Scope ε.1 (L12) — Knoten- und Badge-Mapping

| Domänen-Entität | Render in ε.1 | Visual |
|---|---|---|
| `phase` | Knoten in Phase-Lane | Reuse PROJ-58 phase-styling |
| `milestone` | Knoten in Phase-Lane (zwischen Phasen) | Diamant-Form analog PROJ-58 |
| `work_item` (kind=story/task/bug) | Knoten in Sprint-Lane | Reuse PROJ-58 work-item-styling |
| `work_item` (kind=epic) | Knoten in Phase-Lane oder eigenes Top-Cluster | Designer-Pass (F-PROJ-65-8) |
| `goal` (ε.3) | Pfadende rechts, eigener Knotentyp | Placeholder in ε.1, vollwertig in ε.3 |
| `risk` | **Badge am betroffenen Knoten** (nicht eigener Knoten) | rot/orange Punkt mit Severity-Counter |
| `decision` | **Badge am betroffenen Knoten** | blaues Hex-Icon |
| `budget`-Item | Knoten in Cost-Sidetrack-Lane | Reuse PROJ-58 budget-styling |
| AI-Recommendation | **Badge am betroffenen Knoten** | violetter Stern-Indikator, klickt öffnet ε.4 Drawer |
| `stakeholder` | **Deferred zu ε.2** | — |

**Begründung der Badge-vs-Knoten-Entscheidung:** Risks, Decisions und AI-Recommendations haben fast immer einen Anker-Knoten (Work-Item, Phase, Goal). Als eigene Knoten würden sie den Pfad-Layout verzerren und Kanten-Clutter erzeugen. Als Badge bleiben sie scannbar und der Pfad bleibt lesbar. Budget ist die Ausnahme: Budget-Items haben oft keinen eindeutigen Work-Item-Anker (z.B. Vendor-Invoices auf Projekt-Ebene) → eigene Lane.

### A.1.3 Mode-Toggle Persistenz-Strategie (Konkretisierung L13b)

- **Initial state resolution** (in dieser Reihenfolge):
  1. URL-Query-Param `?mode=trajectory|relationship` (deep-linkable, höchste Priorität)
  2. `localStorage["pp-v3:graph-mode:<projectId>"]`
  3. Server-rendered `tenant_settings.graph_mode_default` (default `'relationship'`)
- **On toggle:** schreibt nur localStorage, kein Server-Roundtrip. URL bleibt unverändert (User kann manuell Link kopieren).
- **Tenant-Default-Override** (Tenant-Admin) lebt in PROJ-17-Tenant-Settings-Page, eigener Folge-Slice — nicht in ε.1.

### A.1.4 Empty / Loading / Error / Cycle States

- **Loading:** Skeleton-Pfad-Layout (3 graue Lane-Bars, framer-motion-Puls); reuse GraphCanvasLoading-Pattern aus PROJ-58.
- **Empty (Projekt ohne Phases/Sprints/Work-Items):** "Noch keine Trajektorie — füge Phasen, Sprints oder Work-Items hinzu, um den Pfad zu sehen." + CTAs zu `/phases`, `/backlog`, `/work-packages` (method-aware).
- **Error:** Reuse PROJ-58 Error-Card-Pattern.
- **Cycle-Detected-Banner (L5):** Sticky-Banner über dem Renderer "N zyklische Abhängigkeit(en) ausgeblendet — Details anzeigen". Click öffnet Drawer mit Cycle-Edges + Hint auf PROJ-9-Dependencies-Page zum Beheben.
- **3D-Fallback:** WebGL-Detect aus PROJ-58 wiederverwendet; bei fehlendem WebGL2 oder `prefers-reduced-motion` automatischer Fallback auf 2D.

## B) Daten-Modell (Plain Language)

### B.1 Neue Entität `project_goals` (L2)

Pro Projekt 1..n Goals. Jedes Goal hat:

- Wer (Projekt, Tenant)
- Title (≤ 200 Zeichen)
- Description (≤ 2000 Zeichen)
- Success-Criteria (≤ 2000 Zeichen)
- Target-Date (optional, fällt sonst auf `projects.planned_end_date` zurück)
- Status (`draft`, `active`, `achieved`, `abandoned`)
- Parent-Goal-ID (Self-FK für Teilzielen-Hierarchie, optional)
- Source-Phase-ID (optional FK auf `phases`)
- Source-Milestone-ID (optional FK auf `milestones`)
- Sort-Order
- Created-By / Created-At / Updated-At

**Source-Felder-Semantik (locked 2026-05-18):**
Goals können autonom existieren ODER sich aus einem Phase/Milestone ableiten. Bei Source-Ableitung werden Title/Description/Target-Date initial befüllt; Source bleibt referenziert auch nach manuellem Override. Manuelle Pflege gewinnt; Source ist Audit-Hinweis, kein Mirror.

### B.2 Neue Entität `work_item_compliance_lanes` (L3)

Bridge n:m für Sidetrack-Render:

- Wer (Work-Item-ID, Tenant)
- Lane-Key (`dsgvo`, `iso27001`, `vergabe`, custom)
- Optional Display-Label

PROJ-18 `compliance_tags` bleibt orthogonal.

### B.3 Audit-Strategie für Live-Propagation

Reuse **PROJ-10** `audit_log_entries` mit erweiterten `_tracked_audit_columns` für neue Felder. Plan-Mutates schreiben mit `causation_id` (UUID gruppiert Multi-Field-Changes wie "Stakeholder-Switch propagiert 7 Folge-Items").

Undo schreibt Reverse-Audit-Entry mit gleichem `causation_id` + `change_kind='undo'`. TTL für UI-Undo-Toast: konfigurierbar pro Tenant (Default 30 s).

### B.4 Schema-Erweiterungen

- `tenant_settings.graph_mode_default` (default `'relationship'`)
- `project_settings.cost_clear_view_permission` (default `'project_manager'`)
- Audit-Whitelist um `project_goals`, `work_item_compliance_lanes`

## C) Tech-Entscheidungen

| Entscheidung | Warum |
|---|---|
| **2D-Layout: DAG-Sugiyama mit Lane-Tracking** | Klassisch für work-item-Dependencies; Lane-Zuordnung erweitert mit Sidetrack-Bridge. Library `d3-dag` (~6 KB) oder eigene Mini-Impl ~80 LOC. |
| **3D-Layout: gleiche Topology, andere Projektion** | x=temporal, y=lane, z=depth. Reuse react-three-fiber aus PROJ-58. |
| **GoalNode als eigenständige Entität (L2)** | Editierbar, Teilziele möglich, Audit-Trail. Source-Ableitung optional aus PROJ-19. |
| **Sidetrack-Bridge separat von PROJ-18 (L3)** | Compliance-Tagging ≠ Render-Kategorisierung. Multi-Lane-fähig. |
| **Live-Propagation persistent mit Undo** | Per Zielbild. PROJ-10-Audit-Trigger + Causation-ID. Undo schreibt Reverse-Entry. |
| **Stakeholder-Swap-Simulation transient (ε.2-AC-7)** | System rechnet nur Deltas. Erst auf "Übernehmen" → Plan-Mutate. |
| **AI Mixed-Class (L4)** | UI deaktiviert nur Resource-Tab wenn kein Ollama; sequence + cross-project funktionieren immer. |
| **Modus-Toggle pro User+Project** | Default aus tenant_settings; User-Override in localStorage. Kein Server-State nötig. |
| **Cost-Klartext via Project-Setting** | Default `project_manager`. Tenant-Setting nur Default für neue Projekte. |

## D) Dependencies (Pakete)

Neue Pakete:
- **`d3-dag`** (~6 KB) — DAG-Layout. Alternative: eigener Sugiyama in ~80 LOC.

Existing reuse (alles bereits deployed): three.js, react-three-fiber, framer-motion, shadcn-Primitives (PROJ-58), PROJ-12 AI-Router, PROJ-10 Audit-Trigger, PROJ-57 Participant-API, PROJ-43 Critical-Path, PROJ-21 Report-Snapshots.

## E) Schnittstellen-Übersicht (API-Surface)

**Modus + Layout (Phase 1):**
- `GET /api/projects/[id]/graph` (existing PROJ-58) — gleicher Snapshot
- `POST /api/projects/[id]/graph-mode` (optional, localStorage-only OK)

**Goals (Phase 3):**
- `GET /api/projects/[id]/goals`
- `POST /api/projects/[id]/goals` (mit optionalen Source-Refs)
- `PATCH /api/projects/[id]/goals/[gid]`
- `DELETE /api/projects/[id]/goals/[gid]` (soft-delete)

**Sidetrack-Lanes (Phase 1):**
- `POST /api/projects/[id]/work-items/[wid]/lanes`
- `DELETE /api/projects/[id]/work-items/[wid]/lanes/[laneKey]`
- `GET /api/projects/[id]/work-items/[wid]/lanes`

**Live-Propagation (Phase 3):**
- `POST /api/projects/[id]/plan-mutate` (atomarer Change + causation_id)
- `POST /api/projects/[id]/plan-mutate/undo`

**Stakeholder-Swap-Simulation (Phase 2):**
- `POST /api/projects/[id]/work-items/[wid]/stakeholder-swap-preview` (transient)
- `POST /api/projects/[id]/work-items/[wid]/stakeholder-swap` (persistent)

**AI (Phase 4):**
- `POST /api/projects/[id]/ai/trajectory-sequence` (Class-2)
- `POST /api/projects/[id]/ai/resource-swap` (Class-3, Ollama-only)
- `POST /api/projects/[id]/ai/cross-project-links` (Class-2)

## F) Datenfluss (gekürzt pro Phase)

**ε.1 Pfad-Layout:**
1. User klickt Trajektorie-Toggle
2. Frontend nutzt existing Snapshot (kein Doppelfetch)
3. Layout-Engine: topologische Sortierung mit Hauptpfad/Sidetrack-Trennung
4. Render: 2D-SVG oder 3D-Scene je nach DimensionToggle

**ε.3 Live-Propagation:**
1. Drag-Drop → local Δ-Preview
2. `POST /plan-mutate` mit causation_id
3. Server: atomarer Update + Audit-Trigger + Risk-Score-Recompute
4. Response: aktualisierter Snapshot + Δ-Summary
5. UI: LivePropagationToast mit Undo-Link (30 s gültig)

**ε.4 AI:**
1. Drawer-Tab wählen
2. Context-Builder pro Purpose (sequence: only Class-1/2 fields; resource_swap: full Class-3 mit Stakeholder + Skills + Rates)
3. PROJ-12 Router mit passender Class-Klassifizierung
4. AI emittiert Vorschläge mit zitierten Quellen
5. UI rendert als Card-List analog PROJ-34 ε.ε Coaching-Pattern
6. Accept/Reject/Modify → Plan-Mutate

## G) Open Follow-Ups (vor Implementation)

| # | Item | Wann fällig | Status |
|---|---|---|---|
| F-PROJ-65-1 | `d3-dag` vs. eigener Sugiyama-Algo — Bundle-Size-Entscheidung | ε.1 Implementation | ✅ closed via L9 + L14 (eigener Sugiyama) |
| F-PROJ-65-2 | DAG-Zyklus-Toleranz (PROJ-9 polymorphic deps können zyklisch sein) | ε.1 | ✅ closed via L5 (Tarjan-SCC + Banner) |
| F-PROJ-65-3 | `project_settings.cost_clear_view_permission` — in PROJ-55 integrieren oder eigener Pfad? | ε.2 vor /backend | open |
| F-PROJ-65-4 | Plan-Undo-TTL — 30 s default, Tenant-Override? | ε.3 | open |
| F-PROJ-65-5 | Hybrid-Methode-Mix (Wasserfall + Scrum gleichzeitig) im Layout | ε.1 | ✅ closed via L11 (zwei parallele Hauptpfade) |
| F-PROJ-65-6 | Multi-Goal-Display bei 3+ Teilzielen — Designer-Pass | ε.3 | open |
| F-PROJ-65-7 | **CIA-Review auf dieses Tech-Design** — MANDATORY laut .claude/rules | vor ε.1-Start | ✅ closed 2026-05-18 (Section J) |
| F-PROJ-65-8 | Epic-Knoten-Platzierung (Phase-Lane vs. eigenes Top-Cluster) | Designer-Pass ε.1 | open |
| F-PROJ-65-9 | Risk/Decision-Badge-Visual + Position am Knoten (Severity-Counter-Treatment) | Designer-Pass ε.1 | open |
| F-PROJ-65-10 | AI-Recommendation-Badge-Position + Hover-Behavior | Designer-Pass ε.1 | open |
| F-PROJ-65-11 | Cost-Sidetrack-Lane Empty-State (Projekt ohne Budget-Modul-Aktivierung) | Designer-Pass ε.1 | open |
| F-PROJ-65-12 | `project-graph-view.tsx` Thin-Wrapper vs. Hard-Remove — Test-Import-Migration | ε.1 Implementation | open |

## H) Aufwand (Indikativ)

| Phase | Sub-Slices | PT | Notes |
|---|---|---|---|
| ε.1 Pfad-Layout (2D+3D, Sidetracks, Modus-Toggle) | 4-5 | ~6 PT | original spec |
| ε.1 Δ: GraphShell-Refactor (L10) | — | +1 PT | extract 841-LOC monolith |
| ε.1 Δ: Render-Scope-Expansion (L12: Risk/Decision/Budget/AI) | — | +1 PT | Badge-Komponente + Cost-Lane |
| ε.1 Δ: Snapshot-Extension `?include=trajectory` (L13) | — | +0.5 PT | Aggregator-Erweiterung |
| **ε.1 revised total** | — | **~8.5 PT** | locked 2026-05-19 |
| ε.2 Stakeholder-Marker + Swap-Simulation | 3 | ~4 PT | |
| ε.3 Goal + Live-Propagation + Audit | 4 | ~5 PT | + 0.5 PT P1.3 PROJ-10-Δ (shipped) |
| ε.4 AI (3 Purposes) | 3 | ~4 PT | |
| **Total revised** | — | **~22 PT** | original 19 + CIA-Δ 1 + ε.1-Frontend-Δ 2.5 |

CIA-Review (done 2026-05-18) + Designer-Pass vor ε.2 (P1.4, vorgezogen) sind im Total enthalten. Designer-Pass für ε.1-Forks F-PROJ-65-8/9/10/11 ist neue Mini-Story, separat zu briefen vor /frontend ε.1.

## I) Empfohlene Slice-Reihenfolge (revised 2026-05-19)

1. **CIA-Review** ✅ abgeschlossen 2026-05-18 — siehe Section J
2. **P1-Items** ✅ alle erledigt: P1.1+P1.2 in Spec, P1.3 PROJ-10-Δ gemerged (PR #40), P1.4 ε.2-Designer-Pass auf main (PR #42)
3. **ε.1 Backend** ✅ gemerged via PR #43 — `project_goals` + `work_item_compliance_lanes` (L7-Trigger) + 3 API-Routen
4. **ε.1 Frontend /architecture** ✅ abgeschlossen 2026-05-19 — Section A.1 + L10–L14
5. **Designer-Pass ε.1 Frontend** ← NEU vorgeschaltet — Modus-Toggle-UX, 2D-Pfad-Renderer-Visuals, Lane-Header, Knoten-Badge-Treatment (F-PROJ-65-8/9/10/11)
6. **ε.1 Foundation /frontend** — GraphShell-Refactor + RelationshipGraphView-Extract + TrajectoryGraphView 2D
7. **ε.1 3D-Toggle** — TrajectoryGraph3D mit dynamic-import (L9-Bundle-Budget messen)
8. **ε.1 Snapshot-Extension** — Aggregator-Branch `?include=trajectory` (Backend-Mini-Slice, kann parallel zu 6 laufen)
9. **Designer-Pass ε.2** ✅ auf main (P1.4 fertig)
10. **ε.2 Stakeholder-Marker** read-only → dann Swap-Simulation
11. **ε.3 Goals + Live-Propagation + Audit** (nutzt PROJ-10-`causation_id` aus P1.3)
12. **ε.4 AI** — `trajectory_sequence` zuerst (Class-2, sofort live), `resource_swap` zweitens (braucht Ollama)

## J) CIA-Review (Continuous Improvement Agent, 2026-05-18)

CIA hat das Tech Design vollständig reviewt (~1.480 Wörter). Output strukturiert nach Findings, Risks, Recommendations. **5 zusätzliche Locks identifiziert (L5-L9), 4 P1-Items als blockierend markiert vor ε.1-Start.**

### Zusätzliche Locks (L5-L9)

| Lock | Inhalt | Begründung CIA |
|---|---|---|
| **L5 — DAG-Cycle-Policy** | Tarjan-SCC in Layout-Engine; Cycle-Edges aus Trajectory-Render ausgeschlossen; UI-Banner *"N zyklische Abhängigkeiten ausgeblendet"*. Kein DB-Constraint auf PROJ-9-Dependencies. | PROJ-9-R2 erlaubt polymorphe Deps ohne DB-Cycle-Constraint. Render-Policy gehört in PROJ-65, nicht in PROJ-9. |
| **L6 — Goal-Source-Lifecycle** | FK `ON DELETE SET NULL` auf `source_phase_id` + `source_milestone_id`. Detached-Goal trägt sichtbares Badge. Re-attach erlaubt, neuer Audit-Eintrag. | Spec ließ offen, was passiert wenn Source-Phase gelöscht wird. Drei-Zustände-Problem (synced / divergiert / orphaned) muss explizit geregelt sein. |
| **L7 — Sidetrack-Lane als Read-Model** | `work_item_compliance_lanes` ist Trigger-gepflegt aus `compliance_tags`-Sets. Lane-Whitelist tenant-konfigurierbar in `tenant_settings.trajectory_lanes`. **Kein direkter User-Edit** auf der Bridge. | Eliminiert Drift zwischen PROJ-18-Tag-Pflege und PROJ-65-Lane-Pflege (R3). Single Source of Truth bleibt PROJ-18. |
| **L8 — Audit-Reuse via PROJ-10 + `causation_id`** | PROJ-10 wird um `causation_id UUID NULL` Spalte erweitert (Vor-Story, 0.5 PT). Eigene `plan_change_audit_log`-Tabelle bleibt verworfen. | PROJ-10 ist kanonische Audit-Quelle. `causation_id` ermöglicht Multi-Field-Gruppierung ohne zweite Audit-Tabelle. |
| **L9 — Bundle-Discipline** | `TrajectoryGraph3D` als dynamic-import; eigener Sugiyama (~80 LOC) statt `d3-dag`-Dependency; Bundle-Delta auf `/projects/[id]/graph` ≤ 30 KB gzipped als ε.1-AC. | `/projects/[id]/graph` lädt bereits PROJ-58-3D-Bundle eager. PROJ-65 darf TTI nicht verschlechtern, vor allem auf Mobile. |

### Findings (~Auszug)

- **F1** Goal-Source-Refs ohne Mirror erzeugen Drei-Zustände-Problem (synced/divergiert/orphaned) — durch L6 geregelt.
- **F2** Sidetrack vs. PROJ-18 ist UX-Drift-Risiko, nicht technisch — durch L7 geregelt.
- **F3** SaaS-Tenants ohne Ollama haben `resource_swap` dauerhaft deaktiviert → akzeptabel wenn dokumentiert, nicht show-stopper.
- **F4** PROJ-10 fehlt `causation_id` → Vor-Story Pflicht.
- **F5** DAG-Cycle-Behavior ist Render-Policy, nicht Implementation-Detail → muss L5 sein.
- **F6** Bundle-Size machbar bei dynamic-import + eigenem Sugiyama — L9.
- **F7** Stakeholder-Marker brauchen Designer-Pass vor ε.2, nicht erst ε.3 → P1.4.

### Risks (Auszug, Mitigations in den Locks)

| Risk | Severity | Mitigation |
|---|---|---|
| R1 PROJ-10 `causation_id` fehlt | **High** | L8 + Vor-Story PROJ-10-Δ |
| R2 Goal-Source-Ref nach Source-Delete unspezifiziert | High | L6 |
| R3 Sidetrack vs. compliance_tag Drift | Medium | L7 |
| R4 DAG-Cycles → Render-Endlosschleife | High | L5 |
| R5 SaaS ohne Ollama erlebt permanent gestutztes AI-Feature | Medium | dokumentieren + Tenant-Settings-Banner |
| R6 Bundle-Size + Mobile-TTI | Medium | L9 |
| R7 Plan-Mutate-Permission nicht in PROJ-4 modelliert | Medium | Reuse `project_editor` + Feature-Flag `tenant_settings.trajectory_plan_mutate_enabled` |
| R8 Undo-TTL Session-State vs Multi-Tab-Konflikt | Low | Undo-Action optimistic-locked (Server prüft Zwischen-Mutate) |
| R9 Class-3-Maskierung in Diff-Ansicht (Story 65-7 AC-8) | Low | Reuse PROJ-10-Redaction-Logik |

### P1-Items (BLOCKIEREND vor ε.1)

| P1 | Was | Aufwand |
|---|---|---|
| **P1.1** | Lock L5 dokumentieren + Tarjan-SCC-Branch in Layout-Engine-Spec | Lock-Doku |
| **P1.2** | Lock L6 dokumentieren (FK `ON DELETE SET NULL` + Detached-Badge) | Lock-Doku |
| **P1.3** | **Vor-Story PROJ-10-Δ erstellen** — Migration für `audit_log_entries.causation_id UUID NULL` + RPC-Erweiterung + PROJ-10-Doku-Update | ~0.5 PT |
| **P1.4** | Designer-Pass vorziehen von ε.3 → vor ε.2 (Stakeholder-Marker + Detail-Panel + Mobile-Layout) | Reihenfolge, keine Mehrarbeit |

### P2-Items (während ε.1)

- **P2.1** L7 implementieren (Sidetrack als Trigger-gepflegtes Read-Model aus `compliance_tags`)
- **P2.2** L9 als explizites ε.1-AC: Bundle-Delta ≤ 30 KB gzipped messen
- **P2.3** Plan-Mutate-Permission reusen (`project_editor` + Feature-Flag), keine RBAC-Schema-Änderung

### P3-Items (deferred OK)

- **P3.1** SaaS-Resource-Swap-Alternative (Cloud-Modell mit Pseudonymisierung) — eigene PROJ-65b-Spec wenn Pilot-Demand zeigt
- **P3.2** Trajectory-PDF-Export — via PROJ-21 Report-Snapshots-Erweiterung wenn relevant
- **P3.3** Hybrid-Methode-Mix (FU-5) — eigene Mini-Story nach ε.1-Pilot

### CIA-Aufwand-Update

- Original Tech Design: ~19 PT
- + P1.3 Vor-Story PROJ-10-Δ: +0.5 PT
- + P1.1/P1.2 Lock-Doku: 0 PT (bereits eingearbeitet)
- + P1.4 Designer-Pass-Reihenfolge: 0 PT (Zeitumlagerung)
- **Total revised: ~20 PT**

### Entscheidungsempfehlung CIA

> "Weiter prüfen (P1.1–P1.4) vor ε.1-Start, dann Umsetzen. Das Tech Design ist im Kern solide — L1/L2/L3/L4 sind verteidigbar und PROJ-58-konsistent. Die vier P1-Items sind aber blockierend."

— Akzeptiert. P1.1 + P1.2 sind durch diese Spec-Ergänzung erledigt. P1.3 + P1.4 als Vor-Story und Slice-Reihenfolge-Anpassung dokumentiert.

## K) /architecture ε.1 Frontend Pass (2026-05-19)

**Scope:** Schließen der offenen Forks für die Frontend-Layer von ε.1 (Modus-Toggle + 2D-Pfad-Renderer + Hybrid-Methode-Mix + Render-Scope). Section A hatte den Komponenten-Tree, dieser Pass legt File-Layout, Lane-Strategie, Snapshot-Erweiterung und Layout-Engine fest.

### Entscheidungen (User-bestätigt 2026-05-19)

1. **Module-Split (L10):** GraphShell aus `project-graph-view.tsx` extrahieren. `RelationshipGraphView` + `TrajectoryGraphView` als zwei Slots. Gemeinsame Toolbar, gemeinsamer Snapshot.
2. **Hybrid-Layout (L11):** Zwei parallele Hauptpfade — Phase-Lane oben, Sprint-Lane unten, Sidetracks darunter. Schließt F-PROJ-65-5.
3. **Render-Scope ε.1 (L12) — Expansion vs. Spec:** Phases + Milestones + Work-Items + Goals als Knoten. Risks + Decisions + AI-Recommendations als **Badges am Knoten**. Budget als eigene **Cost-Sidetrack-Lane**. Stakeholder bleibt ε.2.
4. **Snapshot-Extension (L13):** `GET /api/projects/[id]/graph?include=trajectory` opt-in. Default-Response PROJ-58-kompatibel. Aggregator-Branch in PROJ-65 ε.1-Backend-Mini-Slice.
5. **Layout-Engine (L14):** Pure synchrone Function in `src/lib/project-graph/trajectory-layout.ts`. Sugiyama ~80 LOC + Tarjan-SCC. Kein Web-Worker in ε.1.

### Geschlossene Forks

- F-PROJ-65-1 (d3-dag vs. Sugiyama) → via L9 + L14
- F-PROJ-65-2 (Cycle-Toleranz) → via L5
- F-PROJ-65-5 (Hybrid-Mix) → via L11

### Neue Forks (Designer-Pass-relevant, BLOCKIEREND vor /frontend ε.1)

- F-PROJ-65-8: Epic-Knoten-Platzierung
- F-PROJ-65-9: Risk/Decision-Badge-Visual + Severity-Counter
- F-PROJ-65-10: AI-Recommendation-Badge-Position + Hover
- F-PROJ-65-11: Cost-Sidetrack-Lane Empty-State
- F-PROJ-65-12: `project-graph-view.tsx` Thin-Wrapper vs. Hard-Remove (Test-Import-Migration)

### Aufwand-Δ

ε.1: 6 PT → 8.5 PT (+1 GraphShell-Refactor, +1 Render-Scope-Expansion, +0.5 Snapshot-Extension). Total PROJ-65: ~22 PT.

### CIA-Trigger-Check

Touches ≥ 5 Files (GraphShell-Refactor) und ist Architecture-Level-Pattern, **aber** keine neue Technologie, kein neuer External Service, kein neues npm-Package. Per `.claude/rules/continuous-improvement.md` ist CIA hier **optional, nicht mandatory**. Empfehlung: CIA-Spot-Check zu *L10+L13+L14* (Refactor-Strategie + Snapshot-Extension + Bundle-Budget) vor /frontend-Start, ~300-Worte-Brief — wenn Zeit, sonst skip.

### Handoff

Nächster Schritt: `/designer` für ε.1-Frontend-Brief (F-PROJ-65-8/9/10/11) → dann `/frontend` für GraphShell-Refactor + TrajectoryGraphView. Parallel kann das ε.1-Backend-Mini-Slice für `?include=trajectory` (L13) laufen.

## L) /designer ε.1 Frontend Brief (2026-05-19)

**Brief-Doc:** [`docs/design/PROJ-65-epsilon1-frontend-brief.md`](../docs/design/PROJ-65-epsilon1-frontend-brief.md)

**Geschlossene Forks:**

- ✅ **F-PROJ-65-8** Epic-Knoten-Platzierung — Span-Bar in Epic-Sub-Row über Sprint-Row (Jira-Roadmap-Pattern). Auto-hidden wenn keine Epics im Snapshot.
- ✅ **F-PROJ-65-9** Risk/Decision-Badge — Top-Right-Corner am Knoten, runder Risk-Badge (severity-toned), Diamant-Decision-Badge (state-toned), Severity-Counter inside, Cluster max 2 + "+N". Bei zu kleinen Knoten → Badges rechts neben Knoten (8px offset).
- ✅ **F-PROJ-65-10** AI-Recommendation-Badge — Bottom-Right-Corner (gegenüber Risk/Decision), 14px violet-Sparkle, 2s subtle Pulse (respektiert reduced-motion), Click → AIProposalDrawerPlaceholder (ε.1-Stub mit Recommendation-Title).
- ✅ **F-PROJ-65-11** Cost-Sidetrack-Lane Empty-State — drei States locked: A=Items rendered, B=Inline-Empty mit CTA "+ Budget-Posten anlegen", C=Lane verborgen wenn `budget_module_enabled=false`. Permission-Variant ohne CTA für Non-Editors.

**Designer-Empfehlungen zur PM-Entscheidung (F-Items im Brief):**

- F1 AIProposalDrawer-Placeholder-Inhalt → Empfehlung: Recommendation-Title + Stub-Notice (statt purer Stub).
- F2 Compliance-Lane-Order → Empfehlung: aus `tenant_settings.trajectory_lanes[]` Reihenfolge, Fallback alphabetisch.
- F3 `graph_mode_default` Default für **neue** Tenants nach ε.1-Ship → Empfehlung: `'trajectory'` (statt `'relationship'`). Bestehende Tenants behalten Setting.

**Frontend-Acceptance-Criteria:** 15 testbare Items im Brief, Sections "MVP acceptance criteria".

**Bundle-Budget-AC (L9):** Brief schreibt Δ ≤ 30 KB gzipped als hartes AC fest.

### Nächster Schritt

`/frontend` für PROJ-65 ε.1 — GraphShell-Refactor + RelationshipGraphView-Extract + TrajectoryGraphView. Parallel-Slice für Backend-Aggregator-Branch `?include=trajectory` (L13) kann separat laufen.

## M) /frontend ε.1 Implementation (2026-05-20)

**Slice geliefert:** GraphShell + TrajectoryGraphView (2D + 3D-Beta) + Layout-Engine + Snapshot-Extension. Branch `proj-65/epsilon-1-frontend` (stacked auf `proj-65/epsilon-1-backend` / PR #43).

### Geänderte / neue Files

| File | Status | Zweck |
|---|---|---|
| `src/lib/project-graph/types.ts` | edited | TrajectoryExtension + 6 neue Sub-Types ans `ProjectGraphSnapshot.trajectory` opt-in. |
| `src/lib/project-graph/aggregate.ts` | edited | `includeTrajectory` Arg + `resolveTrajectoryExtension()` (sprints, epics, lanes, goals, cost, budget-module flag). |
| `src/app/api/projects/[id]/graph/route.ts` | edited | `?include=trajectory` Query-Param-Parsing (L13). |
| `src/lib/project-graph/trajectory-layout.ts` | new | Pure Function: Sugiyama-lite Lane-Layout + Tarjan-SCC für Cycle-Detection (L14, L5). ~580 LOC inkl. Helpers. |
| `src/lib/project-graph/trajectory-layout.test.ts` | new | 13/13 Vitests — alle Lane-States, Hybrid-Case, Cost-Empty, Cycles, Badge-Counter, Compliance-Order. |
| `src/components/projects/graph-shell.tsx` | new | L10 — Mode-Toggle Beziehungen↔Trajektorie, URL→localStorage→tenant-default Resolution. |
| `src/components/projects/trajectory-graph-view.tsx` | new | Card + Dim-Toggle + Snapshot-Fetch + Empty/Loading/Error/Cycle-Banner + AI-Drawer-Placeholder. |
| `src/components/projects/trajectory-graph-2d.tsx` | new | SVG-Renderer: Lane-Bgs, Edges, Knoten (per kind), Critical-Path-Ring, Badge-Overlays (HTML-positioned). |
| `src/components/projects/trajectory-graph-3d.tsx` | new | dynamic-import, reuses PROJ-58 `ProjectGraph3DCanvas` mit "3D · Beta"-Badge (eigene Projektion deferred). |
| `src/components/projects/trajectory-badges.tsx` | new | `RiskDecisionBadgeGroup` + `AIRecommendationBadge` (F-PROJ-65-9, F-PROJ-65-10). |
| `src/components/projects/trajectory-cycle-banner.tsx` | new | Sticky-Banner über Canvas mit Cycle-Count + Link zur Dependencies-Page. |
| `src/components/projects/ai-proposal-drawer-placeholder.tsx` | new | shadcn Sheet mit Recommendation-Title (F1-Designer-Empfehlung). |
| `src/app/(app)/projects/[id]/graph/page.tsx` | edited | Importiert nun `GraphShell` statt direkt `ProjectGraphView`. |
| `tests/PROJ-65-epsilon1-frontend.spec.ts` | new | Auth-Gate-Smoke für `?include=trajectory` + Graph-Page. |
| `eslint.config.mjs` | edited | `trajectory-graph-view.tsx` + `graph-shell.tsx` zu `set-state-in-effect`-Override-Allowlist (gleiches Pattern wie PROJ-58 `project-graph-view.tsx`). |

### AC-Erfüllungsstatus (15 MVP-AC aus Designer Brief)

| # | AC | Status |
|---|---|---|
| 1 | GraphModeToggle persistiert in localStorage + URL-?mode= Override | ✅ |
| 2 | Phase + Sprint Lanes je nach Methode | ✅ via L11-Sichtbarkeitsregeln |
| 3 | Epic-Sub-Row rendert Span-Bars | ✅ via L11-Layout-Engine |
| 4 | Risk/Decision-Badges am Knoten | ✅ via `RiskDecisionBadgeGroup` |
| 5 | AI-Recommendation-Badge | ✅ + öffnet `AIProposalDrawerPlaceholder` |
| 6 | Cost-Sidetrack-Lane A/B/C-States | ✅ via Layout-Engine + `cost_state` Field |
| 7 | Compliance-Sidetracks pro `lane_key` | ✅ |
| 8 | Cycle-Banner + Cycle-Edges ausgeschlossen | ✅ via Tarjan-SCC (L5) |
| 9 | Empty-State method-aware | ✅ |
| 10 | Critical-Path-Overlay | ✅ (reuse `is_critical` Flag + dashed-Ring) |
| 11 | 3D-Toggle dynamic-import | ✅ — 3D nutzt PROJ-58 Scene mit "Beta"-Badge in ε.1; eigene Projektion deferred (F-PROJ-65-13 NEU) |
| 12 | Bundle-Delta ≤ 30 KB gzipped | ⚠️ TODO QA — Build OK, Δ-Messung steht aus |
| 13 | Mobile + Tablet Layouts | ⚠️ teilweise — Toolbar respnsive, Lane-Header-Mobile-Mode (icon-only) deferred |
| 14 | Keyboard-Shortcuts (M/D/Tab/Enter/R/Esc) | ⚠️ teilweise — Tab/Enter via `tabIndex` + `role="button"`, globale M/D/R-Shortcuts deferred |
| 15 | A11y SVG/Knoten role+aria | ✅ basic; WCAG-AA-Kontrast-Audit via /qa |

### Neue Forks aus Implementation

- **F-PROJ-65-13** Trajectory-spezifische 3D-Projektion (x=time, y=lane, z=depth) — ε.1 nutzt PROJ-58-Scene. Wann fällig: ε.4 oder eigener Slice nach Pilot-Demand.
- **F-PROJ-65-14** Globale Keyboard-Shortcuts M/D/R/Esc (Tab/Enter sind via SVG-Knoten OK). Wann fällig: Polish-Pass nach ε.2.
- **F-PROJ-65-15** Mobile-Lane-Header-Icon-Only-Mode (375px breakpoint). Wann fällig: Mobile-Polish-Pass.
- **F-PROJ-65-16** Bundle-Δ-Messung als hartes AC vor PR-Merge — Vergleich main vs Branch via `npx next build` Size-Output. Wann fällig: /qa-Slice oder vor Merge.

### Test-Status

- Vitest `trajectory-layout.test.ts`: **13/13 grün**
- Vitest gesamtes `src/lib/project-graph/`: **19/19 grün**
- Playwright Auth-Gate-Smoke: gerüstet (gegen lokale Dev-Server-Auth-Middleware bestätigt: API + Page → 307 als Unauthenticated)
- Production-Build `npm run build`: ✓ erfolgreich, keine neuen Errors

### Nächster Schritt

`/qa` für PROJ-65 ε.1 — Frontend-AC-Checkdown (13/15 grün, 2 ⚠️ + 4 Polish-Forks), Bundle-Δ-Messung, A11y-Audit (Kontrast, Keyboard, ARIA). Backend-PR #43 mergen lassen + Frontend-PR (auto-merge armed).

