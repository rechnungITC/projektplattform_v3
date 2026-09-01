# PROJ-133: Graph-delegated Teams Sender (named user/bot)

## Status

Planned (Followup)

**Created:** 2026-06-15
**Last Updated:** 2026-09-01

> **Geerdet am 2026-09-01 (PROJ-166): die Kostenschätzung ist überholt, das Urteil
> „bedarfsgetrieben" bleibt.** Der teuerste der vier Kostentreiber unten — der per-Mandant-Store für
> Refresh-Token samt Erneuerungs-Lebenszyklus und OAuth2-Authorization-Code-Flow — wird von
> **PROJ-158-β** gebaut. Liefert 158-β, sinkt diese Story auf „Graph-Aufruf auf vorhandener
> Auth-Infrastruktur". Siehe Erdungsabschnitt am Dateiende.
**Origin:** CIA review of PROJ-49 (2026-06-15) — split-out of the heavier transport.
**Priority:** P2 — pilot-demand-driven.

## Summary

Send Microsoft Teams **channel** messages from a **named user or bot identity** via Microsoft Graph with **delegated** authentication. This is the heavier alternative to the PROJ-49 Workflows-Webhook adapter, deliberately split out: it requires an OAuth2 authorization-code flow, a per-tenant **refresh-token store**, admin consent for `ChannelMessage.Send`, and a real sender identity that appears on each message (`from.user`).

Build this **only when a pilot explicitly needs** messages to originate from a recognizable user/bot (not the generic "Workflows" sender that PROJ-49 produces).

## Problem / Context

CIA (2026-06-15) established that Microsoft Graph **app-only** (client-credentials) channel posting is structurally unavailable — `POST /teams/{id}/channels/{id}/messages` admits only the `Teamwork.Migrate.All` application permission, limited to data migration. The only Graph path to a real channel post is **delegated** (user context). PROJ-49 therefore ships the dep-free Workflows-Webhook adapter; this spec captures the delegated-Graph path as a separate, larger effort.

## Why this is its own spec (not part of PROJ-49)

- New persistence pattern: per-tenant **refresh-token store** (encrypted), token-refresh lifecycle, expiry/offboarding handling.
- New auth surface: OAuth2 authorization-code consent flow + admin-consent prerequisites.
- Sender-identity coupling: a real user/service identity whose offboarding breaks delivery.
- Likely a dependency decision revisited (`@azure/identity`/MSAL vs raw OAuth2) — CIA-gated.

These would each blow past the lean single-adapter PROJ-49 outbox swap (>5 files, new pattern).

## Provisional User Stories (to refine via `/requirements` when promoted)

- As a tenant admin, I want to connect a Teams sender identity via Microsoft consent, so channel messages appear from a recognizable user/bot.
- As the system, I want refresh tokens stored encrypted and auto-refreshed, so delivery survives access-token expiry without re-consent.
- As a compliance owner, I want delegated-send audited and the Class-3 block honored unchanged.

## Dependencies

- Requires: PROJ-49 (Workflows-Webhook adapter + Teams connector wiring), PROJ-13 outbox, PROJ-14 tenant_secrets.
- CIA review MANDATORY before build (delegated-auth model + dependency + refresh-token storage).

## Out of Scope (until promoted)

- Inbound Teams, Adaptive Cards/buttons (own follow-ups), tenant-wide app-install automation.

## Notes

Promote via `/requirements` (split into proper user stories + ACs) + CIA review only on concrete pilot demand. Until then this is a parking spot so the PROJ-49 CIA decision isn't lost.

## Geerdet am 2026-09-01 (PROJ-166)

### Was sich geändert hat: nicht die Fachlichkeit, die Kostenschätzung

Diese Spec begründet ihre Größe mit vier Punkten. Der **erste und teuerste** war ein neues
Persistenzmuster: „per-tenant **refresh-token store** (encrypted), token-refresh lifecycle,
expiry/offboarding handling", dazu „OAuth2 authorization-code consent flow + admin-consent
prerequisites".

**Genau das ist der Gegenstand von PROJ-158-β.** Dessen Architekturentscheide vom 2026-08-31 nennen
ausdrücklich:

- **Q1** — feste Rückleitungsadresse je Umgebung, Zuordnung über einen einmaligen serverseitigen
  Begleitwert (Muster PROJ-31/48), weil die Anbieter eine Vorab-Registrierung verlangen.
- **Q3** — Token-Erneuerung beim Zugriff mit einem Wiederholungsversuch; der Preis ist benannt
  („zwischen zwei Prüfungen bleibt ein Widerruf unsichtbar").
- **Q4** — **mandanteneigene** Anwendungsregistrierung nach dem Hausmuster tenant-eigener Schlüssel
  (PROJ-32/92), womit auch die Admin-Consent-Voraussetzung beim Kunden liegt statt beim Betreiber.

Ferner ist PROJ-158s tragende Messung deckungsgleich mit der Lage hier: bei Microsoft 365 ist OAuth
seit 2026 **Pflicht**, Basic-Auth wird zu 100 % abgewiesen. Die Auth-Infrastruktur entsteht also
nicht, weil PROJ-133 sie braucht, sondern weil der Mail-Eingang ohne sie nicht existiert.

### Was unverändert gilt

- **Der Trigger.** Bauen **nur**, wenn ein Pilot eine erkennbare Absenderidentität braucht statt des
  generischen Workflows-Absenders aus PROJ-49. Das ist keine technische, sondern eine Produktfrage.
- **Der CIA-Befund von 2026-06-15.** Graph **app-only** für Kanalbeiträge ist strukturell nicht
  verfügbar (`Teamwork.Migrate.All` ist eine Migrations-Berechtigung); der einzige Weg zu einem
  echten Kanalbeitrag ist **delegiert**. Nichts daran hat sich geändert.
- **Kein offenes Akzeptanzkriterium von PROJ-49.** Das Register führt PROJ-133 als **neue Fähigkeit**,
  weil PROJ-49s Spec „Graph **oder** Webhook" erlaubt — die Zeile ist keine Auslassung, sondern eine
  Erweiterung.

### Was diese Erdung nicht entschieden hat

Ob der Token-Store aus PROJ-158-β **wiederverwendbar** ist oder mail-spezifisch bleibt. Das ist eine
Architekturfrage für den Zeitpunkt, an dem PROJ-133 promotet wird — und sie ist erst nach 158-β
beantwortbar, nicht heute. Die Antwort entscheidet, ob PROJ-133 eine kleine oder eine mittlere Slice
wird; sie hier zu raten hätte die Kostenschätzung nur durch eine neue ersetzt.
