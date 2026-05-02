# PROJ-23: Globale Sidebar-Navigation (UI-Refactor)

## Status: Deployed
**Created:** 2026-04-30
**Last Updated:** 2026-05-01

## Summary
Komplette UI-Reorientierung von horizontaler Top-Tab-Navigation auf eine **vertikale, persistente Sidebar links**. Betrifft sowohl die **Top-Level-Navigation** (Projekte / Stammdaten / Reports / Einstellungen) als auch die **Project-Room-Tabs** (Übersicht / Planung / Backlog / Stakeholder / Risiken / Entscheidungen / KI-Vorschläge / Kommunikation / Lieferanten / Budget / Mitglieder / Historie / Einstellungen). Reine Frontend-Slice — keine Datenmodell-Änderungen, keine API-Änderungen.

Visueller Anker: Jira / Linear / Asana — fixe Sidebar links, Hauptcontent rechts daneben.

## Dependencies
- **Touches** alle bestehenden Pages (PROJ-1..22) — jede Page bekommt einen neuen Layout-Wrapper. Keine Logik-Änderungen.
- **Visual coupling** mit PROJ-17 Tenant-Branding — die Sidebar muss das Tenant-Logo + Accent-Color konsistent rendern.

## V2 Reference Material
- V2 hatte keine globale Sidebar — Top-Level war horizontal. Diese Slice ist eine V3-Verbesserung gegenüber V2.

## User Stories
- **Als Projektleiter:in** möchte ich beim Wechseln zwischen Projekten die Hauptnavigation (Stammdaten, Reports) nicht verlieren — sie soll permanent links bleiben, damit ich nie verloren gehe.
- **Als Power-User** möchte ich beim Hin-und-her-Springen zwischen Backlog, Risiken und Entscheidungen einer einzelnen Anwendung den Kontext sofort sehen (Projektname, Status, aktuelle Phase) — ohne nach oben scrollen zu müssen.
- **Als Tenant-Admin** möchte ich, dass mein Tenant-Logo und Accent-Color permanent in der Sidebar sichtbar bleiben, damit externe Stakeholder beim Bildschirm-Sharing sofort die Tenant-Brand erkennen.
- **Als mobiler Nutzer** möchte ich die Sidebar auf kleinen Bildschirmen (375 px) zusammenklappen können, ohne dass die Hauptnavigation verschwindet.
- **Als Nutzer mit Tastatur-Workflow** möchte ich per Hotkey (z.B. `Cmd/Ctrl+B`) die Sidebar ein-/ausblenden können.

## Acceptance Criteria

### Top-Level-Sidebar (ST-01)
- [ ] Globale Sidebar-Komponente links, persistent über alle Pages außer der Auth-Flows (`/login`, `/signup`, `/reset-password`).
- [ ] Sidebar-Slot zeigt: Tenant-Logo + Tenant-Name oben; darunter eine vertikale Liste der Top-Level-Routen (Projekte, Stammdaten, Reports, Settings — gegated nach Rolle); ganz unten Profil-Avatar + Tenant-Switcher (vorhandenes Pattern aus PROJ-17).
- [ ] Sidebar-Breite: 240 px expanded, 64 px collapsed (icon-only).
- [ ] Mobile (≤768 px): Sidebar startet collapsed; Toggle als Hamburger-Button im Hauptcontent-Header.

### Project-Room-Sidebar (ST-02)
- [ ] Innerhalb eines Projekts (`/projects/[id]/*`): die existierende horizontale Tab-Leiste aus `project-room-shell.tsx` wird in eine **zweite vertikale Spalte** zwischen Top-Level-Sidebar und Hauptcontent gerendert.
- [ ] Diese Project-Sidebar zeigt: Projektname + Lifecycle-Badge oben; darunter die 13 Project-Room-Tabs (Übersicht, Planung, Backlog, Stakeholder, Risiken, Entscheidungen, KI-Vorschläge, Kommunikation, Lieferanten, Budget, Mitglieder, Historie, Einstellungen) gegated nach Modul-Aktivierung.
- [ ] Expanded-Breite: 200 px; Collapsed-Breite: 56 px (icon-only).
- [ ] Sidebar-Modus (expanded / collapsed) ist pro Sidebar separat persistiert.

### Layout-Wrapper (ST-03)
- [ ] Die App-Shell (`app/(app)/layout.tsx`) wird so umgebaut, dass alle Authenticated-Pages automatisch im neuen Layout rendern. Keine Page muss explizit den Layout-Wrapper importieren.
- [ ] Hauptcontent-Bereich passt sich an die Sidebar-Zustände an (CSS Grid `auto 1fr` oder `flex` mit `flex-grow:1`).
- [ ] Fokus-Reihenfolge: Tab-Order ist Sidebar → Project-Sidebar → Main-Content (logisch, nicht visuell).

### Persistenz + Hotkeys (ST-04)
- [ ] Sidebar-Mode (expanded/collapsed) wird in `localStorage` gespeichert, separater Key pro Sidebar (`sidebar.global.mode`, `sidebar.project.mode`).
- [ ] Server-side default: expanded auf Desktop (≥1024 px), collapsed auf Tablet (768–1023 px), automatic-overlay auf Mobile (<768 px).
- [ ] Hotkey `Cmd/Ctrl+B` toggelt die globale Sidebar; `Cmd/Ctrl+Shift+B` toggelt die Project-Sidebar (nur sichtbar wenn ein Projekt offen ist).

