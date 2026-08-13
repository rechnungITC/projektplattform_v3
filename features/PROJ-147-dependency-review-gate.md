# PROJ-147 — Echte zweite Meinung statt dekorativem Snyk-Check

## Status: In Progress
**Erstellt:** 2026-08-13
**Requires:** PROJ-74 (Supply-Chain-Audit-CI), PROJ-Y-145c/145d (Ruleset-Enrollment-Praxis)

## Problem

Der Required Check **`Snyk production dependency scan`** prüft nichts und meldet trotzdem grün.

Live belegt am Lauf `31697028818` (2026-08-13, 11:47 UTC): der Job hat ausschließlich den Schritt
`Snyk token not configured` ausgeführt, `SNYK_TOKEN:` ist leer, der Schritt `Run Snyk test` erscheint in
der Schrittliste **gar nicht**. `gh secret list` liefert im Repo keine Secrets.

Das ist kein Versehen, sondern eine bewusste Entscheidung, die halb umgesetzt wurde. PROJ-74 notiert:

> ⏳ **Snyk zurückgestellt (2026-06-10)** — `SNYK_TOKEN` wird vorerst nicht konfiguriert. Der Snyk-Job
> ist im Workflow vorhanden und als Required-Check eingetragen, fällt aber im Normalfall durch …
> Folgeticket: PROJ-94 oder Scope in PROJ-67 einbauen (Dependency-Review-Action als ernsthafter
> Snyk-Ersatz ohne externen Account-Zwang)

Zwei Defekte daraus:

1. **Falsche Sicherheit.** PROJ-74 AC 4 verlangte ausdrücklich, den fehlenden Token sichtbar zu machen
   „instead of silently pretending Snyk ran". Der Workflow tut das per Warnung korrekt — aber das
   **Enrollment als Required Check hat die Zusage gebrochen**: in der PR-Oberfläche steht
   `Snyk production dependency scan ✓ pass`. Von sechs blockierenden Gates ist eines dekorativ.
2. **Das Folgeticket ist verloren gegangen.** Es wurde „PROJ-94 oder Scope in PROJ-67" zugeordnet —
   beide längst deployed und sachfremd, also nie verfolgt. Genau die Klasse Buchhaltungsverlust, gegen
   die PROJ-145 angetreten ist.

## Lösung — und der Umweg dahin

**Erster Versuch (fehlgeschlagen, dokumentiert statt überschrieben):** `actions/dependency-review-action`,
das von PROJ-74 vorgesehene Werkzeug. Prämisse war „das Repo ist öffentlich, dort ist der Dependency
Graph standardmäßig aktiv". Die Prämisse war **falsch für dieses Repo** — Lauf `31703387838` bricht ab
mit `Dependency review is not supported on this repository. Please ensure that Dependency graph is
enabled`. Öffentlich genügt nicht: hier sind die Security-Features durchgängig abgeschaltet (Dependency
Graph aus, `dependabot_security_updates: disabled`, Secret Scanning aus). Der Fehler war, aus der Regel
zu schließen statt den Zustand zu prüfen; genau dafür existierte AC-147.2.

**Auch die dokumentierte OSV-GitHub-Action ist kein Ausweg:** sie wird als *reusable workflows*
ausgeliefert, die SARIF ins Code Scanning hochladen und `security-events: write` brauchen — dieselbe
abgeschaltete Feature-Familie.

**Gebaut (User-Entscheid 2026-08-13):** OSV-Scanner als **reine CLI**.

- Version **gepinnt** auf `v2.5.0`, Binary **prüfsummen-verifiziert** gegen `osv-scanner_SHA256SUMS`.
  Ein Supply-Chain-Job, der ein ungepinntes Binary zieht, wäre sein eigenes Loch.
- Braucht **kein** GitHub-Feature, keinen Account, kein Secret — und funktioniert weiter, wenn jemand
  die Repo-Einstellungen erneut umstellt.
- **OSV ist eine andere Advisory-Quelle als npm** — das ist der Sinn einer zweiten Meinung.

### Abdeckung, ehrlich benannt

| | Deckung | Quelle |
|---|---|---|
| `npm audit` | **ganzer** Produktions-Baum (`--omit=dev`), jeder Lauf | npm |
| OSV-Scan | ganzes **Lockfile** — also **auch Dev-Abhängigkeiten** | OSV |

Der OSV-Scan ist damit **breiter**, nicht deckungsgleich. Ein Lockfile-Scan lässt sich nicht auf
Produktion einschränken: weder SBOM-Eingabe noch ein Dev-Filter ist für npm dokumentiert (geprüft in der
OSV-Doku). Falls das PRs an Dev-Advisories blockiert, ist die Antwort eine **Policy-Entscheidung**
(akzeptieren oder Ignore-Liste) — **kein** `continue-on-error`, das würde genau das dekorative Gate
wiederherstellen, das diese Slice entfernt.

## Acceptance Criteria

### Block A — echte zweite Meinung gebaut
- [x] **AC-147.1** Job `OSV scan of the dependency lockfile` in `supply-chain-audit.yml`; osv-scanner
      `v2.5.0` gepinnt und per SHA256 verifiziert; Aufruf `scan -L package-lock.json`.
