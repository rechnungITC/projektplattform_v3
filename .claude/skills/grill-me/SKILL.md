---
name: grill-me
description: Löchert dich gnadenlos mit Fragen zu einem Plan, einer Entscheidung oder Idee, bis ein gemeinsames Verständnis steht. Nutzen, wenn der User seinen Plan stresstesten will oder "grill mich" sagt
argument-hint: "Vorhaben, Plan oder Entscheidung"
user-invocable: true
---

Interviewe mich gnadenlos zu jedem Aspekt dieses Vorhabens, bis wir ein gemeinsames Verständnis erreicht haben. Gehe jeden Zweig des Entscheidungsbaums durch und löse die Abhängigkeiten zwischen den Entscheidungen nacheinander auf. Gib mir zu jeder Frage deine empfohlene Antwort dazu.

Stelle die Fragen einzeln und warte auf meine Antwort, bevor du weitermachst. Mehrere Fragen auf einmal sind verwirrend.

Wenn sich ein Fakt durch Erkunden der Umgebung (Dateien, Tools usw.) herausfinden lässt, schlag nach, statt mich zu fragen. Die Entscheidungen aber gehören mir: Leg mir jede einzeln vor und warte auf meine Antwort.

Fang nicht mit der Umsetzung an, bevor ich bestätigt habe, dass wir ein gemeinsames Verständnis erreicht haben.

## Wo dieser Skill greift

Er ist bewusst **stufenagnostisch** — nicht in eine Workflow-Stufe eingebaut, sondern aus jeder aufrufbar. Drei Stellen, an denen dieses Repo ihn braucht:

- **`/requirements`** — die Nutzer-Locks, bevor eine Spec geschrieben wird. Eine Spec, deren Entscheidungen der Agent selbst getroffen hat, ist keine Anforderung, sondern eine Vermutung.
- **`/architecture`** — jeder Fork, den die Spec offen gelassen hat (`.claude/rules/continuous-improvement.md`, Workflow-Integration).
- **der Halt-und-Frage-Checkpoint** — wenn in der Sitzung keine Sub-Agenten verfügbar sind, verlangt `.claude/rules/continuous-improvement.md` ausdrücklich, die Entscheidung mit strukturierter Ausgabe dem Nutzer vorzulegen statt sie einseitig zu treffen. Genau diese Mechanik ist hier beschrieben.

Nicht dafür gedacht: Bugfixes, spec-folgende Umsetzungen, mechanische Aufräumarbeit. Dort kostet das Interview Aufmerksamkeit ohne Ertrag.