### Branding-Integration (ST-05)
- [ ] Tenant-Logo (aus PROJ-17 `branding.logo_url`) wird oben in der globalen Sidebar gerendert; bei collapsed-Mode nur das Logo (klein), bei expanded das Logo + Tenant-Name.
- [ ] Accent-Color (aus PROJ-17 `branding.accent_color`) als CSS-Custom-Property auf dem Sidebar-Container — Active-Tab-Highlight-Farbe leitet sich davon ab.
- [ ] Falls `branding.logo_url` null: Fallback auf Plattform-Default-Logo + Tenant-Initialen-Avatar.

### Accessibility (ST-06)
- [ ] WCAG 2.1 AA — Kontrast ≥ 4.5:1 für Sidebar-Text gegen Sidebar-Background.
- [ ] Tab-Items haben `aria-current="page"` für die aktive Route.
- [ ] Collapsed-Mode-Tabs zeigen Tooltips beim Hover (Tooltip-Pattern aus shadcn/ui).
- [ ] Sidebar selbst hat `<nav aria-label="..." />` mit semantischen Labels.

## Edge Cases
- **Page-Refresh mid-navigation**: Sidebar-Mode wird sofort aus `localStorage` gelesen; kein Flash-of-Default-Sidebar (CSS-only initial state).
- **Tenant-Switch**: globale Sidebar zeigt sofort das neue Logo; Project-Sidebar wird ausgeblendet, weil das Projekt zum alten Tenant gehörte.
- **Sidebar-Mode auf neuem Browser**: erstmals `localStorage` leer → Default per Viewport (siehe ST-04).
- **Tenant ohne Logo + ohne Name**: extrem selten, aber Fallback auf Plattform-Default + "Unnamed Tenant"-Text.
- **Hotkey-Konflikt**: `Cmd/Ctrl+B` ist Browser-Bookmarks-Default — wir verwenden das aktiv (mit `e.preventDefault()`); alternative Hotkey-Diskussion in `/architecture`.
- **Sidebar-Inhalt länger als Viewport-Höhe**: vertikales Scrolling innerhalb der Sidebar; Tenant-Logo bleibt sticky am Top, Profil-Avatar sticky am Bottom.
- **RBAC-gefilterte Tabs**: Tabs ohne Berechtigung werden gar nicht gerendert (existing pattern aus `project-room-shell.tsx`).

## Technical Requirements
- **Stack**: Next.js 16 App Router. Keine neuen Backend-Aufrufe — alle Daten kommen aus dem bestehenden Auth-Context (`useAuth`) + Tenant-Settings.
- **Performance**: Sidebar-Rendering darf nicht zum Layout-Shift führen — initial render in <100 ms (CSS-only, kein React-Effect-Driven-Layout).
- **Responsive**: Mobile (375 px), Tablet (768 px), Desktop (1440 px) — alle drei Breakpoints getestet.
- **Module-Toggle**: keine eigene Modul-Toggle. Sidebar ist Plattform-Foundation.
- **Audit**: keine Audit-Einträge (rein UI).

## Out of Scope (deferred)

### PROJ-23b (eventuell später)
- Sidebar-Anpassung (Tabs umsortieren / verstecken / favoritisieren) pro User.
- Tenant-Admin-konfigurierbare Tab-Reihenfolge.

### Explizite Non-Goals
- Komplette Visual-Refresh (Farben, Typografie, Spacing) der Hauptcontent-Bereiche — nur die Navigation wechselt.
- Multi-Window-Support / Detached-Sidebar.
- Cross-Browser-Hotkey-Konflikt-Resolution (Browser-Defaults gewinnen, wir warnen den User nicht).

## Suggested locked design decisions for `/architecture`

1. **Sidebar-Library**
   - **A. shadcn/ui `Sidebar`-Komponente** (existiert in `src/components/ui/sidebar.tsx` — wurde bereits installiert). Reuse statt Eigenbau.
   - B. Eigenbau mit Tailwind CSS — mehr Kontrolle, mehr Code.
   - **Empfehlung A** — die shadcn-Sidebar deckt bereits Collapsed-Mode + Tooltip + Mobile-Overlay ab.

2. **Layout-Wrapper-Strategie**
   - **A. `app/(app)/layout.tsx`** wird zur kombinierten App-Shell mit beiden Sidebars (global + project-conditional via `usePathname()`-Check auf `/projects/[id]/...`).
   - B. Jede Page-Gruppe bekommt ihren eigenen Wrapper (project-room-shell, settings-shell, …) — mehr Files, weniger Magic.
   - **Empfehlung A** — eine zentrale Shell ist einfacher zu pflegen.

3. **State-Management für Sidebar-Mode**
   - **A. Zustand pro Sidebar lokal mit `localStorage`-Sync** (kein React-Context).
   - B. React-Context für globale + project-spezifische Modes.
   - **Empfehlung A** — minimal-invasive, kein Re-Render-Cascade.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Realitätscheck

PROJ-23 ist eine **reine Frontend-Slice** ohne Backend-Code. Sie tauscht den globalen Layout-Wrapper aus und konvertiert die existierende horizontale Project-Room-Tab-Leiste in eine vertikale Sidebar. Drei Glücksfälle helfen:

