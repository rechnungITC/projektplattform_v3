---
name: ci-cd-setup
description: Konfiguration von Build-, Test- und Deployment-Pipelines.
---

# CI/CD Setup

## Übersicht
Dieser Skill automatisiert den Prozess von der Code-Änderung bis zur Bereitstellung in der Produktionsumgebung.

## Anwendungsbereiche
- Continuous Integration (CI)
- Continuous Delivery / Deployment (CD)
- Infrastructure as Code (IaC)

## Kernkompetenzen
- **Pipeline-Design**: Definition von Build-, Test- und Deploy-Stages (z.B. GitHub Actions, GitLab CI, Jenkins).
- **Containerisierung**: Erstellung von Dockerfiles und Image-Management.
- **Environment Management**: Verwaltung von Dev-, Staging- und Prod-Umgebungen.
- **Secret Management**: Sicherer Umgang mit API-Keys und Passwörtern.

## Workflow
1. Pipeline-Konfigurationsdatei (z.B. `.gitlab-ci.yml` oder `.github/workflows/main.yml`) erstellen.
2. Build-Stage definieren (Abhängigkeiten installieren, Code kompilieren).
3. Test-Stage definieren (Unit-, Integrations-, und E2E-Tests ausführen).
4. Deploy-Stage definieren (z.B. Push zu AWS, Azure, Kubernetes).
5. Pipeline testen und bei Fehlern iterativ anpassen.

## Best Practices
- Pipelines so schnell wie möglich halten (z.B. durch Caching).
- "Fail fast" - schnelle Tests (Unit Tests) vor langsamen Tests (E2E) ausführen.
