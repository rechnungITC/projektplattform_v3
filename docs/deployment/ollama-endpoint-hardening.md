# Ollama-Endpoint absichern (Tenant-Class-3-Provider)

> Stand 2026-06-10: Der für den Pilot-Tenant registrierte Ollama-Endpoint
> (`http://187.124.190.116:32768`, Hostinger) ist **öffentlich und ohne
> Authentifizierung** erreichbar. Jeder, der die IP/den Port findet, kann
> Inferenz auf deine Kosten fahren, Modelle pullen/löschen und die Maschine
> auslasten. Class-3-Inhalte (Prompts mit personenbezogenen Daten) laufen
> zudem unverschlüsselt über HTTP. Beides ist für einen Pilot-Test tragbar,
> für echten Betrieb nicht.

## Was die Plattform bereits kann

Die Tenant-Provider-Config (PROJ-32-c) unterstützt ein optionales
`bearer_token`, das bei jedem Request als `Authorization: Bearer <token>`
mitgesendet wird. **Ollama selbst prüft keine Tokens** — die Prüfung muss ein
vorgeschalteter Reverse-Proxy übernehmen.

## Empfohlene Härtung (auf dem Ollama-Host auszuführen)

### Variante A — Reverse-Proxy mit Bearer-Token (empfohlen)

1. Ollama nur noch lokal binden (z.B. Docker-Port-Mapping auf `127.0.0.1`
   statt `0.0.0.0`, oder `OLLAMA_HOST=127.0.0.1`).
2. Caddy/nginx davor, Beispiel Caddy (`Caddyfile`):

   ```caddy
   ki.example.com {
     @noauth not header Authorization "Bearer <LANGER_ZUFALLS_TOKEN>"
     respond @noauth 401
     reverse_proxy 127.0.0.1:11434
   }
   ```

   Damit gibt es zugleich TLS (Let's Encrypt) — Class-3-Prompts laufen dann
   verschlüsselt.
3. In der Plattform unter **Einstellungen → KI-Provider → Ollama** den
   Endpoint auf `https://ki.example.com` ändern und das Token im Feld
   `bearer_token` hinterlegen (Re-Validierung läuft automatisch).

### Variante B — Firewall-Allowlist (Minimallösung, ohne TLS)

Port 32768 per `ufw`/Hostinger-Firewall nur für die ausgehenden IPs von
Vercel (Region `iad1`) und deine eigene IP freigeben. Nachteil: Vercel-IPs
wechseln; ohne TLS bleiben Class-3-Prompts im Klartext unterwegs.
Nur als Übergang geeignet.

### Sofort prüfbar

```bash
# Darf nach der Härtung KEIN 200 mehr ohne Token liefern:
curl -s -o /dev/null -w "%{http_code}\n" http://187.124.190.116:32768/api/tags
```

## Offene Aufgabe

- [ ] Härtung auf dem Hostinger-Host umsetzen (braucht SSH-Zugang — von der
      Entwicklungsumgebung aus nicht möglich) und danach die Provider-Config
      auf HTTPS-Endpoint + `bearer_token` umstellen.
