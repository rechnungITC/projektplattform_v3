> **Inherited from V2** — Decision still applies to V3. Stack-specific references (FastAPI, Redis, etc.) are historical; Supabase/Next.js V3 implementations follow the same principle.

# Decision Record — Betriebsmodi und Update-Strategie

**EP-01-ST-03 / PP-72** + **EP-01-ST-04 / PP-73** · Stand: 2026-04-23

---

## Kontext

Zwei eng verwandte EP-01-Stories:

- **EP-01-ST-03 — Stand-alone-Modus**: Die Plattform muss auch in einem dedizierten Kundennetz betreibbar sein, nicht nur als Multi-Tenant-SaaS.
- **EP-01-ST-04 — Update-/Betriebsstrategie**: Updates, Backups und Wiederanlauf müssen ohne Mandanten-Ausfall möglich sein.

Beide sind AK-nah am gleichen Thema — Betrieb als Produkt. Wir dokumentieren sie gemeinsam, trennen aber die Einzel-AK.

## Entscheidung

### Zwei Betriebsmodi

| Modus | Zielgruppe | Tenant-Modell | Infra |
|---|---|---|---|
| **Shared Hosting** | mehrere Kunden (SaaS) | Multi-Tenant, Isolation auf DB-Ebene (EP-01-ST-01/02) | eine Codebasis, eine DB, mehrere `tenants`-Rows |
| **Stand-alone** | einzelner Kunde, eigene Infrastruktur | Single-Tenant (ein `tenants`-Eintrag) | separate DB, separate App-Instanz, eigene S3, eigener Redis |

Die **gleiche Codebasis** deckt beide Modi ab. Der Unterschied ist rein konfiguratorisch:

- Shared: `PPV2_MODE=shared`, Multi-Tenant-Login.
- Stand-alone: `PPV2_MODE=standalone`, ein Tenant-Slug in der Config fixiert, Cross-Tenant-Dialoge in der UI versteckt.

Die Konfigurationen wurden bewusst in Settings gebündelt, nicht in separate Branches. Damit ist EP-01-ST-03 AK „Wechsel zwischen Modi ohne Code-Änderung" erfüllt.

### Daten- und Speicher-Grenzen im Stand-alone

Per Deployment einmal vereinbart:

- **PostgreSQL**: eigene Instanz; Backups via pg_basebackup + WAL-Archivierung.
- **Redis**: eigene Instanz (kein shared).
- **S3-kompatibles Storage**: eigener Bucket (MinIO bei On-Prem).
- **KI**: keine externen Calls ohne Freigabe — EP-10-ST-02 bleibt auch im Stand-alone aktiv.

### Update-Strategie (EP-01-ST-04)

Ein Release ist ein Tripel aus:
- App-Container (FastAPI + Next.js + Worker)
- DB-Migration (Alembic)
- optionale Config-Änderungen

**Reihenfolge (backward-kompatibel, Zero-Downtime-fähig):**

1. **Migration zuerst**, Code muss mit neuer Schemaversion lauffähig sein (rolling deploy verträgt ein Schema mit zusätzlichen Spalten).
2. **Config-Schwenks** werden als feature flags ausgerollt; Default-off bei risikoreichen Änderungen.
3. **App-Container** rollen blue/green oder canary; Healthcheck auf `/health` vor Umschwung.
4. **Worker** werden zuletzt erneuert, da sie Jobs replayen können.

**Rückrollbar**:
- Alembic-Downgrade bis zur vorherigen Revision.
- Container-Image wird mit Version getaggt; Rollback = re-deploy des vorherigen Tags.
- Config-Änderungen sind reversibel (Feature Flags).

**Backups**:
- DB: tägliches Full-Backup, WAL-Archiv kontinuierlich.
- Objektspeicher: Versionierung im Bucket.
- Retention per Tenant im Stand-alone über Config (`PPV2_RETENTION_DAYS`) — siehe F13.7 für Audit-Log-spezifische Regeln.

**Wiederanlauf**:
- Cold-Restore: DB aus letztem Backup + WAL-Replay bis zum gewünschten Zeitpunkt.
- Warm-Restore (später): Streaming-Replication-Standby. Nicht Bestandteil der MVP.

### Was diese Stories explizit **nicht** liefern

- **Kein Auto-Update**-Mechanismus. Updates sind DevOps-Aktion.
- **Kein Migrationstool** zwischen Betriebsmodi — ein Tenant bleibt bei seinem Modus, ein Wechsel ist ein neuer Deploy.
- **Keine Hot-Standby**-Architektur in MVP.
- **Keine eigene Observability-Stack**-Entscheidung — das kommt in einer separaten Runtime-Story.

## Konsequenzen

- Tests dürfen Multi-Tenant-Logik nicht auskommentieren; alle Isolations-AK müssen auch im Stand-alone greifen (ein Tenant, aber der gleiche Code).
- Alembic-Revisionen sind ein vertrags-bindendes Artefakt zwischen Releases. Downgrades müssen funktionieren, solange ein Release nicht mehrere Migrationen bündelt, die zusammen nicht rückrollbar sind.
- Config-Dokumentation (`infra/`) muss beide Modi abbilden.
- CI sollte eine Sanity-Migration-Upgrade+Downgrade-Runde fahren, um Alembic-Drift zu verhindern. Wird nachgezogen.

## Offene Punkte

- Feature-Flag-Infrastruktur: heute ad-hoc per Env-Vars. Sobald mehr als eine Handvoll Flags existiert, migrieren wir auf eine saubere Lib (`flagsmith` oder eigen).
- Beobachtbarkeit im Stand-alone: Logs/Prometheus/Jaeger — offene Stellgrößen, in eigener Story.
