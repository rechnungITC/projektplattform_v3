# PROJ-51: Modern UI/UX & Motion System

## Status: Planned
**Created:** 2026-05-06
**Last Updated:** 2026-05-06

## Kontext

Die Plattform nutzt bereits eine moderne Frontend-Basis mit Next.js, React, Tailwind, Radix/shadcn-Komponenten und Sonner. Damit ist ein UI/UX-Update ohne neues UI-System moeglich. Der bestehende Design-System-Stand liegt in `docs/design/design-system.md`, ist aber noch nicht konsistent in `tailwind.config.ts`, `globals.css` und die shadcn-Token verdrahtet.

User-Ziel (2026-05-06): Die Oberflaeche soll moderner werden, Corporate-Farben sollen fuer bestimmte Elemente pflegbar sein, Buttons sollen mit leichten Schatten und Hover-Effekten arbeiten, und Animationen sollen sauber statt wild eingebaut werden.

PROJ-51 ist deshalb kein einzelner Redesign-Big-Bang, sondern ein kontrollierter Design-System-Slice: erst Audit und Tokens, dann Corporate-Farben, dann Motion, danach gezielte Komponentenmigration.

## Dependencies

- **Requires:** PROJ-17 (Tenant Administration) — Tenant-Branding und Settings-Oberflaeche.
- **Requires:** PROJ-23 (Sidebar Global) — globaler Navigationsrahmen.
- **Requires:** PROJ-7 (Project Room) — wichtigste operative Projektoberflaeche.
- **Requires:** shadcn/Radix-Komponentenbestand — bestehendes UI-System bleibt Grundlage.
- **Requires:** `docs/design/design-system.md` — Ziel-Tokens und visuelle Referenz.
- **CIA-Review empfohlen** — Design-System-Aenderungen haben breite Oberflaechenwirkung.

## Slice-Struktur

| Slice | Inhalt | Schema-Change | Status |
|---|---|---|---|
| **51-alpha** | UI/UX Audit + Token-Inventar + Zielzustand dokumentieren | Nein | Planned |
| **51-beta** | Corporate-Farben als CSS-Variablen und Tenant-Branding-Anwendung fuer ausgewaehlte Elemente | Nein | Planned |
| **51-gamma** | Button-/Badge-/Card-Refresh mit Hover, Focus, Schatten und reduzierter Bewegung | Nein | Planned |
| **51-delta** | Motion-Layer fuer Microinteractions, Presence und View-Wechsel | Nein | Planned |
| **51-epsilon** | Project-Room/Dashboard-Anwendung und visuelle Regression | Nein | Planned |

## User Stories

1. **Als Tenant-Admin** moechte ich bestimmte UI-Elemente in Corporate-Farben anzeigen koennen, damit die Plattform zur Marke meines Unternehmens passt.
2. **Als PM** moechte ich Buttons, Status-Badges und Dashboard-Kacheln mit klaren Hover-/Focus-Zustaenden sehen, damit interaktive Elemente sofort erkennbar sind.
3. **Als Nutzer** moechte ich dezente Animationen bei View-Wechseln, Dialogen und Statusaenderungen erleben, damit die App moderner wirkt, ohne mich abzulenken.
4. **Als Nutzer mit reduzierter Bewegung** moechte ich, dass Animationen `prefers-reduced-motion` respektieren, damit die App barrierearm bleibt.
5. **Als Entwickler** moechte ich zentrale Design-Tokens statt komponentenweiser Sonderfarben nutzen, damit neue Features konsistent aussehen und wartbar bleiben.
6. **Als QA/CI-Verantwortlicher** moechte ich visuelle Regressionen fuer zentrale Screens pruefen koennen, damit ein Redesign keine unbemerkten Layout-Brueche erzeugt.

## Acceptance Criteria — 51-alpha UI/UX Audit + Tokens

- [ ] AC-1: Bestehende Design-Dokumente (`docs/design/design-system.md`, Dashboard-Templates) sind gegen aktuellen Codebestand abgeglichen.
- [ ] AC-2: Aktuelle globale Token in `globals.css`, `tailwind.config.ts` und shadcn-Komponenten sind dokumentiert.
- [ ] AC-3: Abweichungen zwischen Ziel-Design-System und realem UI sind als Liste mit betroffenen Bereichen erfasst.
- [ ] AC-4: Entscheidung dokumentiert, welche Tokens global werden und welche nur Tenant-/Branding-spezifisch sind.
- [ ] AC-5: CIA/GitNexus-Impact fuer gemeinsam genutzte UI-Komponenten (`Button`, `Badge`, `Card`, `Sidebar`, `Input`, `Select`) ist dokumentiert, bevor Code geaendert wird.
- [ ] AC-6: Kein visueller Big-Bang in alpha; alpha liefert Dokumentation und Migrationsplan.

## Acceptance Criteria — 51-beta Corporate-Farben

