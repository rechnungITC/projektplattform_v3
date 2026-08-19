/**
 * PROJ-Y-148e — Runner für den Funktionsinventar-Abgleich.
 *
 * `npm run check:function-inventory`
 *
 * Liest das versionierte Prod-Inventar und alle Migrationsdateien, meldet
 * unerklärte Funktionen und veraltete Ausnahmen. Reine Dateianalyse: kein
 * Datenbankzugang, kein Docker, keine Secrets — dadurch überall lauffähig,
 * auch in CI.
 */

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import {
  analyzeInventory,
  extractCreatedFunctions,
  hasFailures,
  parseInventory,
  INVENTORY_EXCEPTIONS,
} from "./analyze"

const INVENTORY = "supabase/prod-inventory/functions.txt"
const MIGRATIONS = "supabase/migrations"

function main(): number {
  let inventoryText: string
  try {
    inventoryText = readFileSync(INVENTORY, "utf8")
  } catch {
    console.error(
      `::error::function-inventory: ${INVENTORY} fehlt. Anlegen bzw. auffrischen — siehe docs/production/function-inventory.md`
    )
    return 1
  }

  const prod = parseInventory(inventoryText)
  if (prod.length === 0) {
    console.error(
      `::error::function-inventory: ${INVENTORY} enthält keine Einträge. Eine leere Datei würde jeden Fund verschweigen.`
    )
    return 1
  }

  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
  const repo = new Set<string>()
  for (const f of files) {
    for (const name of extractCreatedFunctions(
      readFileSync(join(MIGRATIONS, f), "utf8")
    )) {
      repo.add(name)
    }
  }

  const result = analyzeInventory(prod, [...repo], INVENTORY_EXCEPTIONS)

  console.log(
    `function-inventory: ${result.prodCount} Funktion(en) im Prod-Inventar, ` +
      `${result.repoCount} von ${files.length} Migrationsdatei(en) angelegt, ` +
      `${result.exceptionCount} dokumentierte Ausnahme(n).`
  )

  for (const name of result.unexplained) {
    console.error(
      `::error file=${INVENTORY}::\`${name}\` existiert in Prod, wird von keiner Migrationsdatei angelegt ` +
        `und steht nicht in der Ausnahmeliste. Entweder fehlt die Migration im Repo (der PROJ-Y-148c-Fall) ` +
        `oder die Slice, die sie anlegt, ist noch nicht gemergt — dann ist dieser Fund erwartbar und ` +
        `verschwindet mit dem Merge.`
    )
  }
  for (const name of result.staleExceptions) {
    console.error(
      `::error file=scripts/check-function-inventory/analyze.ts::Ausnahme \`${name}\` ist veraltet — die Funktion ` +
        `existiert nicht mehr im Prod-Inventar. Eintrag entfernen, sonst deckt er künftig einen echten Fund gleichen Namens.`
    )
  }
  if (result.repoOnly.length > 0) {
    // Kein Fehler: eine gemergte, aber noch nicht angewendete Migration landet hier,
    // ebenso eine bewusst gedroppte Funktion.
    console.log(
      `function-inventory: ${result.repoOnly.length} im Repo angelegt, aber nicht im Prod-Inventar ` +
        `(gedroppt, noch nicht angewendet, oder ein \`create function\` in einem Kommentar): ` +
        result.repoOnly.join(", ")
    )
  }

  if (hasFailures(result)) {
    console.error(
      `::error::function-inventory: ${result.unexplained.length} unerklärt, ${result.staleExceptions.length} veraltete Ausnahme(n).`
    )
    return 1
  }
  console.log("function-inventory: OK.")
  return 0
}

process.exit(main())