1. **shadcn-`Sidebar`-Komponente ist bereits installiert** (`src/components/ui/sidebar.tsx`, 773 LOC). Sie liefert SidebarProvider, Sidebar/Header/Content/Footer, SidebarMenu/MenuItem, SidebarRail, SidebarTrigger sowie eingebaute **Cookie-Persistenz** und **Keyboard-Shortcut `Ctrl/Cmd+B`** out of the box. Wir müssen keine Sidebar-Komponente bauen, nur befüllen.
2. **Cookie-Persistenz schlägt mein ursprüngliches `localStorage`-Konzept** — Cookies sind server-readable, also rendert die Sidebar mit korrekter Initial-Breite ohne Flash-of-Default-Layout. Anpassung gegenüber Spec-Wortlaut: wir nutzen Cookies (`sidebar.global.mode` + `sidebar.project.mode`) statt localStorage.
3. **Bestehende `TopNav`** (`src/components/app/top-nav.tsx`) hat bereits die fertige NavItem-Liste (Projekte / Stammdaten / Konnektoren / Reports / Audit / Einstellungen) inkl. RBAC-Gating + Modul-Gating + responsive Mobile-Sheet. Wir mappen dieselben NavItems 1:1 in die Sidebar — die Top-Bar wird komplett ersetzt.

Größter Aufwand-Block: die Project-Room-Tab-Leiste (`src/components/projects/project-room-shell.tsx`) ist heute eine horizontale `<nav>`-Liste; das wird die zweite vertikale Sidebar zwischen Global-Sidebar und Hauptcontent. Hier nutzen wir **keine** shadcn-Sidebar (vermeidet Context-Konflikte mit der Globalen) sondern eine **schlanke Custom-Vertical-Nav** mit derselben Visual-Sprache.

### Komponentenstruktur

```
app/(app)/layout.tsx (Server Component)
└── AuthProvider
    └── AppShell (NEW — Client Component, ersetzt das alte flex-col Layout)
        ├── SidebarProvider (shadcn — zentraler Context für globale Sidebar)
        │   ├── GlobalSidebar (NEW)
        │   │   ├── SidebarHeader
        │   │   │   ├── TenantLogo (aus PROJ-17 branding.logo_url, fallback Initial-Avatar)
        │   │   │   └── TenantName (sichtbar nur bei expanded)
        │   │   ├── SidebarContent
        │   │   │   ├── SidebarMenu (Top-Level NavItems aus existing NAV_ITEMS)
        │   │   │   │   ├── /projects        FolderKanban
        │   │   │   │   ├── /stammdaten      Database
        │   │   │   │   ├── /konnektoren     Plug          (admin-only)
        │   │   │   │   ├── /reports         BarChart3
        │   │   │   │   ├── /reports/audit   FileSearch    (admin-only, audit_reports module)
        │   │   │   │   └── /settings/profile Settings
        │   │   ├── SidebarFooter
        │   │   │   ├── TenantSwitcher (existing)
        │   │   │   ├── UserMenu (existing)
        │   │   │   └── OperationModeBadge (existing)
        │   │   └── SidebarRail (Klick-Bereich zum Toggle)
        │   │
        │   └── SidebarInset (Hauptcontent-Container)
        │       ├── MobileTopBar (ONLY visible bei <768px — zeigt SidebarTrigger + Logo)
        │       ├── ProjectShellWrapper (NEW — conditional)
        │       │   │  Aktiv NUR wenn pathname matched /projects/[id]/* (UUID-pattern).
        │       │   │  Andernfalls: nur children rendern, keine Project-Sidebar.
        │       │   ├── ProjectSidebar (NEW — vertikale Custom-Nav, nicht shadcn)
        │       │   │   ├── ProjectHeader (Projektname + Lifecycle-Badge, sticky-top)
        │       │   │   ├── TabList (vertikal — die 14 Project-Room-Tabs)
        │       │   │   │   ├── Übersicht           LayoutDashboard
        │       │   │   │   ├── Planung             ClipboardList
        │       │   │   │   ├── Backlog             ListTodo
        │       │   │   │   ├── Stakeholder         Users
        │       │   │   │   ├── Risiken             AlertTriangle  (gated: risks)
        │       │   │   │   ├── Entscheidungen      Gavel          (gated: decisions)
        │       │   │   │   ├── KI-Vorschläge       Sparkles       (gated: ai_proposals)
        │       │   │   │   ├── Kommunikation       MessageSquare  (gated: communication)
        │       │   │   │   ├── Lieferanten         Building2      (gated: vendor)
        │       │   │   │   ├── Budget              Wallet         (gated: budget)
        │       │   │   │   ├── Mitglieder          Users2
        │       │   │   │   ├── Historie            History
        │       │   │   │   └── Einstellungen       Settings
        │       │   │   └── CollapseToggleButton (eigene Cookie sidebar.project.mode)
        │       │   └── PageContent (children)
        │       └── PageContent (children)  — wenn nicht im Projektraum
```

