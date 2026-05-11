# PROJ-57: Participant, Stakeholder & Resource Linking Operating Model

## Status: In Progress (α + β-aggregator + β-UI RelationshipCard live; γ + δ + ε deferred)
**Created:** 2026-05-07
**Last Updated:** 2026-05-07

## Kontext

Die Architekturentscheidung ist richtig: User, RBAC-Mitglied, Projektmitglied, Stakeholder und Resource sind getrennte Konzepte. In der UI ist diese Trennung fuer normale Anwender aber schwer zu verstehen. Es ist unklar, wann jemand Mitglied, Stakeholder, Ressource oder alles zugleich sein muss.

Besonders kritisch ist die Tagessatz-/Rollenlogik: Ressourcen speichern keinen `role_key`. Role-Rate-Aufloesung laeuft ueber `resources.source_stakeholder_id -> stakeholders.role_key`. Die aktuelle Resource-Form kann eine Rolle aus dem Tagessatz-Katalog waehlen, speichert daraus aber einen festen Override-Betrag. Das ist technisch nachvollziehbar, wirkt fuer Nutzer aber wie dynamische Rollenlogik.

PROJ-57 macht die Beziehungen explizit und gefuehrt.

## Review-Befunde

- `docs/decisions/stakeholder-vs-user.md` trennt User, RBAC und Stakeholder sauber.
- `resources` sind tenant-scoped und koennen `source_stakeholder_id` sowie `linked_user_id` haben.
- Beim Promote-to-Resource wird eine existierende Resource ueber `linked_user_id` gefunden und ggf. `source_stakeholder_id` gesetzt.
- Eine manuell angelegte Resource hat heute keinen einfachen UX-Pfad, um sie mit einem Stakeholder und damit mit einer fachlichen Rolle zu verknuepfen.
- Role-Rate-Auswahl in `ResourceForm` wird als Override persistiert, nicht als dauerhafte Rollenbindung.
- Personalkosten/Tagessaetze sind Class-3 und muessen rollen- und rechtebewusst angezeigt werden.

## Dependencies

- **Requires:** PROJ-4 Project Memberships.
- **Requires:** PROJ-8 Stakeholder Management.
- **Requires:** PROJ-11 Resources.
- **Requires:** PROJ-24 Cost Stack.
- **Requires:** PROJ-54 Resource-Level Tagessatz.
- **Recommended after:** PROJ-55 fuer Tenant-Kontext und Audit-Hardening.
- **Feeds:** PROJ-56 Readiness/Health.

## Begriffliches Zielmodell

- **Tenant Member:** Person mit Login im Workspace.
- **Project Member:** Person mit Berechtigung im konkreten Projekt.
- **Stakeholder:** fachlich relevante Person/Organisation im Projekt, intern oder extern.
- **Resource:** plannbare Kapazitaet fuer Arbeit und Kosten.
- **Role Rate:** tenantweiter Tagessatz fuer eine fachliche Rolle.
- **Resource Override:** fester individueller Tagessatz auf Resource-Ebene.

Eine reale Person kann mehrere Rollen haben:

- Nur Tenant Member: darf sich einloggen, ist aber fachlich nicht relevant.
- Project Member + Stakeholder: arbeitet/entscheidet im Projekt und ist fachlich relevant.
- Stakeholder + Resource: externe Person ohne Login, aber planbare Kapazitaet.
- Project Member + Stakeholder + Resource: interne Projektperson mit Login, fachlicher Rolle und Kapazitaet.

## Slice-Struktur

| Slice | Inhalt | Schema-Change | Status |
|---|---|---|---|
| **57-alpha** | Operating-model docs + UI labels/help copy + relation map | Nein | Planned |
| **57-beta** | Link assistant in Stakeholder/Resource forms: member, stakeholder, resource relationships visible and editable | Optional | Planned |
| **57-gamma** | Tagessatz source model: dynamic role-rate vs fixed override made explicit | Optional | Planned |
| **57-delta** | Permission-aware Class-3 masking for cost/rate data in resource surfaces | Nein | Planned |
| **57-epsilon** | Readiness integration: missing links and missing rates feed PROJ-56 | Nein | Planned |

## Routing / Touchpoints

### Existing UI routes

- `/projects/[id]/mitglieder` — project membership and role assignment.
- `/projects/[id]/stakeholder` — project stakeholder list/detail/edit flows.
- `/projects/[id]/stakeholder-health` — stakeholder risk/health context.
- `/stammdaten/resources` — resource master-data list and resource form.
- `/settings/members` — tenant member management.
- `/settings/tenant/role-rates` — tenant role-rate catalog.
- `/projects/[id]/arbeitspakete` and `/projects/[id]/backlog` — resource allocation touchpoints on work items.

### Existing API routes and helpers to audit

