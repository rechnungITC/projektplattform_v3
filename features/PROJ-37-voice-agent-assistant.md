# PROJ-37: Voice Agent Assistant ("Hey Sven")

## Status: Planned
**Created:** 2026-05-04
**Last Updated:** 2026-05-04

## Origin
Diese Spec entstand aus der Anforderung, einen sprachgesteuerten Assistenten in die Plattform zu integrieren, der per Wake-Phrase (z. B. "Hey Sven") geöffnet wird, natürlichsprachlich antwortet und konkrete Projektaktionen ausführen kann, etwa Status abrufen oder neue Projekte anlegen.

## Summary
Builds a first-class in-app voice assistant for the project platform: wake phrase or push-to-talk activation, speech input/output, a conversational overlay, project-aware status retrieval, and action execution via reviewed agent/tool flows. The assistant is not a generic chatbot bolted onto the UI; it is a governed orchestration layer over existing platform capabilities (project creation, project lookup, project status, reports, AI proposal routing). It must preserve the platform's existing invariants: multi-tenant isolation, no silent business-data mutation, auditable execution, and class-3 privacy controls.

## Dependencies
- Requires: PROJ-1 (Auth, Tenants, Roles) — assistant identity and tenant scoping
- Requires: PROJ-2 (Project CRUD) — assistant can create and locate projects
- Requires: PROJ-4 (RBAC Enforcement) — assistant actions obey user/project role
- Requires: PROJ-5 (Wizard) — project creation may delegate to structured wizard flow
- Requires: PROJ-12 (AI privacy + routing) — voice transcripts and prompts must obey class-3 restrictions
- Requires: PROJ-13 (Communication Center) — optional future voice-to-message handoff
- Requires: PROJ-14 (MCP bridge / tool integration) — execution path should prefer MCP-exposed tools
- Requires: PROJ-17 (Tenant settings) — per-tenant enablement, provider choice, privacy defaults
- Influences: PROJ-21 (reports as assistant-readable output), PROJ-30 (narrative purpose), PROJ-32 (tenant AI keys)
- Requires CIA review before architecture/implementation, because this introduces new runtime UX, speech stack, and assistant/tool orchestration decisions

## User Stories

1. **Wake + speak** — Als Projektleiter möchte ich "Hey Sven" sagen oder einen Mikrofon-Button drücken und direkt mit der Plattform sprechen können, damit ich ohne Tippen schnell Informationen bekomme oder Aufgaben starte.

2. **Current project status** — Als Nutzer möchte ich fragen können "Wie ist der aktuelle Stand zum Projekt X?" und eine sprachliche sowie visuelle Antwort erhalten, damit ich den Projektstatus schnell erfasse.

3. **Project creation by conversation** — Als Nutzer möchte ich sagen können "Erstelle mir ein neues Projekt zum Thema ..." und danach dialogisch durch die nötigen Fragen geführt werden, damit aus einer Idee ein sauber strukturierter Projektentwurf wird.

4. **Command execution with guardrails** — Als Nutzer möchte ich, dass der Assistent konkrete Aktionen ausführt, aber nur innerhalb meiner Rechte und mit klarer Bestätigung bei riskanten Änderungen, damit ich produktiv arbeiten kann ohne Kontrollverlust.

5. **Hands-free navigation** — Als Nutzer möchte ich per Sprache in relevante Bereiche wie Projekte, Risiken, Entscheidungen oder Reports springen können, damit ich die Plattform freihändig bedienen kann.

6. **Context retention** — Als Nutzer möchte ich, dass der Assistent den Gesprächskontext innerhalb einer Sitzung behält (aktuelles Projekt, letzter Auftrag, offene Rückfrage), damit ich nicht jedes Mal von vorne anfangen muss.

7. **Privacy-preserving voice UX** — Als Tenant-Admin möchte ich, dass Audio, Transkripte und aus Sprache abgeleitete Aktionen denselben Datenschutz- und Audit-Regeln folgen wie andere KI-Funktionen, damit Sprache kein Sicherheitsloch wird.

