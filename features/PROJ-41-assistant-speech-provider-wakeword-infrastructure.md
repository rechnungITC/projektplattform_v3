# PROJ-41: Assistant Speech, Provider & Wake-Word Infrastructure

## Status: Approved (Assistant core MVP slice; QA ready 2026-05-18)
**Created:** 2026-05-04
**Last Updated:** 2026-05-18

## Origin
Diese Spec schließt die technische Infrastrukturlücke des Assistant-Strangs. PROJ-37 bis PROJ-40 definieren Produktverhalten, Runtime, Action Packs und Governance. Es fehlt noch die explizite Infrastruktur-Spec für Speech-to-Text, Text-to-Speech, Wake-Word/Pushto-Talk-Betriebsarten, Providerwahl, Kostenkontrolle und Browser-/Deployment-Voraussetzungen.

## Summary
Builds the speech and provider infrastructure behind the assistant: microphone access strategy, speech-to-text pipeline, text-to-speech pipeline, optional wake-word mode, local-vs-external provider selection, fallback behavior, provider health checks, tenant-level controls, and deployment/browser capability gates. The goal is to make voice a governed platform capability rather than an ad-hoc frontend experiment.

## Dependencies
- Requires: PROJ-12 (privacy classification + provider routing)
- Requires: PROJ-17 (tenant settings)
- Requires: PROJ-37 (assistant UX)
- Requires: PROJ-38 (orchestrator runtime)
- Requires: PROJ-40 (conversation governance)
- Influences: deployment/security headers, future mobile/native assistant variants

## User Stories

1. **Reliable speech path** — Als Nutzer möchte ich, dass Spracheingabe und -ausgabe zuverlässig funktionieren oder sauber auf Text zurückfallen, damit der Assistant nicht zufällig unbenutzbar wird.

2. **Provider control** — Als Tenant-Admin möchte ich steuern können, welche Speech-/TTS-/Wake-Word-Provider genutzt werden, damit Kosten, Datenschutz und Betriebsmodell beherrschbar bleiben.

3. **Wake-word as optional mode** — Als Nutzer möchte ich optional einen Wake-Word-Modus nutzen können, aber nicht darauf angewiesen sein, damit der Assistant auch ohne always-listening robust bleibt.

4. **Deployment compatibility** — Als Betreiber möchte ich wissen, welche Browser-/Header-/Mikrofonvoraussetzungen gelten, damit Voice im Deployment nicht versehentlich technisch blockiert wird.

## Acceptance Criteria

### A. Speech-to-Text Infrastructure
- [ ] Es existiert ein klar definierter Speech-to-Text-Abstraktionslayer mit mindestens:
  - browser-native path
  - external provider path
  - unavailable/fallback path
- [ ] Browser ohne STT-Support oder ohne Mikrofonberechtigung fallen sauber auf Textinput zurück.
- [ ] STT-Providerwahl ist tenant- oder systemseitig konfigurierbar.
- [ ] STT-Requests laufen durch dieselben Privacy-/Class-3-Regeln wie andere Assistant-Inhalte.

### B. Text-to-Speech Infrastructure
- [ ] Assistent kann Antworten optional als Audio ausgeben.
- [ ] Es gibt mindestens:
  - browser-native TTS path
  - external/local provider path
  - text-only fallback
- [ ] Nutzer kann Audioausgabe abschalten.

### C. Wake-Word / Push-to-Talk Modes
- [ ] Push-to-talk ist der robuste Basispfad.
- [ ] Wake-word ist als optionaler Modus modelliert, nicht als zwingender Kernpfad.
- [ ] Wake-word kann tenant- oder user-seitig deaktiviert werden.
- [ ] Always-listening ist klar sichtbar und jederzeit abbrechbar.

### D. Provider / Cost / Health Controls
- [ ] Speech-bezogene Provider haben Health-/Availability-Sicht analog anderer Plattformintegrationen.
- [ ] Tenant/System kann Provider je Funktionsart konfigurieren:
  - STT
  - TTS
  - optional wake-word engine
