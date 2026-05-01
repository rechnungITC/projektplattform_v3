---
name: api-design
description: Entwurf und Dokumentation von REST/GraphQL-Schnittstellen (OpenAPI/Swagger).
---

# API Design

## Übersicht
Dieser Skill befasst sich mit dem systematischen Entwurf robuster, sicherer und gut dokumentierter Schnittstellen für Webanwendungen und Microservices.

## Anwendungsbereiche
- Backend-Entwicklung
- Systemintegration
- Bereitstellung von Public APIs

## Kernkompetenzen
- **RESTful Principles**: Ressourcenorientiertes Design, korrekte Nutzung von HTTP-Methoden und Statuscodes.
- **GraphQL**: Entwurf von flexiblen Schemas und Resolvern.
- **API-Dokumentation**: Erstellung von OpenAPI/Swagger-Spezifikationen.
- **Versionierung**: Strategien zur abwärtskompatiblen Weiterentwicklung von APIs (z.B. `/v1/`, Header-basiert).

## Workflow
1. Anforderungen und Use Cases mit Frontend-Entwicklern oder Integrationspartnern abstimmen.
2. Ressourcen und Endpunkte definieren.
3. Request- und Response-Payloads (JSON-Schemas) spezifizieren.
4. API-Spezifikation (z.B. `openapi.yaml`) schreiben.
5. Mock-Server bereitstellen, damit das Frontend-Team parallel arbeiten kann.

## Best Practices
- "API-First" Ansatz verfolgen: Erst dokumentieren, dann implementieren.
- Pagination, Filtering und Sorting für Listen-Endpunkte standardisieren.
