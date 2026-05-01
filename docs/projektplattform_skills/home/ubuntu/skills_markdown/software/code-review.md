---
name: code-review
description: Automatisierte und manuelle Prüfung von Code auf Qualität, Sicherheit und Best Practices.
---

# Code Review

## Übersicht
Dieser Skill sichert die Code-Qualität durch systematische Überprüfung von Pull Requests (PRs) vor dem Merge in den Hauptzweig.

## Anwendungsbereiche
- Pull Request Reviews
- Security Audits
- Architektur-Reviews

## Kernkompetenzen
- **Clean Code Principles**: Prüfung auf Lesbarkeit, Wartbarkeit und DRY/SOLID-Prinzipien.
- **Security Scanning**: Identifikation von Schwachstellen (z.B. OWASP Top 10, SQL-Injection, XSS).
- **Performance-Optimierung**: Erkennung von ineffizienten Algorithmen oder Speicherlecks.
- **Test-Coverage**: Sicherstellung ausreichender Unit- und Integrationstests.

## Workflow
1. Automatisierte Checks durchlaufen lassen (Linter, SAST, Unit Tests).
2. Manuelles Review des Codes im Kontext der User Story durchführen.
3. Konstruktives Feedback geben (z.B. "Nitpick:", "Suggestion:", "Blocker:").
4. Änderungen durch den Autor einarbeiten lassen.
5. PR approven und mergen.

## Best Practices
- Reviews zeitnah durchführen, um Blockaden zu vermeiden.
- Code-Richtlinien (Styleguides) im Team vereinbaren und dokumentieren.