- [ ] Kosten- oder Nutzungsgrenzen können später an PROJ-32 andocken; diese Slice definiert die notwendigen Anschlussstellen.

### E. Browser / Deployment Requirements
- [ ] Deployment-Doku nennt explizit die benötigten Browser-/Permissions-Policy-Voraussetzungen für Mikrofon.
- [ ] Security Headers erlauben Mikrofon nur so weit wie für den Assistant nötig; keine unnötige Sensorfreigabe.
- [ ] Voice-Feature bleibt funktionsfähig im Textmodus, wenn restriktive Policies aktiv bleiben.

## Edge Cases
- **Mikrofonberechtigung verweigert** → sauberer Text-Fallback.
- **Browser unterstützt Web Speech nicht** → externer/local provider oder Text-Fallback.
- **Wake-word zu unzuverlässig / falsch getriggert** → Push-to-talk bleibt primärer Pfad.
- **Speech provider down** → Assistant bleibt als Text-Assistant benutzbar.
- **Speech provider wäre extern, Inhalt aber class-3** → lokaler Pfad oder Block/Fallback.

## Technical Requirements
- **Abstraction-first:** keine harte Kopplung des UI direkt an einen Browser- oder SaaS-Provider
- **Privacy-aware:** speech payloads classified and governed
- **Tenant-aware:** config/gating in tenant settings
- **Observability:** provider health and fallback reasons inspectable
- **Deployment-aware:** headers, permissions and browser support documented

## Out of Scope
- Native mobile speech stacks
- Offline on-device wake-word models in the very first slice
- speaker diarization / multi-person meeting transcription
- general-purpose dictation outside the assistant

## Suggested Slice Plan
- **41-α STT/TTS abstraction + browser fallback**
- **41-β provider configuration + health surfaces**
- **41-γ wake-word experiment behind feature flag**
- **41-δ deployment/security-header integration**

## Tech Design (Solution Architect)

### Scope Decision

PROJ-41 starts with browser-native STT/TTS adapters and a text-only fallback. External speech providers and wake-word engines are represented as policy/configuration options, but not activated by default.

### Capability Structure

Speech Infrastructure
+-- Speech-to-Text
    +-- browser-native adapter
    +-- unavailable fallback
    +-- external provider slot for later
+-- Text-to-Speech
    +-- browser-native adapter
    +-- text-only fallback
    +-- external/local provider slot for later
+-- Activation Modes
    +-- push-to-talk default
    +-- wake-word disabled by default
+-- Provider Policy
    +-- tenant settings
    +-- class-3 block/fallback
    +-- capability reporting to UI

### Tech Decisions

- The UI never assumes speech support; it checks capability and keeps text input visible.
- Browser TTS can be disabled by the user in the overlay without changing tenant settings.
- Wake-word is modeled as a future feature flag and remains off in MVP.
- Class-3-sensitive content must not be routed to an external speech provider without the same policy gates as other AI paths.

### Dependencies

No package is added for the first slice. Browser APIs are wrapped behind a small local abstraction so later provider work does not rewrite the Assistant overlay.

## Implementation Notes (2026-05-18)

- Added a local speech capability abstraction for browser STT/TTS availability and provider policy normalization.
- The Assistant overlay uses browser `SpeechRecognition` / `webkitSpeechRecognition` when available, keeps text input visible at all times, and supports optional browser `speechSynthesis` output.
- External speech providers, provider health surfaces, and wake-word runtime are represented by settings but intentionally remain inactive in this MVP slice.

## QA Test Results (2026-05-18)

- Speech abstraction tests cover browser support detection and fallback reporting.
- The focused Chromium E2E verifies unauthenticated users do not see the authenticated Assistant launcher; full cross-browser voice validation remains deferred until browser/system speech capabilities are available in the test host.
- Final pre-deploy pass on branch `assistant/proj37-41-deploy`: `npm test`, `npm run lint`, `npm run build`, focused Chromium Playwright, `npm audit` with 0 high/critical, and production schema-drift guard all passed. Production-ready decision: READY for the Assistant core MVP.