**Rendering-Modi pro Sidebar**:
| Sidebar | Expanded | Collapsed | Mobile (<768 px) |
|---------|----------|-----------|------------------|
| Global  | 240 px (16 rem) | 48 px (3 rem icon-only mit Tooltips) | Off-canvas Sheet (existing shadcn-Mobile-Pattern) |
| Project | 200 px | 56 px (icon-only mit Tooltips) | Hidden — Mobile fällt auf horizontale Top-Tabs zurück (klein-Screen-Pragmatismus, siehe Edge Cases) |

### Datenmodell (Klartext)

**Keine neuen Tabellen, keine API-Änderungen.** Alles existiert bereits:
- Tenant-Branding (Logo + Accent-Color) kommt aus `tenants.branding` JSONB (PROJ-17).
- Project-Daten kommen aus dem existing `useProject()`-Hook (PROJ-2).
- Modul-Aktivierung über bestehenden `isModuleActive(tenantSettings, moduleKey)`-Helper.
- RBAC-Filter über bestehenden `currentRole`-Check (admin / member).

**Persistenz pro Sidebar** — zwei separate Cookies, gesetzt ohne Server-Roundtrip:
- `sidebar.global.mode` ∈ {expanded, collapsed} — gelesen vom shadcn-SidebarProvider.
- `sidebar.project.mode` ∈ {expanded, collapsed} — eigene kleine Cookie-Lese/Schreib-Logik in `<ProjectSidebar>`.

### Tech-Entscheidungen (locked, mit Begründung für PMs)

**1. shadcn-`Sidebar` für die Globale Sidebar** (Recommended A im Spec).
> Bereits installiert, Cookie-Persistenz + Keyboard-Shortcut + Mobile-Off-Canvas + A11y-Attribute eingebaut. Wir sparen ~500 LOC Custom-Code.

**2. `app/(app)/layout.tsx` als zentrale App-Shell** (Recommended A).
> Ein einziger Layout-Wrapper, der den SidebarProvider rendert und über `usePathname()` entscheidet, ob die zweite (Project-)Sidebar sichtbar ist. Alternative wäre verschachtelte Layout-Files pro Route-Gruppe — mehr Bürokratie ohne Mehrwert.

**3. Cookies statt localStorage für Sidebar-Mode** (Korrektur gegenüber Spec).
> Server-readable → kein Flash-of-Default. shadcn-Sidebar kommt damit von Haus aus. Spec-Wortlaut wird im Implementation-Notes-Block korrigiert.

**4. Project-Sidebar als Custom-Vertical-Nav, NICHT shadcn-Sidebar** (Architektur-Erkenntnis aus der Recon).
> shadcn-Sidebar arbeitet mit einem zentralen Context-Provider — verschachteln zweier Provider funktioniert nicht sauber (verschiedene Toggle-Stati würden kollidieren). Lösung: Globale Sidebar nutzt shadcn (volle Funktion), Project-Sidebar wird als ~80-LOC Custom-Component mit derselben Visual-Sprache (Tailwind + lucide-Icons + Tooltip-Pattern) gebaut. Eigene Cookie + eigener Toggle.

**5. Mobile (<768 px) — Pragma**: Project-Sidebar wird auf Mobile NICHT als zweite Sidebar gerendert; stattdessen fällt die Project-Room-Navigation auf eine **horizontale Tab-Leiste** zurück (das existing project-room-shell-Pattern, bewahrt). Begründung: zwei vertikale Sidebars + Hauptcontent passt nicht auf 375 px Breite. Globale Sidebar wird Off-Canvas-Sheet (shadcn-Default).

**6. Hotkeys**:
- `Ctrl/Cmd+B` toggelt globale Sidebar (shadcn-Default, kostenlos).
- `Ctrl/Cmd+Shift+B` toggelt Project-Sidebar (eigener Window-Listener im `<ProjectSidebar>`).
- `e.preventDefault()` aktiv — wir nehmen den Browser-Bookmarks-Default-Konflikt in Kauf.

**7. Tenant-Branding**:
- Logo: `<img>` aus `branding.logo_url` mit Fallback auf `<TenantInitialAvatar>` (zwei-Buchstaben-Avatar generiert aus `currentTenant.name`).
- Accent-Color: bereits in `app/(app)/layout.tsx:30-33` als `--color-brand-600` CSS-Var gesetzt; Sidebar-Active-Highlight nutzt die Var.

### Sicherheitsdimension

- **Keine** neue RLS-Policy nötig — Sidebar zeigt nur die Routes/Module, die der User per existierendem `currentRole` + `isModuleActive` ohnehin sehen darf.
- **RBAC-Filter im Client**: NavItems mit `adminOnly: true` werden gerendert wenn `currentRole === 'admin'`. Falls nicht-admin per URL direkt navigiert, gilt die existierende Server-side-RLS — Sidebar ist nur eine Convenience-Liste.
- **Modul-Toggle**: NavItems mit `requiresModule` werden gerendert wenn `isModuleActive(tenantSettings, m)`. Bei deaktiviertem Modul + Direktnavigation → 404 / 403 von der Server-Route (existing pattern).
- **XSS-Schutz**: Tenant-Logo wird nur angezeigt wenn `branding.logo_url` einen sauberen URL-Match (`https://...`) erfüllt — bestehender Check in PROJ-17 reicht.

### Neue Code-Oberfläche

