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



