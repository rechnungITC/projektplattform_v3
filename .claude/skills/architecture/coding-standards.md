> Originally from V2 (`.claude/skills/coding-standards.md`). Stack-specific references retained; treat as principle, not literal.

# coding-standards.md

## Zweck

Verhaltensvorlage für Claude beim Schreiben und Review von Code in
diesem Repo. Ergänzt [code-review.md](code-review.md) (Review-Blick) um
einen **aktiven Coding-Guard** (was ich beim *Schreiben* berücksichtigen
muss).

Die Referenz-Prinzipien liegen in
[`references/coding-standards/`](../../references/coding-standards/):

- [`README.md`](../../references/coding-standards/README.md) — Leitplanken
- [`bug-analysis.md`](../../references/coding-standards/bug-analysis.md) — Risiko- und Bug-Triage
- [`refactoring.md`](../../references/coding-standards/refactoring.md) — Zielstruktur + Refactoring-Schnitte
- [`test-creation.md`](../../references/coding-standards/test-creation.md) — Teststrategie
- [`plan-projektplattform.md`](../../references/coding-standards/plan-projektplattform.md) — Arbeitsstrang-Plan

---

## Einsatzfälle

- bevor ich einen Edit / Write ausführe, der mehr als eine Zeile berührt
- beim Entwerfen neuer Services oder Router
- beim Entwerfen neuer Frontend-Komponenten
- beim Schreiben / Erweitern von Tests
- bei Refactoring-Vorschlägen

---

## Harte Regeln (nicht verhandelbar)

Aus `CLAUDE.md` und den Referenzen:

1. **Schichten**: `domain/` importiert **keine** FastAPI / SQLAlchemy-Session an der öffentlichen API; `routers/` ist Orchestrierung, keine Business-Logik; `services/` sind Prozess-Services, keine Fachlogik.
2. **Extensions**: `domain/<extension>/` importiert nur aus `domain/core/`, nie aus Schwester-Extensions.
3. **Frontend**: Server-Components by default; Client-Components nur wo nötig; shared Types in `packages/`.
4. **Keine Fremd-Frameworks**: kein PHP, kein Laravel, kein Django — nur der Ziel-Stack aus `CLAUDE.md`.
5. **Keine Geheimnisse im Code / Commit**: keine API-Keys, keine Passwörter, keine Connection-Strings.
6. **Keine AI-Writes in Business-Daten ohne Review**: jede KI-Ausgabe landet in `work_item_suggestions` o. ä. mit Review-Flow (EP-10-ST-04).
7. **Tenant-Isolation**: jede Query auf Projekt-scope-Tabellen filtert `tenant_id`. Tests müssen Cross-Tenant-Fälle abdecken.
8. **Audit**: jede PATCH-Route auf einer audit-registrierten Entität schreibt über `AuditLog.record_diff` (siehe `services/audit.py`).
9. **Klasse-3-Gate**: Felder, die in `services/data_privacy.py` als Klasse 3 markiert sind, gehen niemals an externe LLMs; der `ModelRouter` ist der einzige Pfad.
10. **Compliance-Abhängigkeiten mitdenken**: siehe unten.

---

## Coding-Haltung

- **Clarity over cleverness** — lieber eine Zeile mehr, die ein Reviewer versteht.
- **Explicit over magic** — keine versteckten Mutations, keine Thread-Locals mit Sideeffect-Importen.
- **Traceability over convenience** — State-Übergänge sichtbar (Audit, Lifecycle-Events).
- **Stable interfaces over ad-hoc coupling** — Typen / Schemas früh fixieren, nicht in jedem Router neu erfinden.