## Acceptance Criteria

### A. Activation + Interaction Model
- [ ] Ein global erreichbarer "Voice Assistant"-Entry-Point existiert in der App-Shell (Mikrofon-Button / Hotkey / Launcher).
- [ ] Optionaler Wake-Phrase-Modus "`Hey Sven`" ist als separater Betriebsmodus spezifiziert; MVP darf mit Push-to-Talk starten, wenn Wake-Word im Browser zu unzuverlässig ist.
- [ ] Beim Aktivieren öffnet sich ein Assistant-Overlay mit drei Zuständen: `listening`, `thinking`, `responding`.
- [ ] Nutzer sieht immer, ob gerade Audio aufgenommen wird.
- [ ] Nutzer kann Aufnahme und Antwort jederzeit abbrechen.

### B. Speech Input / Output
- [ ] Spracheingabe wird in Text transkribiert und der erkannte Text im UI angezeigt, bevor oder während der Assistent antwortet.
- [ ] Assistent kann Antworten sowohl als Text im Overlay als auch optional als Audio ausgeben.
- [ ] Falls Speech-to-Text oder Text-to-Speech nicht verfügbar ist, degradiert die Funktion sauber auf textbasiertes Chat-Overlay statt komplett auszufallen.
- [ ] Audio wird nicht dauerhaft gespeichert, außer ein Tenant aktiviert explizit Audit-/Retention-Funktionen dafür in einer späteren Slice.

### C. Conversational Project Assistance
- [ ] Assistent kann Fragen zum aktuellen Projektstatus beantworten, z. B. Überblick, Risiken, Entscheidungen, Milestones, offene Punkte.
- [ ] Antwort basiert auf echten Plattformdaten des berechtigten Tenants/Projekts, nicht auf freiem Halluzinationsmodus.
- [ ] Für Statusantworten nennt der Assistent die Datenbasis erkennbar, z. B. aktuelles Projekt, Snapshot, Risiken, Milestones.
- [ ] Bei fehlendem Projektkontext fragt der Assistent nach ("Welches Projekt meinst du?").

### D. Action Execution
- [ ] Assistent kann mindestens folgende Aktionen als erste Vertikale auslösen:
  - Projekt suchen / öffnen
  - neuen Projektentwurf anlegen
  - in Projektbereiche navigieren
  - Status-Report / Executive-Summary abrufen
- [ ] Aktionen werden als strukturierte Intents/Commands modelliert, nicht als freie Textmagie.
- [ ] Jede schreibende Aktion läuft über bestehende APIs / Wizard-Flows / MCP-Tools statt über versteckte Sonderpfade.
- [ ] Für schreibende oder folgenreiche Aktionen ist eine explizite Bestätigung nötig, bevor Business-Daten mutiert werden.
- [ ] Jede ausgeführte Aktion erzeugt einen auditierbaren Event mit Nutzer, Tenant, Projektbezug, Intent, Ergebnis.

### E. Project Creation by Conversation
- [ ] Wenn der Nutzer ein neues Projekt per Sprache anlegt, sammelt der Assistent die nötigen Felder dialogisch ein (Name, Typ, Methode, Beschreibung, ggf. Start/Ziel).
- [ ] Ergebnis ist zunächst ein Projektentwurf oder ein vorausgefüllter Wizard-State, keine unkontrollierte Direktanlage ohne Review.
- [ ] Der Nutzer sieht vor dem finalen Anlegen eine strukturierte Zusammenfassung zur Bestätigung.
- [ ] Method- und type-aware Fragen aus PROJ-5 bleiben erhalten; der Sprachassistent umgeht den Wizard nicht, sondern orchestriert ihn.