- `src/app/api/projects/[id]/members/route.ts` and `src/app/api/projects/[id]/members/[userId]/route.ts`.
- `src/app/api/projects/[id]/stakeholders/route.ts` and `src/app/api/projects/[id]/stakeholders/[sid]/route.ts`.
- `src/app/api/stakeholders/[id]/promote-to-resource/route.ts`.
- `src/app/api/resources/route.ts` and `src/app/api/resources/[rid]/route.ts`.
- `src/app/api/projects/[id]/work-items/[wid]/resources/route.ts`.
- `src/app/api/projects/[id]/work-items/[wid]/resources/[aid]/route.ts`.
- `src/app/api/projects/[id]/work-items/[wid]/cost-lines/route.ts`.
- `src/app/api/tenants/[id]/role-rates/route.ts` and `src/app/api/tenants/[id]/role-rates/[rid]/route.ts`.
- `src/lib/cost/resource-rate-lookup.ts` — source of truth for dynamic role-rate vs override resolution.

### Proposed new or extended API surface

- `GET /api/projects/[id]/participant-links`
  - Aggregates member, stakeholder, resource and rate-source state for project-scoped UI.
- `PATCH /api/resources/[rid]/links`
  - Updates `source_stakeholder_id` and optional `linked_user_id` with tenant/project validation.
- Existing `POST /api/stakeholders/[id]/promote-to-resource`
  - Should return relationship summary and next actions, not only the created/updated resource.

### Proposed UI components

- `RelationshipSummary` — compact status view for member/stakeholder/resource/rate source.
- `ParticipantLinkAssistant` — guided linking from Stakeholder or Resource forms.
- `RateSourceBadge` — masked, permission-aware display for dynamic role rate, fixed override or unresolved rate.

## Slice Dependencies / Execution Order

1. **57-alpha first:** terminology and labels must be clear before adding new interactions.
2. **57-beta after 57-alpha:** link assistant depends on agreed target model and clear UI language.
3. **57-gamma after 57-beta or in parallel with it:** rate source model can be implemented once link semantics are fixed.
4. **57-delta after 57-gamma:** masking must cover the final rate-source shape.
5. **57-epsilon after PROJ-56-alpha:** readiness integration needs the PROJ-56 readiness item contract.

## User Stories

1. **Als Projektleiter** moechte ich bei einer Person sehen, ob sie Projektmitglied, Stakeholder, Ressource oder alles zugleich ist.
2. **Als Projektleiter** moechte ich einen Stakeholder in eine Resource uebernehmen und dabei direkt sehen, ob Konto, Rolle und Tagessatz aufloesbar sind.
3. **Als Tenant-Admin** moechte ich unterscheiden, ob eine Resource einen dynamischen Rollen-Tagessatz nutzt oder einen festen individuellen Override.
4. **Als normaler Projektmitarbeiter** moechte ich erkennen, dass ein Tagessatz vorhanden ist, ohne vertrauliche Personalkosten zu sehen.
5. **Als PMO** moechte ich Ressourcen ohne fachliche Verknuepfung, ohne Rolle oder ohne Tagessatz schnell finden.

## Acceptance Criteria

- [ ] AC-1: Stakeholder-Detail zeigt verknuepfte Konto-/Projektmitglied-/Resource-Informationen, wenn vorhanden.
- [ ] AC-2: Resource-Detail zeigt verknuepften Stakeholder, verknuepften User und Tagessatz-Quelle.
- [ ] AC-3: Manuell angelegte Resource kann nachtraeglich mit einem Stakeholder verknuepft werden, sofern Tenant und Identitaet passen.
- [ ] AC-4: Promote-to-Resource zeigt nach Erfolg eine klare Folgeaktion: "Tagessatz pruefen", "Resource oeffnen", "Allocation anlegen".
- [ ] AC-5: Tagessatz UI unterscheidet explizit:
  - "Dynamisch ueber Stakeholder-Rolle"
  - "Fester individueller Override"
  - "Nicht aufloesbar"
- [ ] AC-6: Auswahl eines Role Rates darf nicht still als Override erscheinen, ohne dass die UI das klar bestaetigt.
- [ ] AC-7: Fuer Non-Admins werden konkrete Tagessatz-Betraege maskiert; sichtbar bleiben Status und Quelle.
- [ ] AC-8: Listen zeigen Warnungen fuer Resources ohne `source_stakeholder_id`, ohne `linked_user_id` und ohne aufloesbaren Tagessatz.
- [ ] AC-9: Work-item Resource Allocation zeigt nicht nur Resource-Name, sondern auch Rate-Status und Kapazitaetsstatus.
- [ ] AC-10: Readiness aus PROJ-56 bekommt Signale fuer "Resource ohne Tagessatz", "Stakeholder ohne Verantwortlichen", "Work Item ohne Resource".
- [ ] AC-11: Tests decken Promote-to-existing-resource, manual-resource-link, role-rate-source und override-source ab.

## Edge Cases