- [ ] AC-7: Corporate-Farben werden ueber CSS-Variablen abgebildet, nicht durch harte Tailwind-Farben in einzelnen Komponenten.
- [ ] AC-8: Tenant-Branding kann mindestens Accent/Primary fuer ausgewaehlte Elemente beeinflussen: Primary-Buttons, aktive Navigation, wichtige Status-Akzente.
- [ ] AC-9: Fallback-Tokens greifen, wenn keine Tenant-Farbe gesetzt ist.
- [ ] AC-10: Kontrast bleibt lesbar; fuer zu helle/dunkle Corporate-Farben wird ein sicherer Textkontrast gewaehlt.
- [ ] AC-11: PDF-/Report-Branding aus PROJ-21 bleibt kompatibel und wird nicht durch App-Chrome-Tokens gebrochen.

## Acceptance Criteria — 51-gamma Component Refresh

- [ ] AC-12: Buttons erhalten konsistente Hover-, Active-, Focus-visible- und Disabled-Zustaende.
- [ ] AC-13: Leichte Schatten werden nur fuer interaktive oder elevated Elemente verwendet; keine grossflaechigen Card-in-Card-Layouts.
- [ ] AC-14: Badges, Inputs, Selects und Dialoge nutzen konsistente Radius-, Border-, Shadow- und Spacing-Tokens.
- [ ] AC-15: Existing shadcn/Radix-Komponenten bleiben die Basis; kein zweites UI-System wird eingefuehrt.
- [ ] AC-16: Layouts bleiben auf Mobile und Desktop ohne Textueberlauf und ohne inkonsistente Ueberlappungen.

## Acceptance Criteria — 51-delta Motion Layer

- [ ] AC-17: Kleine Microinteractions nutzen zuerst Tailwind-Transitions und `motion-safe`/`motion-reduce`.
- [ ] AC-18: Komplexere Animationen (Presence, Layout, Drag, Page/View-Wechsel) werden nur mit einer dedizierten Motion-Library umgesetzt, wenn Tailwind nicht reicht.
- [ ] AC-19: View Transition API wird fuer Seiten-/Viewwechsel evaluiert, aber nur genutzt, wenn sie progressiv und ohne funktionalen Bruch funktioniert.
- [ ] AC-20: Alle Animationen respektieren `prefers-reduced-motion`.
- [ ] AC-21: Animationen duerfen Lade-, Speicher- oder PDF-Status nicht verdecken; Status muss weiterhin deterministisch sichtbar sein.

## Acceptance Criteria — 51-epsilon Project-Room Anwendung

- [ ] AC-22: Project-Room Dashboard nutzt die neuen Tokens fuer Health, Budget, Risiken, Status und Aktionen.
- [ ] AC-23: Health-/Budget-/Risk-Kacheln zeigen Datenquellen und leere Zustaende klar an.
- [ ] AC-24: UI-Aenderungen werden auf den wichtigsten Screens per Screenshot/Playwright geprueft.
- [ ] AC-25: Lint und relevante Frontend-Tests laufen gruen; bekannte React-Compiler-Warnungen werden separat bewertet und nicht als Styling-Fix versteckt.

## Edge Cases

- **EC-1: Tenant-Farbe mit schlechtem Kontrast** — UI muss automatisch lesbaren Vordergrund waehlen oder auf Fallback wechseln.
- **EC-2: User bevorzugt reduzierte Bewegung** — Animationen werden entfernt oder stark reduziert, ohne Layoutspruenge.
- **EC-3: PDF/Print-Kontext** — Print-Styles aus PROJ-21 duerfen nicht durch App-Animationen oder App-Backgrounds verschmutzt werden.
- **EC-4: Dark-/Light-Mischzustand** — solange kein vollstaendiger Theme-Switch existiert, muessen neue Tokens zum bestehenden Theme passen.
- **EC-5: Bestehende Feature-Slices mit eigenen Farben** — Sonderfarben werden nur migriert, wenn sie semantisch in globale Tokens passen.

## Technical Requirements

- **Token-Quelle:** CSS-Variablen in `globals.css`, Tailwind-Mapping in `tailwind.config.ts`.
- **Komponentenbasis:** shadcn/Radix bleibt verbindlich.
- **Animationen:** Tailwind-Transitions fuer einfache States; Motion-Library nur fuer klar begruendete komplexere Faelle.
- **Accessibility:** `focus-visible`, Kontrast, Tastaturbedienung und `prefers-reduced-motion` sind Pflicht.
- **QA:** Visuelle Regression fuer Project Room, Settings/Tenant, Reports und zentrale Dialoge.
- **GitNexus/CIA:** Vor Aenderungen an geteilten Komponenten Impact-Analyse dokumentieren.

## Out-of-Scope

- Vollstaendiger Theme-Builder fuer beliebig viele Paletten.
- Migration aller Screens in einem Schritt.
- Neues komponentenfremdes UI-Framework.
- Marketing-Landingpage-Redesign.
- PDF-Render-Pending-Fix — gehoert zu PROJ-21 Output Rendering.

## Implementation Notes

Noch nicht implementiert. Dieser Spec schliesst die bisherige Dokumentationsluecke: `features/INDEX.md` referenziert PROJ-51 bereits, die Spec-Datei fehlte jedoch im Repo.

## QA Test Results

_To be added by /qa_

## Deployment

_To be added by /deploy_