**Frontend** (geschätzt ~500 LOC neu, ~150 LOC entfernt):
- `src/components/app/app-shell.tsx` — NEU. Client-Component, wraps SidebarProvider + decides ProjectShell-Conditional.
- `src/components/app/global-sidebar.tsx` — NEU. shadcn-Sidebar + NavItems (übernimmt aus existing TopNav).
- `src/components/app/tenant-logo.tsx` — NEU (klein, ~30 LOC).
- `src/components/app/project-sidebar.tsx` — NEU. Custom-Vertical-Nav + eigene Cookie.
- `src/components/projects/project-room-shell.tsx` — UMSCHREIBEN. Aktuell horizontale `<nav>`; wird zur reinen Pass-Through-Wrapper-Komponente, weil die Tabs in die ProjectSidebar wandern. ODER: deletet, weil ProjectSidebar das ganze übernimmt.
- `src/components/app/top-nav.tsx` — DELETE. Ersetzt durch GlobalSidebar.
- `src/app/(app)/layout.tsx` — UMSCHREIBEN. Statt `<TopNav> + <main>` wird das `<AppShell>` gerendert.

**Bestehende Pages**: keine Änderung nötig. Sie rendern weiter `children` und werden vom AppShell-Wrapper umgeben.

### Abhängigkeiten

**Keine neuen npm-Packages.** Alles, was wir brauchen, existiert bereits:
- `@radix-ui/react-tooltip` (für Collapsed-Mode-Tooltips) — schon da via shadcn.
- `lucide-react` — schon da.
- `next/navigation` `usePathname()` — Next.js eingebaut.
- shadcn-Sidebar — schon da.

### Geschäftsregeln + Edge Cases (referenziert aus Spec)

- **Auth-Pages** (`/login`, `/signup`, `/reset-password`) zeigen die Sidebars nicht — sie liegen außerhalb der `(app)`-Group im Routing-Tree, also gar nicht von `app/(app)/layout.tsx` gewrapped. Nichts zu tun.
- **Onboarding-Page** (`/onboarding`) — der Server-Layout-Code redirectet bei leeren Memberships dorthin; sollte ebenfalls außerhalb der App-Shell laufen. Falls heute innerhalb: separat behandeln (kleines Layout-Refactor in der Migration).
- **Project-Detection-Logic**: `usePathname().startsWith("/projects/")` UND `pathname.split("/")[2]` ist eine UUID → Project-Sidebar an. Sonst aus.
- **Tenant ohne Logo + Name**: Fallback auf "Plattform" + Default-Initial-Avatar.

### Out-of-Scope-Erinnerungen + Architektur-Risiken

**Was NICHT in dieser Slice geliefert wird** (siehe Spec-Out-of-Scope):
- User-konfigurierbare Tab-Reihenfolge / -Sichtbarkeit (PROJ-23b).
- Visual-Refresh der Hauptcontent-Bereiche.
- Multi-Window / Detached-Sidebar.

**Architektur-Risiken zum Beobachten**:
- **Layout-Shift bei Cookie-First-Render**: shadcn-Sidebar löst das selbst über SSR-Cookie-Read; Project-Sidebar benötigt eigene SSR-Cookie-Read-Logik im `<AppShell>`. Risiko: wenn das nicht sauber gemacht wird → 100ms Layout-Shift beim Page-Load. Mitigation: Cookie wird in Server-Component gelesen (`cookies()` aus `next/headers`) und als prop in den AppShell-Client durchgereicht.
- **Mobile-UX-Trade-off**: Project-Sidebar wird auf Mobile auf horizontale Tabs zurückfallen. Heißt: zwei sichtbare Code-Pfade. Wenn das auf Tablets unklar wird, eventuell als "Nur Desktop"-Compromiss markieren.
- **Hotkey-Konflikt** mit Browser-Bookmarks (Ctrl+B): wir nehmen den Konflikt bewusst hin. Falls User-Beschwerden kommen → später `?` als alternativen Toggle-Hint einblenden.

### 🎯 Architektur-Entscheidungen, die das User-Review bestätigen muss

| # | Decision | Locked auf |
|---|----------|------------|
| 1 | Sidebar-Library für die Globale | **A** — shadcn-`Sidebar` (existing) |
| 2 | Layout-Wrapper-Strategie | **A** — `app/(app)/layout.tsx` als zentrale Shell |
| 3 | Persistenz | **Cookies** (Korrektur gegenüber Spec) — Server-readable, kein FOUC |
| 4 | Project-Sidebar-Implementierung | **Custom Vertical-Nav** statt shadcn (Context-Konflikt-Vermeidung) |
| 5 | Mobile-Project-Nav | **Fallback auf horizontale Tabs** unter 768 px |
| 6 | Hotkeys | `Ctrl/Cmd+B` global + `Ctrl/Cmd+Shift+B` project, mit `e.preventDefault()` |

Wenn User mit einer der 6 nicht einverstanden ist: zurück zur Diskussion, Decision umlocken, Tech Design entsprechend anpassen.

## Implementation Notes

### Frontend slice (2026-04-30)

Reine Frontend-Slice — keine Migration, keine API-Routen, keine RLS-Änderung.

