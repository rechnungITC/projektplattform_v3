---
id: PROJ-Y-143m
title: "Restliche englische Oberflächentexte"
issue_type: Bug
epic_code: HYGIENE
epic_title: "Hygiene & Supply-Chain"
priority: Medium
priority_source: "Should"
labels: ["hygiene", "ui", "ux", "i18n"]
dependencies: ["PROJ-Y-143e", "PROJ-51"]
roles: ["Platform"]
summary_for_jira: "[HYGIENE] Auth, Einstellungen, Projektraum und Zustands-Labels auf Deutsch"
---

# PROJ-Y-143m: der Rest der Oberfläche

## Status: Deployed
## Deployment Scope: full
**Created:** 2026-08-12
**Deployed:** 2026-08-12 — Tag `v2.54.0-PROJ-Y-143m`
**Origin:** aus PROJ-Y-143e herausgehaltener Umfang (Nutzer-Lock).

## Umfang

Übersetzt wurden die Flächen, die 143e bewusst ausgelassen hatte:

| Fläche | vorher |
|---|---|
| `/login`, `/signup`, `/forgot-password`, `/reset-password` | vollständig englisch, inkl. Zod-Fehlermeldungen und Toasts |
| `/settings` (Layout-Kopf + Profil + Passwort) | „Settings", „Manage your profile, workspace, and team.", „Save changes" … |
| Projektraum-Übersicht | „Back to projects", „Edit", „Lifecycle action", „Master data", „Danger zone", „Move to trash" |
| Projekt-Tabelle + Lösch-Dialog | „View", „Restore", „Delete forever", „Move project to trash?", „Cancel" |

**Über den Auftrag hinaus, bewusst:** die Zustands-Labels in `src/types/project.ts`
(`LIFECYCLE_STATUS_LABELS`, `PROJECT_TYPE_LABELS`) standen auf „Draft/Active/Paused/…" und
„General/Construction". Das sind die sichtbarsten englischen Reste überhaupt — sie erscheinen
als Badges auf Projektkarten, in Filtern, im Projektraum und im Skills-Katalog (13 Konsumenten).
Übersetzt wurden nur die **Anzeigewerte**; die Schlüssel und die Fachbegriffe „ERP", „Software"
und „M&A" bleiben unverändert. Kein Test hing an den englischen Zeichenketten.

Unverändert bleiben „Workspace", „Work Item" und „Reports" — etablierte Produkt-/Domänenbegriffe
(vgl. 143e).

## Der eigentliche Fund: vier Baselines waren falsch **und grün**

Nach der Übersetzung meldeten von den vier Unauth-Baselines nur zwei einen Unterschied.
`login.png` und `login-dark.png` blieben grün — obwohl die Seite nachweislich anderen Text
rendert. Gemessen:

| Baseline | echte Abweichung | erlaubt |
|---|---|---|
| `login` | **5.213 px** | 9.216 px (`maxDiffPixelRatio: 0.01`) |
| `login-dark` | **4.527 px** | 18.432 px (`0.02`, „für Theme-Flips") |

Die Bilder zeigten also englischen Text, den es nicht mehr gibt, und der Test nickte das ab.
Das ist exakt der blinde Fleck, den PROJ-Y-143g für die **authentifizierte** Suite ausgemessen
hat — diese Datei war dort ausdrücklich nicht im Umfang, und die Lücke ist seitdem offen
geblieben.

Behoben mit derselben Methode: Rauschen gemessen (**0 px** über drei Läufe bei Toleranz 0),
Schranke auf **`maxDiffPixels: 20`** gesetzt — dieselbe wie in der authentifizierten Suite.
Alle vier Unauth-Baselines plus `settings`, `settings-tenant` und `project-room` neu gezogen,
zwei davon im Bild geprüft.

## Acceptance Criteria

- **AC-Y143m.1** — Auth-Strecke, Einstellungen und Projektraum-Übersicht ohne englischen
  Oberflächentext. ✅ live nachgelesen.
- **AC-Y143m.2** — Zustands- und Typ-Labels deutsch, Schlüssel und Fachbegriffe unberührt. ✅
- **AC-Y143m.3** — Betroffene Baselines neu gezogen und im geladenen Zustand geprüft. ✅ 7 Stück.
- **AC-Y143m.4** — Die Unauth-Suite kann eine Textänderung künftig nicht mehr verschlucken. ✅
  gemessene Schranke statt Verhältnis.
- **AC-Y143m.5** — Keine Regression. ✅ volle E2E **403 passed**, vitest **2904/2904**.

## Gates

vitest **2904/2904** · ESLint **0** · tsc **13 = Baseline** · `npm run build` clean · Visual
**13/13** (4 unauth + 9 authenticated) · volle E2E-Suite **403 passed**.

## Deviations

- **D-Y143m.1** — Die Zustands-/Typ-Labels waren nicht Teil des benannten Umfangs, sind aber
  die sichtbarsten Reste und über 13 Konsumenten wirksam. Blast-Radius geprüft, kein Test
  betroffen.
- **D-Y143m.2** — Die Toleranz-Verschärfung der Unauth-Suite gehört sachlich zu PROJ-Y-143g;
  ohne sie hätte diese Slice zwei Baselines hinterlassen, die bekannt falsch und grün sind.
- **D-Y143m.3** — Ein Fehlschlag in der Voll-Suite: `PROJ-1-2-live-closure` (Supabase-Mail-
  Kontingent unter Last, isoliert grün) — vorbestehend, dokumentiert in PROJ-78 F-4.
- **D-Y143m.4** — Mobile Safari übersprungen (WebKit-Host-Libs, PROJ-67/F2).

## Followups

- Offen aus der Reihe: **PROJ-Y-143c** (Alt-Mandant, braucht Freigabe), **PROJ-Y-143k**
  (Modul-Gating der Stammdaten-Kacheln), **PROJ-Y-143l** (eigener Visual-Test-Nutzer).
- Nicht systematisch geprüft: Texte in tiefer liegenden Dialogen und Sheets, die keine Baseline
  tragen. Eine belastbare Aussage bräuchte einen Extraktionslauf über alle JSX-Textknoten statt
  einer Sichtprüfung — hier bewusst nicht behauptet.
