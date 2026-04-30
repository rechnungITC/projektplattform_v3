# Tech-Design: OpenProject Reference Patterns

Dieses Dokument fasst die Kernkonzepte der OpenProject-Codebasis zusammen, die für das Tech-Design relevant sind. Die Analyse basiert auf dem aktuellen `dev`-Branch des offiziellen OpenProject-Repositories.

## 1. Work Packages (Arbeitspakete)

Work Packages bilden das zentrale Element in OpenProject für Aufgaben, Meilensteine, Phasen und Fehler.

Das Modell `WorkPackage` (`app/models/work_package.rb`) integriert zahlreiche Concerns, um die komplexe Geschäftslogik zu modularisieren:
* **Hierarchie**: `WorkPackage::Ancestors` (`app/models/work_package/ancestors.rb`) stellt Methoden wie `visible_ancestors` bereit, um die Hierarchie-Baumstruktur unter Berücksichtigung von Berechtigungen abzufragen. Die eigentliche Baumstruktur wird durch das `has_closure_tree` (Closure Table Pattern) abgebildet.
* **Scheduling**: `WorkPackage::SchedulingRules` behandelt die Terminplanung (manuell vs. automatisch) und berechnet das frühestmögliche Startdatum (`soonest_start`) basierend auf den Relationen.
* **Beziehungen**: `WorkPackages::Relations` (`app/models/work_packages/relations.rb`) definiert die `has_many`-Assoziationen für verschiedene Relationstypen (z. B. `follows_relations`, `blocks_relations`).

Jedes Work Package ist zwingend an ein `Project` und einen `Type` gebunden.

## 2. Relations (Beziehungen)

Die Beziehungen zwischen Work Packages werden durch das Modell `Relation` (`app/models/relation.rb`) abgebildet.

OpenProject definiert verschiedene Relationstypen als Konstanten:
* `TYPE_RELATES` (relates)
* `TYPE_PRECEDES` / `TYPE_FOLLOWS` (precedes / follows)
* `TYPE_BLOCKS` / `TYPE_BLOCKED` (blocks / blocked)
* `TYPE_DUPLICATES` / `TYPE_DUPLICATED` (duplicates / duplicated)
* `TYPE_INCLUDES` / `TYPE_PARTOF` (includes / partof)
* `TYPE_REQUIRES` / `TYPE_REQUIRED` (requires / required)

Zusätzlich gibt es die virtuellen Typen `TYPE_PARENT` und `TYPE_CHILD`. Diese werden jedoch separat in der Hierarchie-Tabelle (`WorkPackageHierarchy`) gespeichert und im Code abstrahiert, um die Handhabung zu vereinfachen.

Die Validierung von Relationen ist komplex und im Concern `WorkPackages::Scopes::Relatable` (`app/models/work_packages/scopes/relatable.rb`) implementiert. Hier wird sichergestellt, dass keine Zirkelbezüge entstehen (weder direkte noch transitive) und dass zwischen zwei Work Packages nur eine Relation existiert.

## 3. Project Hierarchy (Projekthierarchie)

Projekte in OpenProject können hierarchisch strukturiert werden.

Das Modell `Project` (`app/models/project.rb`) nutzt das Concern `Projects::Hierarchy` (`app/models/projects/hierarchy.rb`), welches das Nested Set Pattern (`acts_as_nested_set`) implementiert. Die Spalten `lft` und `rgt` werden verwendet, um den Projektbaum effizient in der Datenbank abzubilden.

Projekte haben zudem einen `workspace_type` (Enum), der festlegt, ob es sich um ein `project`, `program` oder `portfolio` handelt. Die Konstante `ALLOWED_PARENT_WORKSPACE_TYPES` definiert, welche Typen untergeordnet werden dürfen (z. B. kann ein `program` unter einem `portfolio` liegen, aber nicht umgekehrt).

## 4. Types per Project (Typen pro Projekt)

Die Konfiguration, welche Work Package Typen in einem bestimmten Projekt verfügbar sind, wird über eine Many-to-Many-Beziehung gelöst.

Das Modell `Type` (`app/models/type.rb`) hat eine `has_and_belongs_to_many :projects`-Assoziation. Die Methode `Type.enabled_in(project)` filtert die Typen entsprechend.

Das Concern `Type::Attributes` (`app/models/type/attributes.rb`) steuert dynamisch, welche Felder (inklusive Custom Fields) für einen Typ in einem bestimmten Projekt sichtbar sind. Die Methode `passes_attribute_constraint?` prüft unter anderem, ob ein Custom Field im Kontext des übergebenen Projekts aktiviert ist (`custom_field_in_project?`).

Dies ermöglicht eine sehr feingranulare Konfiguration: Ein Typ kann in mehreren Projekten aktiviert sein, aber die sichtbaren Custom Fields können sich je nach Projekt unterscheiden, da auch Custom Fields projektbezogen aktiviert werden.