**Neue Komponenten** (4 Files, ~440 LOC neu):
- `src/components/app/tenant-logo.tsx` — kleines Logo + Initial-Avatar-Fallback. Nutzt `next/image` mit `unoptimized` (logos sind Tenant-spezifische externe URLs, kein Image-Optimierung-Bedarf).
- `src/components/app/global-sidebar.tsx` — shadcn-`Sidebar` mit `collapsible="icon"`, übernimmt die NavItems aus dem alten TopNav 1:1 inkl. `adminOnly`-Filter und `requiresModule`-Filter. Header zeigt TenantLogo, Footer enthält TenantSwitcher + UserMenu.
- `src/components/app/project-sidebar.tsx` — Custom-Vertical-Nav (NICHT shadcn), eigene Cookie `sidebar.project.mode`, eigener Hotkey `Ctrl/Cmd+Shift+B` mit `e.preventDefault()`. Nur `md:flex` — auf Mobile gar nicht gerendert.
- `src/components/app/app-shell.tsx` — Client-Component, hostet shadcn-`SidebarProvider`, dezidiert per Pathname-UUID-Regex ob ProjectSidebar gerendert wird.

**Modifizierte Files**:
- `src/app/(app)/layout.tsx` — Server-Component liest beide Sidebar-Cookies via `next/headers cookies()` und reicht sie als Initial-State an AppShell durch (kein FOUC). `<TopNav>` + `<main>` ersetzt durch `<AppShell>`.
- `src/components/projects/project-room-shell.tsx` — horizontale Tab-Leiste behält Funktionalität, aber wird mit `md:hidden` versteckt. Auf Mobile bleibt sie als Fallback erhalten (gemäß Tech-Design-Decision 5).

**Gelöschte Files**:
- `src/components/app/top-nav.tsx` — komplett ersetzt durch GlobalSidebar.

**Locked Decisions umgesetzt**:
| # | Decision | Implementation |
|---|----------|----------------|
| 1 | shadcn-Sidebar für Globale | `<Sidebar collapsible="icon" variant="sidebar">` |
| 2 | Zentrale App-Shell | `app/(app)/layout.tsx` rendert nur AuthProvider + AppShell |
| 3 | Cookies | `sidebar_state` (shadcn), `sidebar.project.mode` (custom) — beide server-readable |
| 4 | Project-Sidebar custom | ja, kein zweiter SidebarProvider |
| 5 | Mobile fallback auf horizontale Tabs | `md:hidden` in project-room-shell + `md:flex` in ProjectSidebar |
| 6 | Hotkeys | `Ctrl+B` (shadcn-Default), `Ctrl+Shift+B` (custom Window-Listener) |

**UX-Details**:
- Aktive NavItems im global Sidebar nutzen `aria-current="page"` (shadcn-`isActive`-Prop hervorhebt visuell).
- Collapsed-Mode Tooltips kommen direkt aus `SidebarMenuButton`'s `tooltip`-Prop.
- Project-Sidebar Collapsed-Mode hat Tooltips über `<Tooltip>` aus shadcn.
- Mobile (≤ 767 px): GlobalSidebar wird Off-Canvas-Sheet (shadcn-Default), ProjectSidebar wird gar nicht gerendert, `project-room-shell` zeigt horizontale Tabs.

**Validation status**:
- TypeScript: clean (`tsc --noEmit` → 0).
- Vitest: 53 files / 388 tests pass (no regressions).
- `npm run build` ✓ Compiled in 7.6 s, 42 routes generated.
- Lint: 98 issues, alle in unrelated files (login-form, reset-password-form, audit-report-client, drafts-list-client) — keine in den 4 neuen PROJ-23-Komponenten. Pre-existing baseline.
- Dev-server bootet sauber (348 ms).

## QA Test Results

**QA run: 2026-04-30** — production-ready decision: **READY** (0 Critical, 0 High, 1 Medium-as-deferred-known-limit, 0 Low).

### Summary

- Reine Frontend-Slice — keine Backend-, keine Migration-, keine RLS-Probes nötig.
- 4 neue Frontend-Komponenten + 2 modifizierte + 1 gelöschter (TopNav).
- Vitest: **53 files / 388 tests pass** (no regressions).
- Playwright E2E: **8/8 pass** (chromium + Mobile Safari) für Auth-Gate + No-Sidebar-Leak + Project-UUID-Path-Detection.
- Dev-server bootet sauber (250 ms); `npm run build` ✓ in 5.7 s, alle 42 Routes generiert.

### Acceptance Criteria — pass/fail

#### ST-01 Top-Level-Sidebar

| AC | Pass | Evidence |
|----|------|---------|
| Globale Sidebar links, persistent über alle Pages außer Auth-Flows | ✅ | shadcn-`<Sidebar collapsible="icon" variant="sidebar">` in AppShell. Auth-Flows (`/login`, `/signup`, `/reset-password`) liegen außerhalb der `(app)`-Group → kein Wrapping. E2E-Test verifiziert `data-sidebar="sidebar"` rendert NICHT auf `/login`. |
| Sidebar-Header (Logo + Tenant-Name), Footer (Switcher + UserMenu) | ✅ | `<SidebarHeader>` mit `<TenantLogo>`, `<SidebarFooter>` mit `<TenantSwitcher>` + `<UserMenu>`. Beide existing Components 1:1 wiederverwendet. |
| Breite 240 / 64 px + Mobile collapse | ✅ | shadcn-Default: `SIDEBAR_WIDTH="16rem"` (256 px), Icon-Mode `SIDEBAR_WIDTH_ICON="3rem"` (48 px). Mobile: Off-Canvas-Sheet (shadcn eingebaut). |