### F. Context + Session Memory
- [ ] Innerhalb einer Sitzung merkt sich der Assistent den aktuellen Gesprächskontext (aktuelles Projekt, letzte Rückfrage, letzter Intent).
- [ ] Kontext darf tenant- und nutzerübergreifend nie vermischt werden.
- [ ] Gesprächskontext verfällt kontrolliert (z. B. beim Logout, Tenant-Wechsel, Session-Ende).
- [ ] Optional persistente Konversationsspeicherung ist explizit deferred; MVP darf nur ephemeren Sitzungszustand haben.

### G. Security + Privacy
- [ ] Voice-/Transcript-Payloads durchlaufen denselben KI-Router-/Class-3-Schutz wie andere AI-Features.
- [ ] Externe Speech-/LLM-Provider dürfen bei class-3-relevanten Inhalten nicht ungeprüft genutzt werden.
- [ ] Assistent darf niemals Aktionen außerhalb der Rechte des aktuell angemeldeten Users ausführen.
- [ ] Tenant-Admins können die Voice-Assistant-Funktion tenantweit aktivieren/deaktivieren.
- [ ] Nutzer erhält klare Hinweise, wenn eine Funktion wegen Datenschutz, fehlender Rechte oder fehlender Provider-Konfiguration blockiert ist.

## Edge Cases
- **Browser hat kein Mikrofon oder Zugriff verweigert** → Fallback auf textbasiertes Assistant-Overlay mit klarer Meldung.
- **Wake phrase feuert versehentlich** → Nutzer kann sofort abbrechen; optionaler Wake-Word-Modus tenant- oder user-seitig deaktivierbar.
- **Transkript ist falsch erkannt** → Nutzer kann vor der Ausführung korrigieren oder die Ausführung abbrechen.
- **Nutzer sagt "erstelle Projekt" ohne genug Informationen** → Assistent fragt fehlende Pflichtfelder schrittweise nach.
- **Befehl betrifft fremdes oder nicht sichtbares Projekt** → Assistent antwortet neutral ohne Existenz-Leak.
- **Klasse-3-Inhalte in Sprache** → externer Provider-Call blockiert oder auf lokalen Pfad geroutet; Nutzer bekommt erklärende Rückmeldung.
- **Netzwerk-/Providerfehler während der Antwort** → Textuelle Fehlermeldung, keine halbe Aktion.
- **Nutzer wechselt Tenant mitten in der Sitzung** → Konversationskontext wird invalidiert und neu aufgebaut.

## Technical Requirements
- **Stack:** Next.js 16 App Router + TypeScript. Speech stack (browser-native Web Speech / external STT-TTS / local wake-word engine) wird in `/architecture` entschieden.
- **Execution model:** Intent-Orchestrierung über bestehende APIs und bevorzugt MCP-gebundene Tool-Aufrufe; keine zweite, parallele Business-Logik.
- **Multi-tenant:** Jede Sprachanfrage und jede Aktion muss tenant- und projektgebunden bleiben; keine globalen Konversationszustände.
- **Auditability:** Assistant-Intents und ausgeführte Aktionen müssen nachvollziehbar protokolliert werden.
- **Privacy:** Audio- und Transcript-Verarbeitung muss mit PROJ-12 / PROJ-32 kompatibel sein; Class-3-Hard-Block bleibt absolut.
- **Accessibility:** Overlay muss auch ohne Audio steuerbar sein; Tastatur-/Text-Alternative ist Pflicht.
- **Performance:** Assistant öffnet in < 500 ms; textuelle Erstreaktion nach Nutzerende sollte im Normalfall < 3 s sein.

## Out of Scope (für diese erste Spec)
- Vollständiger autonomer Agent, der längere Mehrschritt-Workflows ohne Bestätigung durchzieht
- Hintergrund-Lauschmodus auf Betriebssystemebene außerhalb der Web-App
- Permanente Speicherung aller Gespräche als Wissensbasis
- Telefonie / PSTN / mobile native assistant integration
- Voice biometrics / Sprechererkennung
- Freihändiges Editieren großer Formulare ohne Review-Schritt

