import { describe, expect, it } from "vitest"

import {
  parseWorkItemCommand,
  resolveTargetKind,
  splitTitleAndOverflow,
  WORK_ITEM_TITLE_MAX,
} from "./work-item-command"
import { PROJECT_METHODS, type ProjectMethod } from "@/types/project-method"
import {
  ALLOWED_PARENT_KINDS,
  isKindVisibleInMethod,
  WORK_ITEM_KINDS,
  type WorkItemKind,
} from "@/types/work-item"

// PROJ-144 — reine Befehls- und Abbildungslogik.
//
// Der `resolveTargetKind`-Block ist kein Beiwerk: die Regel „Art passt zur
// Methode" hat KEINE Entsprechung in der Datenbank (kein Constraint), die
// Anwendungsschicht ist der einzige Wächter (Tech Design D4). Fällt dieser
// Test weg, fällt eine Fehlzuordnung erst dem Nutzer auf.

describe("parseWorkItemCommand — Erkennung (AC-144.2)", () => {
  it("liest 'Neue Story: <Titel>'", () => {
    const cmd = parseWorkItemCommand("Neue Story: Rechnungsimport testen")
    expect(cmd).not.toBeNull()
    expect(cmd?.requestedKind).toBe("story")
    expect(cmd?.title).toBe("Rechnungsimport testen")
    expect(cmd?.projectQuery).toBeNull()
  })

  it("liest 'Erstelle eine Story <Titel>' ohne Doppelpunkt", () => {
    const cmd = parseWorkItemCommand("Erstelle eine Story Rechnungsimport testen")
    expect(cmd?.requestedKind).toBe("story")
    expect(cmd?.title).toBe("Rechnungsimport testen")
  })

  it("liest 'Neue Aufgabe <Titel> im Projekt <X>' und trennt das Projekt ab", () => {
    const cmd = parseWorkItemCommand(
      "Neue Aufgabe Rechnungsimport testen im Projekt ERP-Rollout",
    )
    expect(cmd?.requestedKind).toBe("task")
    expect(cmd?.title).toBe("Rechnungsimport testen")
    expect(cmd?.projectQuery).toBe("ERP-Rollout")
  })

  it("liest 'Neues Arbeitspaket: <Titel>'", () => {
    const cmd = parseWorkItemCommand("Neues Arbeitspaket: Schnittstelle abnehmen")
    expect(cmd?.requestedKind).toBe("work_package")
    expect(cmd?.title).toBe("Schnittstelle abnehmen")
  })

  it("behandelt die deutsche Verbklammer 'lege … an'", () => {
    const cmd = parseWorkItemCommand("Lege eine Aufgabe Schnittstelle prüfen an")
    expect(cmd?.requestedKind).toBe("task")
    expect(cmd?.title).toBe("Schnittstelle prüfen")
  })

  it("unterscheidet Unteraufgabe von Aufgabe (Reihenfolge der Wortstämme)", () => {
    expect(parseWorkItemCommand("Neue Unteraufgabe Testdaten anlegen")?.requestedKind).toBe(
      "subtask",
    )
    expect(parseWorkItemCommand("Neue Aufgabe Testdaten anlegen")?.requestedKind).toBe(
      "task",
    )
  })

  it("erkennt Fehler/Bug als bug", () => {
    expect(parseWorkItemCommand("Neuer Fehler Login schlägt fehl")?.requestedKind).toBe(
      "bug",
    )
  })
})

describe("parseWorkItemCommand — Nicht-Ansprüche", () => {
  it("gibt null bei fehlendem Inhalt zurück, damit rückgefragt wird (AC-144.3)", () => {
    const cmd = parseWorkItemCommand("Neue Story")
    expect(cmd).not.toBeNull()
    expect(cmd?.requestedKind).toBe("story")
    expect(cmd?.title).toBeNull()
  })

  it("beansprucht freies Gerede nicht (AC-144.4)", () => {
    expect(
      parseWorkItemCommand(
        "Also wir müssten mal irgendwie den Rechnungsimport angucken, machst du da was draus?",
      ),
    ).toBeNull()
  })

  it("beansprucht Statusfragen nicht (AC-144.1)", () => {
    expect(parseWorkItemCommand("Wie ist der aktuelle Stand zu Projekt X?")).toBeNull()
    expect(parseWorkItemCommand("Was sind die größten Risiken?")).toBeNull()
    expect(parseWorkItemCommand("Zeige mir das Backlog")).toBeNull()
  })

  it("überlässt die Projektanlage dem bestehenden Intent (AC-144.31)", () => {
    expect(parseWorkItemCommand("Erstelle ein Projekt namens Migration")).toBeNull()
    expect(parseWorkItemCommand("Neues Projekt für die Story-Verwaltung")).toBeNull()
  })

  it("beansprucht aber 'Erstelle eine Story im Projekt X' — dort ist die Story das Objekt", () => {
    const cmd = parseWorkItemCommand("Erstelle eine Story Preisliste prüfen im Projekt ERP")
    expect(cmd?.requestedKind).toBe("story")
    expect(cmd?.title).toBe("Preisliste prüfen")
    expect(cmd?.projectQuery).toBe("ERP")
  })

  it("gibt null ohne Anlage-Auslöser zurück", () => {
    expect(parseWorkItemCommand("Die Story ist fertig")).toBeNull()
  })
})