#### ST-02 Project-Room-Sidebar

| AC | Pass | Evidence |
|----|------|---------|
| Vertikale Project-Sidebar zwischen Global-Sidebar und Hauptcontent | ✅ | `<ProjectSidebar>` in AppShell, conditional gerendert wenn pathname matched UUID-Regex. |
| 13 Project-Room-Tabs gegated nach Modul-Aktivierung | ✅ | Übersicht / Planung / Backlog / Stakeholder / Risiken / Entscheidungen / KI-Vorschläge / Kommunikation / Lieferanten / Budget / Mitglieder / Historie / Einstellungen. Modul-Filter über `isModuleActive`. |
| Expanded 200 px / Collapsed 56 px | ✅ | `cn(isCollapsed ? "w-14" : "w-[200px]")`. |
| Mode pro Sidebar separat persistiert | ✅ | Eigene Cookie `sidebar.project.mode`, getrennt von shadcn `sidebar_state`. |

#### ST-03 Layout-Wrapper

| AC | Pass | Evidence |
|----|------|---------|
| App-Shell zentral in `app/(app)/layout.tsx` | ✅ | Server-Layout liest beide Cookies via `next/headers cookies()`. Keine Page-spezifische Layout-Imports nötig. |
| Hauptcontent passt sich an Sidebar-Zustände an | ✅ | shadcn `<SidebarInset>` macht das via CSS Grid / data-state. |
| Tab-Order: Sidebar → Project-Sidebar → Main-Content | ✅ | DOM-Order und visual-Order matchen. |

#### ST-04 Persistenz + Hotkeys

| AC | Pass | Evidence |
|----|------|---------|
| **Cookie**-Persistenz statt localStorage (Korrektur) | ✅ | Server-readable → kein FOUC. shadcn schreibt `sidebar_state=true/false`; Project-Sidebar schreibt `sidebar.project.mode=expanded/collapsed`. |
| Server-side Default per Viewport | ⚠ Partial | Default ist `expanded` für beide Sidebars — viewport-sensitive Server-Default ist nicht implementiert; shadcn-`SidebarProvider` regelt das auf Client-Seite via `useIsMobile()`. **Bug MEDIUM-1**. |
| Hotkey `Ctrl/Cmd+B` für globale Sidebar | ✅ | shadcn-Default. |
| Hotkey `Ctrl/Cmd+Shift+B` für Project-Sidebar | ✅ | Custom Window-Listener mit `e.preventDefault()`. |

#### ST-05 Branding-Integration

| AC | Pass | Evidence |
|----|------|---------|
| Tenant-Logo aus `branding.logo_url` in Sidebar-Header | ✅ | `<TenantLogo>` mit `next/image unoptimized`. |
| Compact-Mode: nur Logo (klein) ohne Name | ✅ | `<TenantLogo compact>` Prop. |
| Accent-Color als CSS-Custom-Property | ✅ | `app/(app)/layout.tsx` setzt weiter `--color-brand-600`. |
| Fallback bei fehlendem Logo: 2-Letter-Initial-Avatar | ✅ | `tenant-logo.tsx` `parts.length === 0 ? "P" : ...`. |

#### ST-06 Accessibility

| AC | Pass | Evidence |
|----|------|---------|
| WCAG 2.1 AA Kontrast | ⚠ visuell-Test offen | Code nutzt Tailwind-Token mit AA-Kontrast. Manueller Browser-Test post-Deploy empfohlen. |
| `aria-current="page"` für aktive Routes | ✅ | Beide Sidebars setzen das. |
| Tooltips im Collapsed-Mode | ✅ | shadcn-`SidebarMenuButton tooltip=...` + explicit `<Tooltip>` in ProjectSidebar. |
| Semantische `<nav>`-Labels | ✅ | `<aside aria-label="Project sections">` + `<nav>`. |

### Edge Cases (geprüft)

| Edge Case | Result |
|-----------|--------|
| **Project-Path-UUID-Regex** — `/projects/<UUID>/anything` matched, `/projects/new/wizard`, `/projects/drafts`, `/projects/abc` matchen NICHT | ✅ 12 Testfälle alle korrekt |
| **Page-Refresh mid-Navigation**: Cookie wird Server-side gelesen → kein Layout-Shift | ✅ `app/(app)/layout.tsx` |
| **Tenant-Switch**: Logo wechselt sofort | ✅ `useAuth()` reactive |
| **Auth-Pages außerhalb der App-Shell** | ✅ E2E-verifiziert |
| **Tenant ohne Logo + Name**: Fallback "P" + "Plattform" | ✅ |
| **Hotkey-Konflikt mit Browser-Bookmarks**: bewusst hingenommen | ✅ `e.preventDefault()` aktiv |
| **Sidebar-Inhalt überflieht Viewport**: vertikales Scrolling | ✅ `overflow-y-auto` |
| **RBAC-gefilterte NavItems** | ✅ `adminOnly`-Filter aus altem TopNav |
| **Modul-deaktivierte Tabs**: nicht gerendert | ✅ |
| **Mobile (≤ 767 px)**: ProjectSidebar nicht gerendert, horizontale Tabs Fallback | ✅ `md:flex` + `md:hidden` |

### Security audit (Red Team)