- [ ] **AC-147.2** Der Job läuft im PR dieser Slice und sein Ergebnis ist **beobachtet**, nicht
      angenommen. Erster Versuch (dependency-review) ist hieran gescheitert — das AC hat funktioniert.
- [ ] **AC-147.3** Der **Fehlerpfad ist bewiesen**: ein Fund macht den Job rot. Ein Gate, das nie
      fehlschlägt, ist von einem dekorativen nicht zu unterscheiden (Muster aus PROJ-136 AC-6). Ist der
      Scan grün, wird der Negativ-Nachweis eigens geführt.
- [x] **AC-147.4** Abgrenzung zu `npm audit` in Workflow **und** CLAUDE.md-Tabelle benannt, inklusive der
      breiteren Dev-Abdeckung.

### Block B — falsche Sicherheit beseitigt
- [x] **AC-147.5** Die CLAUDE.md-Tabelle nennt `Snyk production dependency scan` als **dekorativ**
      (Token bewusst nicht gesetzt, scannt nicht, meldet grün) statt als „second opinion".
- [x] **AC-147.6** Der Warntext des Snyk-Jobs nennt den tatsächlichen Zustand statt einer längst
      erledigten Aufforderung.
- [ ] **AC-147.7** *(Handoff Repo-Eigner)* `Snyk production dependency scan` im Ruleset `main protection`
      **ausgetragen**, `OSV scan of the dependency lockfile` **eingetragen**. Blockiert: die API-Änderung
      wurde in der bauenden Session vom Berechtigungs-Klassifikator abgewiesen (Entfernen eines Required
      Checks). Bewusst **nicht** umgangen.

### Cross-Cutting
- [x] **AC-147.8** Der Snyk-Job bleibt stehen, solange sein Context eingetragen ist — ihn vorher zu
      löschen würde jeden PR dauerhaft auf einen nie gemeldeten Status warten lassen (Selbstblockade).
- [x] **AC-147.9** Kein npm-Dependency, keine Migration, keine `src/`-Änderung.

## Out of Scope (deferred oder erklärte Nicht-Ziele)

- **`SNYK_TOKEN` setzen** — PROJ-74 hat Snyk bewusst zurückgestellt, kein externer Account gewollt.
- **Dependency Graph / Code Scanning einschalten** — Repo-Einstellung des Eigners. Der gewählte CLI-Weg
  macht sie überflüssig; wer sie später aktiviert, kann die Dependency Review zusätzlich einführen.
- **Löschen des Snyk-Jobs** — erst nach AC-147.7 (siehe AC-147.8).
- **Dev-Advisories aus dem OSV-Scan filtern** — Policy-Entscheidung, erst wenn die Praxis zeigt, dass es
  nötig ist.
- **SHA-Pinning der GitHub-Actions** (`actions/checkout@v4` usw.) — der Bestand nutzt durchgehend
  gleitende Majors; eine Slice, die als einzige pinnt, erzeugt Inkonsistenz. Eigener Followup. Das
  osv-scanner-**Binary** ist hier trotzdem gepinnt, weil es Code aus einer fremden Release-Quelle ist.

## Deviations

- **D-147.1** AC-147.7 in der bauenden Session nicht ausführbar. Das *Hinzufügen* eines Required Checks
  war erlaubt (so entstand PROJ-Y-145c), das *Entfernen* hat der Klassifikator abgewiesen. Kein
  Workaround, keine Weitergabe an eine Parallel-Session — das wäre Umgehung einer Rechteentscheidung.
- **D-147.2** Werkzeugwechsel gegenüber PROJ-74s Vorgabe: nicht `dependency-review-action`, sondern
  OSV-Scanner-CLI. Grund ist kein Geschmack, sondern ein gemessener Fehlschlag (Lauf `31703387838`) und
  eine Repo-Einstellung, die nicht in meiner Hand liegt. Vom Nutzer entschieden.
- **D-147.3** Der OSV-Scan ist **breiter** als `npm audit` (Dev-Abhängigkeiten inbegriffen), also keine
  Scope-Parität mit dem ersetzten Snyk-Aufruf. Offengelegt statt behauptet.

## Implementation Notes

`supply-chain-audit.yml`: Job `osv-scanner` (Install mit Pin + Prüfsumme, dann `scan -L
package-lock.json`); Snyk-Warntext auf den echten Zustand umgeschrieben, Job selbst unangetastet.
CLAUDE.md: Snyk-Zeile als dekorativ, neue Zeile für den OSV-Scan mit Abgrenzung und
„not yet enrolled".

**Handoff für AC-147.7** — beides in einem Zug, damit zwischendurch kein Gate fehlt:

```bash
gh api repos/:owner/:repo/rulesets/15992143 > rs.json
# im required_status_checks-Rule:
#   "Snyk production dependency scan"          entfernen
#   "OSV scan of the dependency lockfile"      ergänzen
# dann NUR die schreibbaren Felder senden, sonst gehen deletion /
# non_fast_forward / pull_request verloren:
gh api --method PUT repos/:owner/:repo/rulesets/15992143 --input rs-put.json
gh api repos/:owner/:repo/rulesets/15992143 \
  --jq '.rules[]|select(.type=="required_status_checks")|.parameters.required_status_checks[].context'
```

Danach darf der Snyk-Job entfernt werden (AC-147.8).