- **Kommentare sparsam**: standardmäßig **keine**. Ein Kommentar ist nur dann berechtigt, wenn das *Warum* nicht-offensichtlich ist (versteckte Invariante, Work-around für einen konkreten Bug, Verhalten, das einen Leser überraschen würde). Erkläre **nie** das *Was* — das erledigen gute Namen. Kein „used by X" / „added for Y flow" — das gehört in die PR-Beschreibung.
- **Keine toten Abwärtskompatibilitäts-Shims**: Wenn etwas unbenutzt ist → löschen. Keine umbenannten `_vars`, keine `// removed`-Kommentare.
- **Kein defensiver Overkill**: Validiere an Systemgrenzen (User-Input, externe APIs). Interner Code und Framework-Garantien dürfen vertraut werden.
- **Kein Feature-Kriech im Bugfix**: Bugfixes fassen keine unverwandten Dateien an.

---

## Tests

Detailliert: [`references/coding-standards/test-creation.md`](../../references/coding-standards/test-creation.md).

Kompakt:
- **Neues Verhalten → neuer Test**. Reiner Refactor ohne Verhaltensänderung → bestehende Tests bleiben grün und decken das Verhalten ab.
- **Integration über Mocks, wenn's geht**: unser pytest-Setup nutzt echtes Postgres. Nur Adapters nach außen (SMTP, Slack, Anthropic, Jira) werden gemockt.
- **Cross-Tenant**: jeder Router-Endpoint braucht mindestens einen Test, der zeigt, dass ein zweiter Tenant 404/403 sieht.
- **RBAC**: jeder Write-Endpoint braucht einen „non-admin bekommt 403"-Test, wenn er admin-only ist.
- **Async-Markierung**: `asyncio_mode = "auto"` — kein module-level `pytestmark = pytest.mark.asyncio` mehr setzen; async-Funktionen werden automatisch erkannt.

---

## Migrations

- Alembic-Migrationen sind **rückrollbar** (Downgrade muss eindeutig sein).
- Neue Tabellen kriegen `tenant_id` + CASCADE-FK auf `tenants` + einen Index auf `tenant_id`, sobald sie projekt-scope sind.
- CHECK-Constraints für Enums auf Datenbank-Ebene (nicht nur Pydantic).
- Migration anwenden + Test-Konftest erweitern (`_TABLES` in `apps/api/tests/conftest.py`), sonst laufen alte Tests scheinbar grün, die neue Tabelle aber nicht truncated.

---

## Compliance-Abhängigkeiten beim Coden

Bei jeder neuen Story oder jedem neuen Arbeitspaket **prüfen**, ob
Compliance- oder Prozess-Artefakte mitentstehen müssen — siehe
[`planning/decisions/compliance-as-dependency.md`](../../planning/decisions/compliance-as-dependency.md)
und [`EP-16`](../../planning/epics/ep-16-compliance-automatik.md).

Konkret beim Coden: Wenn eine Story oder ein Arbeitspaket mit einem
Compliance- oder Prozess-Tag markiert ist (z. B. `iso-9001`, `dsgvo`,
`microsoft-365-intro`, `vendor-evaluation`, `change-management`), muss
der Code, der die Story umsetzt, die notwendigen Folge-Objekte **mit
anlegen** (Template-Dokument, Review-Task, Checkliste). Der
`ComplianceTrigger`-Service (EP-16-ST-02) ist dafür der einzige
orchestrierte Pfad. Nicht direkt aus dem Router-Code Templates
instanziieren — den Trigger rufen.

---

## Ausgabeverhalten

- **Keine Zusammenfassung am Ende jeder Änderung**, die nur den Diff wiederholt.
- **Bei UI-Änderungen**: Dev-Server starten und im Browser die geänderte Funktion tatsächlich benutzen. Type-Check und Build bestätigen nur die Typ-Korrektheit, nicht die Feature-Korrektheit.
- **Wenn ich etwas nicht testen kann**: das explizit sagen, keine falschen „works"-Behauptungen.

---

## Kompakte Master-Anweisung

Schreibe Code so, dass er in diesem Monorepo in fünf Jahren noch
verständlich ist: klare Schichten, explizite Typen, sichtbare
State-Transitionen, keine versteckten Nebenwirkungen, Audit-Hooks überall
wo sie hingehören, Tenant-Isolation selbstverständlich und
Compliance-Folgen als *Teil* des Features, nicht als späterer Anbau.