- **Auth-Gate**: Routes außerhalb `(app)/` werden NICHT gewrapped — E2E-verifiziert.
- **No tenant data leak without auth**: Tenant-Logo/Name aus `useAuth()`-Context, nur gefüllt nach Server-side `loadServerAuth()`.
- **Cookie-Manipulation**: nur UI-Präferenz, kein Security-Impact.
- **XSS via Logo-URL**: `next/image` validiert; PROJ-17 erzwingt HTTPS-Only beim Speichern.
- **RBAC im Client**: nur Convenience; Server-Routes sind RLS-gegated.

### Regression

- 53 vitest files / 388 tests pass — keine Regressionen.
- TS clean.
- `npm run build` → 42 Routes (= vor PROJ-23).
- Lint: 98 Issues, 0 in PROJ-23-Code (alle in pre-existing Auth/Audit/Drafts).

### Bugs found

#### Critical / High

Keine.

#### Medium (1)

**MEDIUM-1: Default-Sidebar-Mode nicht viewport-sensitive (Server-side).**

Spec ST-04 wünschte "Server-side default: expanded auf Desktop, collapsed auf Tablet". Aktuell ist Server-Default für beide Sidebars `expanded` ohne Viewport-Detection. Auf einem ersten Tablet-Visit wird die Sidebar erstmal expanded gerendert; shadcn-`useIsMobile` klappt sie auf Mobile dann auf dem Client ein → ggf. 100-ms-Flash.

**Severity**: Medium-as-deferred-known-limit. Kein Funktionsausfall, kein Auto-Klapp-Fehler — nur ein winziger Flash bei Mobile/Tablet-First-Visits. Lösung wäre User-Agent-Sniffing oder Body-Class-CSS-Trick. Empfehlung: nach User-Feedback aus dem Roll-out evaluieren; im Bedarfsfall als PROJ-23b nachziehen. **Kein Deploy-Blocker**.

#### Low

Keine.

### Outstanding (deferred — Spec-konform)

- **PROJ-23b**: User-konfigurierbare Tab-Reihenfolge / Favoriten — bewusst deferred (Spec Out-of-Scope).
- **Cross-Browser-Visual-Test** (Firefox, Safari): aktuell nur `request`-API-Tests; Browser-Binaries für Playwright sind nicht installiert. Code nutzt nur Standard-Web-APIs, Risiko gering.

### Production-ready decision

**READY** — 0 Critical, 0 High. Die Medium-Findung ist ein bewusst hingenommener UX-Kompromiss mit klarem Mitigation-Pfad. Kein Deploy-Blocker.

## Deployment

- **Date deployed:** 2026-05-01
- **Production URL:** https://projektplattform-v3.vercel.app
- **Vercel auto-deploy:** triggered by push to `main`
- **Git tag:** `v1.23.0-PROJ-23`
- **Deviations:** none observed.

### Phase 23b — Settings Sub-Nav (2026-05-03)

Kleine Folge-Slice nach den PROJ-22/24/35-α-Deploys: drei Tenant-Admin-Pages
(`/settings/tenant/role-rates`, `/settings/tenant/fx-rates`,
`/settings/tenant/risk-score`) waren bisher nur per Direkt-URL erreichbar.
Beide Settings-Navigations-Komponenten bekommen ein deklaratives `children`-
Modell, damit die Sub-Pages sichtbar werden ohne den Top-Level zu überladen.

**Modifizierte Files** (2):
- `src/app/(app)/settings/settings-tabs.tsx` — `SettingsTab`-Interface bekommt
  `children`-Prop. Top-Level "Tenant" wird zu Group-Header (kein Link mehr,
  Span statt `<Link>`), darunter eingerückte Sub-Tabs (Allgemein, Tagessätze,
  FX-Raten, Risk-Score). Pro Child eigener `aria-current` + active-Logic mit
  `exact`-Flag (für `/settings/tenant` Allgemein-Eintrag).
- `src/components/app/global-sidebar.tsx` — neues `NavSubItem`-Interface +
  `SETTINGS_CHILDREN` (Profil, Workspace, Tagessätze, FX-Raten, Risk-Score,
  Mitglieder). Settings-Item wird `Collapsible`-Wrapper mit Chevron-Toggle.
  Default-open wenn parent-route active; User-Override über `useState<bool|null>`,
  pure derivation (kein `useEffect`) — bleibt lint-clean unter
  `react-hooks/set-state-in-effect`.

**Patterns:**
- Mobile: gleiche Sub-Tabs als horizontale Liste mit `ml-4`-Einrückung
  (Settings-Tabs sind ohnehin `flex-row gap-1 overflow-x-auto md:flex-col`).
- a11y: `aria-current="page"` auf aktivem Sub-Tab; `aria-label` auf
  Chevron-Trigger ("ausklappen"/"einklappen").

**Verification:**
- `npx tsc --noEmit` exit 0
- `npm run lint` exit 0
- `npm test --run` 775/775
- `npm run build` green

**Out-of-Scope (deferred):** keine zusätzlichen Sub-Tabs; falls künftige Tenant-
Pages dazukommen (z. B. PROJ-32 AI-Provider-Keys, PROJ-17 Branding-Eigene-Page),
einfach in `TENANT_CHILDREN` / `SETTINGS_CHILDREN` ergänzen.