- **EC-1: Externer Stakeholder ohne Login** — kann Resource sein, aber kein Project Member.
- **EC-2: Interner User ist Project Member, aber kein Stakeholder** — erlaubt, aber Readiness kann fachliche Stakeholder-Erfassung empfehlen.
- **EC-3: Resource hat `linked_user_id`, aber keinen `source_stakeholder_id`** — Kosten ueber Rolle nicht aufloesbar, sofern kein Override existiert.
- **EC-4: Mehrere Stakeholder in verschiedenen Projekten zeigen auf denselben User** — Resource bleibt tenantweit eindeutig; Source-Verknuepfung darf nicht unkontrolliert zwischen Projekten springen.
- **EC-5: Role Rate aendert sich spaeter** — dynamischer Role-Rate-Pfad folgt neuer Rate; Override bleibt fix. UI muss diesen Unterschied anzeigen.
- **EC-6: Admin entfernt Override** — System prueft, ob danach ein Rollen-Tagessatz aufloesbar ist.

## Technical Requirements

- Keine Vermischung von RBAC-Rolle und fachlicher Rolle.
- Relationship summary kann als API-Shape oder Server-Aggregator entstehen, nicht durch mehrere clientseitige Einzelqueries.
- Rate-Status soll aus derselben Resolve-Logik kommen wie der Cost Stack.
- Class-3 Masking zentral, nicht komponentenweise ad hoc.
- Audit fuer Link-/Rate-Aenderungen muss nach PROJ-55 funktionieren.
- GitNexus Impact vor Aenderung an Stakeholder-, Resource-, Cost- und Membership-Flows.

## Out-of-Scope

- Neues globales Personenverzeichnis als eigene Hauptentitaet.
- Vollstaendige HR-/Kapazitaetsplanung.
- Versionierte Resource-Rate-Historie; bleibt PROJ-54-delta.
- Project-Room Health Score; siehe PROJ-56.
- Tenant-Kontext/Settings-Bugs; siehe PROJ-55.

## QA / Verification Plan

- Unit/API tests fuer Relationship Summary.
- UI tests fuer Stakeholder -> Resource Promote und Resource -> Stakeholder Link.
- Permission tests fuer Admin vs Non-Admin Rate-Anzeige.
- Cost-stack regression: dynamic role-rate und fixed override ergeben erwartete Cost Lines.

## Implementation Notes

Noch nicht implementiert. Diese Spec uebersetzt den Review-Befund in ein eigenes fachliches Operating-Model, damit PROJ-54 nicht mit UI-/Identitaetsfragen ueberladen wird.

## QA Test Results

_To be added by /qa_

## Deployment

_To be added by /deploy_

## Implementation Notes

### 2026-05-11 — MVP foundation (α docs + β aggregator/API)

**57-α — Operating model documented in spec sections** *Begriffliches Zielmodell* and *Slice-Struktur* above. The four-role model (Tenant Member / Project Member / Stakeholder / Resource) is canonical.

**57-β — Aggregator + API**

- `src/lib/participant-links/types.ts` — `ParticipantLink`, `ParticipantRateSource`, `ProjectParticipantLinksSnapshot`. The rate-source discriminated union classifies into `none` / `role_rate` / `override` / `unresolved`.
- `src/lib/participant-links/aggregate.ts` — `resolveProjectParticipantLinks()` joins `project_memberships`, `stakeholders` and `resources` (tenant-scoped, filtered to project-relevant rows) and merges them on `user_id` first, then `source_stakeholder_id`, then standalone. Emits `link_warnings` for the three high-value gaps:
  1. Stakeholder mit Login, aber kein Projektmitglied
  2. Resource ohne Stakeholder-Bindung
  3. Projektmitglied ohne Stakeholder-Erfassung
- `GET /api/projects/[id]/participant-links` — auth-gated via `requireProjectAccess(..., "view")`. Returns `{ participant_links: ProjectParticipantLinksSnapshot }`.
- 3 unit tests + 1 Playwright auth-gate smoke. Vitest: **1263 / 1263 green** (was 1260; +3).

### Deferred follow-ups (PROJ-57-β UI + γ/δ/ε)

- **β UI** — `RelationshipSummary`, `ParticipantLinkAssistant`, `RateSourceBadge` components in `src/components/projects/` consuming the new endpoint. Estimated 1 dev day.
- **γ — Tagessatz source model** — explizit "dynamic role-rate" vs "fixed override" im Resource-Form. Erfordert kleine Schema-Erweiterung + Migration.
- **δ — Class-3 masking** — Rate-Werte abhängig von `cost_admin`-Rolle maskieren. Erfordert Permission-Helper-Erweiterung.
- **ε — Readiness-Integration** — Aggregator-Counts (`with_warnings`) als zusätzlicher Readiness-Item-Key in PROJ-56 einbinden. ~1h.

Alle Deferrals sind additiv — die aktuelle Slice liefert die Daten, die FE-Komponenten konsumieren sie sukzessive.

## QA Test Results

- 3 aggregator unit tests pinning identity-merge + rate-source classification.
- 1 route auth-gate smoke (Playwright × 2 browser projects).
- Keine Critical/High Bugs. γ/δ/ε bewusst als deferred dokumentiert.

## Deployment

- **Date deployed:** 2026-05-11
- **Production URL:** https://projektplattform-v3.vercel.app
- **DB migration:** keine.
- **Rollback plan:** `git revert` des Batch-5-Commits. Keine DB-Implikationen.