## Open Questions for /architecture
- Browser-native Web Speech vs. externer STT/TTS-Dienst vs. lokales Modell
- Wake-word im Browser realistisch oder MVP bewusst Push-to-Talk?
- Intent-Layer als eigener Assistant-Orchestrator oder Erweiterung des bestehenden AI-Routers
- Welche Aktionen dürfen direkt ausgeführt werden, welche müssen immer auf Draft/Review gehen?
- Wie werden Assistant-Audit-Events modelliert, ohne PROJ-10 zu duplizieren?
- Wie soll per-tenant Provider-/Kostenkontrolle für Sprachfeatures an PROJ-32 andocken?

## Suggested Slice Plan
- **37-α Voice Overlay + Push-to-Talk + Text-Fallback** — UI shell, transcript display, minimal session context
- **37-β Intent Router + Read Actions** — Statusfragen, Navigation, Projektkontext, audit events
- **37-γ Conversational Project Creation** — Wizard orchestration, review-before-create
- **37-δ Speech Output + optional Wake Phrase** — TTS polish, wake-word experiment behind flag

## MVP Recommendation

### Recommended MVP Boundary
Der empfohlene MVP für die erste produktive Auslieferung von PROJ-37 ist:
- **IN:** Push-to-talk statt Wake-Word
- **IN:** Text-Overlay als Primär-UI mit optionaler Sprachaufnahme
- **IN:** Read-Actions (`Projektstatus`, `öffne Projekt`, `navigiere zu Risiken/Entscheidungen/Reports`)
- **IN:** Dialogischer Projektentwurf mit abschließendem Review
- **OUT:** Always-listening / Hintergrund-Hotword
- **OUT:** vollautonome Mehrschritt-Agenten
- **OUT:** persistente Gesprächshistorie als Wissensspeicher

### Why this MVP Cut
- Wake-word im Browser ist technisch deutlich fragiler als Push-to-talk.
- Der größte Nutzwert entsteht zuerst durch schnellen Projektkontext und sprachgesteuerte Navigation.
- Schreibende Aktionen müssen wegen Produktinvarianten auf Review/Draft-Pfade begrenzt bleiben.
- Die Plattform hat bereits starke strukturierte Flows (Wizard, Reports, Project Room), die der Assistent orchestrieren soll statt ersetzen.

### Recommended Delivery Order
1. **37-α** zuerst produktiv machen
2. **37-β** direkt danach, damit echter Nutzwert entsteht
3. **37-γ** erst nach stabilen Read-/Intent-Flows
4. **37-δ** nur hinter Flag und nach Architekturvalidierung

### Success Signals for MVP
- Nutzer kann den Assistant in < 2 Interaktionen öffnen und benutzen
- Statusfrage zu einem Projekt liefert in den meisten Fällen ohne Nachfragen eine brauchbare Antwort
- Projektentwurf per Sprache führt zuverlässig in einen bestätigbaren Draft/Wizard-State
- Keine ungeprüfte Business-Datenmutation
- Keine Tenant-/Rechteverletzung durch Assistant-Commands

## V2 Reference Material
- Kein direktes V2-Pendant als vollwertiger Sprachassistent bekannt. Architektur ist V3-spezifisch.
- Prüfen in `/architecture`, ob V2 bereits Chat-/Assistant-Dialogmuster oder MCP-nahe Tool-Orchestrierung hat, die wiederverwendbar als Vorbild dienen kann.

## Risks / Watchouts
- Wake-word-Erwartung des Users kann höher sein als die Web-Technik zuverlässig leisten kann; UX muss Push-to-talk als erstklassigen Pfad akzeptabel machen.
- Ein freier LLM-Dialog ohne sauberen Intent-Layer würde schnell gegen RBAC-, Audit- und No-silent-mutation-Regeln laufen.
- Speech-to-text-Fehler bei Projektnamen oder Domänenbegriffen können zu falschem Projektkontext führen; disambiguation ist Pflicht.
- Voice-Feature kann teuer werden, wenn Audio, STT, LLM und TTS in einem Call-Stack kombiniert werden; Provider-/Cost-Control muss früh mitgedacht werden.