describe("splitTitleAndOverflow — langes Diktat (AC-144.5)", () => {
  it("lässt kurze Titel unberührt", () => {
    expect(splitTitleAndOverflow("kurz")).toEqual({ title: "kurz", overflow: null })
  })

  it("schneidet an der Wortgrenze und hebt den Rest in die Beschreibung", () => {
    const long = "Wort ".repeat(80).trim() // 400 Zeichen
    const { title, overflow } = splitTitleAndOverflow(long)
    expect(title.length).toBeLessThanOrEqual(WORK_ITEM_TITLE_MAX)
    expect(title.endsWith("Wort")).toBe(true)
    expect(overflow).not.toBeNull()
    // Nichts geht verloren.
    expect(`${title} ${overflow}`.replace(/\s+/g, " ")).toBe(long)
  })

  it("verwirft nichts, wenn der Titel aus einem einzigen Wortungeheuer besteht", () => {
    const monster = "a".repeat(300)
    const { title, overflow } = splitTitleAndOverflow(monster)
    expect(title.length).toBe(WORK_ITEM_TITLE_MAX)
    expect(`${title}${overflow}`).toBe(monster)
  })
})

describe("resolveTargetKind — Methoden-Abbildung (AC-144.6 – AC-144.9)", () => {
  it("liefert in Scrum-artigen Methoden eine echte story (AC-144.7)", () => {
    for (const method of ["scrum", "kanban", "safe", "vxt2"] as ProjectMethod[]) {
      const res = resolveTargetKind("story", method)
      expect(res, method).toEqual({ status: "resolved", kind: "story", mapped: false })
    }
  })

  it("bildet story in Wasserfall/PMI/PRINCE2 auf work_package ab (AC-144.8)", () => {
    for (const method of ["waterfall", "pmi", "prince2"] as ProjectMethod[]) {
      const res = resolveTargetKind("story", method)
      expect(res, method).toEqual({
        status: "resolved",
        kind: "work_package",
        mapped: true,
      })
    }
  })

  it("nimmt die gesagte Art unverändert, wenn keine Methode gesetzt ist (AC-144.9)", () => {
    for (const kind of ["story", "epic", "feature", "work_package"] as WorkItemKind[]) {
      expect(resolveTargetKind(kind, null)).toEqual({
        status: "resolved",
        kind,
        mapped: false,
      })
    }
  })

  it("verweigert die Unteraufgabe statt sie stillschweigend umzudeuten (AC-144.10)", () => {
    for (const method of [...PROJECT_METHODS, null]) {
      expect(resolveTargetKind("subtask", method)).toEqual({
        status: "not_creatable",
        reason: "requires_parent",
      })
    }
  })

  // Der eigentliche Wächter: über ALLE Methoden und ALLE Arten darf nie eine
  // Kombination herauskommen, die die Work-Item-Route ablehnen würde.
  it("liefert über alle Methoden × alle Arten nur gültige Kombinationen", () => {
    // Beide Achsen kommen aus den Konstanten, nicht aus einer Liste hier: eine
    // neue Methode oder eine neue Art ist damit automatisch mitgeprüft. Eine
    // handgepflegte Kopie hätte genau die Drift erlaubt, gegen die dieser Test
    // antritt — die Zuordnung Methode↔Art hat in der Datenbank keinen
    // Constraint, der sie auffängt.
    const kinds: readonly WorkItemKind[] = WORK_ITEM_KINDS
    expect(kinds.length).toBeGreaterThan(0)
    expect(PROJECT_METHODS.length).toBeGreaterThan(0)

    for (const method of PROJECT_METHODS) {
      for (const kind of kinds) {
        const res = resolveTargetKind(kind, method)
        if (res.status === "not_creatable") {
          // Nur die Unteraufgabe darf hier landen — sie kann nie oberste Ebene sein.
          expect(ALLOWED_PARENT_KINDS[kind].includes(null), `${kind}/${method}`).toBe(
            false,
          )
          continue
        }
        expect(
          isKindVisibleInMethod(res.kind, method),
          `${kind} → ${res.kind} in ${method} muss sichtbar sein`,
        ).toBe(true)
        expect(
          ALLOWED_PARENT_KINDS[res.kind].includes(null),
          `${kind} → ${res.kind} muss oberste Ebene erlauben`,
        ).toBe(true)
      }
    }
  })
})
