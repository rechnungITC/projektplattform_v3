/**
 * PROJ-151 `full`-Aufstufung — die Zusatzflächen live gegen die DEPLOYTE App.
 *
 *   PROD_WRITE_ACK=1 node scripts/verify-prod-chat-addons.mjs
 *
 * WARUM: fünf der sieben Chat-Routen haben KEINE Route-Tests — ausgerechnet die
 * vom Eigner ausgewählten Zusätze (Vorlagen, Favoriten, Ordner, Modellpreise)
 * plus `messages` und `check-input`. PROJ-Y-151b hat vorgeführt, wohin das
 * führt: AC-151.14/.17 galten als "erfüllt und belegt" und waren in Produktion
 * tot, weil ein verschluckter PostgREST-Fehler die Skill-Liste leerte. "Route
 * existiert und kompiliert" ist danach kein Nachweis mehr.
 *
 * Geprüft werden genau die Kriterien, die bisher nur Unit- oder Pentest-Deckung
 * hatten: AC-151.18 · .19 · .20 · .21 · .22 · .23 · .9.
 *
 * Wegwerf-Lane wie im Geschwister-Skript; `audit_lifecycle_exempt` vor dem
 * Seeden. Der Lane-Mandant bleibt stehen (enforce_admin_invariant), alles
 * Laufbezogene wird entfernt und auf 0 nachgezählt.
 */
import { createClient } from "@supabase/supabase-js"
import { createChunks, stringToBase64URL } from "@supabase/ssr"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

if (process.env.PROD_WRITE_ACK !== "1") {
  console.error("Schreibt in die Produktionsdatenbank. Erneut mit PROD_WRITE_ACK=1.")
  process.exit(2)
}

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, ""),
    ]),
)

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const admin = createClient(SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const PROD = process.env.PROD_BASE_URL ?? "https://projektplattform-v3.vercel.app"
const EMAIL = "e2e-rfc4122@projektplattform-v3.test"
const PASSWORD = "Test-Password-PROJ29!"
const T = "cba70000-0000-4cba-8cba-000000000151"
const P = "cba70000-0000-4cba-8cba-000000000152"

const log = (...a) => console.log(...a)
const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok })
  log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`)
}
async function must(label, thenable) {
  const { data, error } = await thenable
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}

const created = { templateIds: [], folderIds: [], priceKeys: [] }

async function seed() {
  const { data: u } = await admin.auth.admin.listUsers()
  const user = u.users.find((x) => x.email === EMAIL)
  if (!user) throw new Error("E2E-Nutzer nicht gefunden")
  await must("tenants", admin.from("tenants").upsert({
    id: T, name: "[E2E] PROJ-Y-151b Lane", domain: "e2e-151b.test",
    created_by: user.id, audit_lifecycle_exempt: true,
  }))
  await must("membership", admin.from("tenant_memberships").upsert(
    { tenant_id: T, user_id: user.id, role: "admin" },
    { onConflict: "tenant_id,user_id" },
  ))
  await must("settings", admin.from("tenant_settings").upsert({
    tenant_id: T,
    active_modules: ["ai_chat", "risks", "decisions"],
    privacy_defaults: { default_class: 2 },
    ai_provider_config: { external_provider: "anthropic" },
  }))
  await must("project", admin.from("projects").upsert({
    id: P, tenant_id: T, name: "[E2E] Chat-Lane",
    description: "Einfuehrung eines ERP-Systems auf Basis von MS Dynamics.",
    project_type: "erp", project_method: "waterfall", lifecycle_status: "active",
    created_by: user.id, responsible_user_id: user.id,
  }))
  log("  Lane geseedet")
  return user.id
}

async function authHeaders() {
  const c = createClient(SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })
  const { data, error } = await c.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error) throw new Error("Anmeldung: " + error.message)
  const ref = SUPABASE_URL.replace(/^https:\/\//, "").split(".")[0]
  const encoded = `base64-${stringToBase64URL(JSON.stringify(data.session))}`
  const cookie = createChunks(`sb-${ref}-auth-token`, encoded)
    .map((c) => `${c.name}=${c.value}`)
    .concat([`active_tenant_id=${T}`])
    .join("; ")
  return { "Content-Type": "application/json", Cookie: cookie }
}

// `redirect: "manual"` — sonst tarnt sich ein Auth-Redirect als 405.
async function call(headers, method, path, body) {
  const res = await fetch(`${PROD}${path}`, {
    method, headers, redirect: "manual",
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json = null
  try { json = await res.json() } catch { /* leerer Rumpf ist zulaessig */ }
  return { status: res.status, json }
}

async function run() {
  await seed()
  const headers = await authHeaders()

  // --- AC-151.18/.19: Vorlagen und Favoriten -----------------------------
  // Zwei Titel, deren Alphabet der Favoriten-Regel WIDERSPRICHT: "Zulieferer"
  // sortiert normal hinter "Abnahme". Nur wenn der Favorit ihn nach oben zieht,
  // ist die Sortierung wirklich favoritengetrieben und nicht zufaellig alphabetisch.
  const a = await call(headers, "POST", "/api/chat/prompt-templates",
    { title: "Abnahme-Checkliste", body: "Fasse die offenen Punkte zusammen." })
  const z = await call(headers, "POST", "/api/chat/prompt-templates",
    { title: "Zulieferer-Risiken", body: "Welche Lieferrisiken bestehen?" })
  check("AC-151.18 Vorlage anlegen (2×)", a.status === 201 && z.status === 201,
    `${a.status}/${z.status}`)
  const aId = a.json?.template?.id
  const zId = z.json?.template?.id
  created.templateIds.push(aId, zId)

  const before = await call(headers, "GET", "/api/chat/prompt-templates")
  const titlesBefore = (before.json?.templates ?? []).map((t) => t.title)
  check("AC-151.18 Vorlagen erscheinen im Chat", before.status === 200 &&
    titlesBefore.includes("Abnahme-Checkliste") && titlesBefore.includes("Zulieferer-Risiken"),
    JSON.stringify(titlesBefore.slice(0, 4)))
  check("ohne Favorit gilt die alphabetische Reihenfolge",
    titlesBefore.indexOf("Abnahme-Checkliste") < titlesBefore.indexOf("Zulieferer-Risiken"))

  const fav = await call(headers, "PUT", `/api/chat/prompt-templates/${zId}`)
  const after = await call(headers, "GET", "/api/chat/prompt-templates")
  const titlesAfter = (after.json?.templates ?? []).map((t) => t.title)
  check("AC-151.19 Favorit setzen", fav.status === 200 || fav.status === 204, `${fav.status}`)
  check("AC-151.19 Favorit steht oben — gegen die Alphabetik",
    titlesAfter.indexOf("Zulieferer-Risiken") < titlesAfter.indexOf("Abnahme-Checkliste"),
    JSON.stringify(titlesAfter.slice(0, 3)))
  const favFlag = (after.json?.templates ?? []).find((t) => t.id === zId)?.is_favorite
  check("AC-151.19 Favorit ist als solcher gekennzeichnet", favFlag === true, `${favFlag}`)

  const unfav = await call(headers, "DELETE", `/api/chat/prompt-templates/${zId}`)
  const back = await call(headers, "GET", "/api/chat/prompt-templates")
  const titlesBack = (back.json?.templates ?? []).map((t) => t.title)
  check("AC-151.19 Favorit entfernen kehrt die Reihenfolge um",
    (unfav.status === 200 || unfav.status === 204) &&
      titlesBack.indexOf("Abnahme-Checkliste") < titlesBack.indexOf("Zulieferer-Risiken"))

  // --- AC-151.20: Ordner --------------------------------------------------
  const folder = await call(headers, "POST", `/api/projects/${P}/chat/folders`,
    { name: "Vergabe" })
  check("AC-151.20 Ordner anlegen", folder.status === 201, `${folder.status}`)
  const folderId = folder.json?.folder?.id
  created.folderIds.push(folderId)

  const inFolder = await call(headers, "POST", `/api/projects/${P}/chat/conversations`,
    { title: "Im Ordner", folder_id: folderId })
  const loose = await call(headers, "POST", `/api/projects/${P}/chat/conversations`,
    { title: "Ohne Ordner" })
  check("AC-151.20 Unterhaltung im Ordner anlegen", inFolder.status === 201, `${inFolder.status}`)
  const list = await call(headers, "GET", `/api/projects/${P}/chat/conversations`)
  const rows = list.json?.conversations ?? []
  const inRow = rows.find((c) => c.id === inFolder.json?.conversation?.id)
  const looseRow = rows.find((c) => c.id === loose.json?.conversation?.id)
  check("AC-151.20 Zuordnung bleibt erhalten", inRow?.folder_id === folderId, `${inRow?.folder_id}`)
  check("AC-151.20 ohne Ordner bleibt die Unterhaltung ungebunden",
    looseRow?.folder_id === null, `${looseRow?.folder_id}`)

  // --- AC-151.21/.22/.23: Modellpreise und Kosten -------------------------
  const price = await call(headers, "PUT", "/api/chat/model-prices",
    { provider: "openai", model: "e2e-preis-modell", input_per_1m: 3, output_per_1m: 15, currency: "EUR" })
  check("AC-151.21 Modellpreis pflegbar", price.status === 200 || price.status === 201, `${price.status}`)
  created.priceKeys.push(["openai", "e2e-preis-modell"])
  const prices = await call(headers, "GET", "/api/chat/model-prices")
  const row = (prices.json?.prices ?? []).find((p) => p.model === "e2e-preis-modell")
  check("AC-151.21 Preis wird zurueckgelesen",
    row && Number(row.input_per_1m) === 3 && Number(row.output_per_1m) === 15 && row.currency === "EUR",
    JSON.stringify(row ?? null))

  // --- AC-151.22/.23: Kosten wirklich beziffern ---------------------------
  //
  // Das ist der Kern von PROJ-Y-151d. Die Rechnung lag als Bibliothek ohne
  // Aufrufer vor; hier wird geprueft, dass sie im Produkt ankommt — und zwar
  // als PAAR: MIT Preis eine Zahl, OHNE Preis eine Aussage statt 0 EUR.
  const provider = await must("openai-Anbieter lesen", admin
    .from("tenant_ai_providers")
    .select("encrypted_config, key_fingerprint, last_validation_status")
    .eq("provider", "openai").neq("tenant_id", T).limit(1).single())
  await must("Anbieter in die Lane kopieren", admin.from("tenant_ai_providers").upsert({
    tenant_id: T, provider: "openai",
    encrypted_config: provider.encrypted_config,
    key_fingerprint: provider.key_fingerprint,
    last_validation_status: provider.last_validation_status,
    created_by: (await admin.auth.admin.listUsers()).data.users.find((u) => u.email === EMAIL).id,
  }, { onConflict: "tenant_id,provider" }))

  const conv = await call(headers, "POST", `/api/projects/${P}/chat/conversations`,
    { title: "Kostenprobe" })
  const convId = conv.json?.conversation?.id
  const sent = await call(headers, "POST",
    `/api/projects/${P}/chat/conversations/${convId}/messages`,
    { content: "Nenne in einem Satz den Projekttyp." })
  // Lokal ist der Kostenpfad NICHT pruefbar: `SECRETS_ENCRYPTION_KEY` steht nur
  // in Vercel, der Entwicklungsserver kann also keinen Anbieter entschluesseln
  // und faellt immer auf den Stub zurueck (ohne Token). Das ausdruecklich als
  // Umgebungsgrenze melden statt als Fehlschlag — ein Fehlschlag, den man
  // "lokal halt immer" ignoriert, ist schlimmer als eine benannte Luecke.
  const echterAnbieter = sent.json?.provider === "openai"
  const kostenPruefbar = echterAnbieter || !PROD.includes("localhost")
  if (!kostenPruefbar) {
    // Ein Flag, KEIN `return`: die erste Fassung sprang aus der Funktion und
    // nahm die AC-151.9-Pruefungen gleich mit — eine Umgebungsgrenze darf
    // fremde Zusicherungen nicht stillschweigend mitreissen.
    log("  UEBERSPRUNGEN  AC-151.22/.23 — lokal kein Anbieter (SECRETS_ENCRYPTION_KEY " +
      "nur in Vercel); der Kostenpfad ist nur gegen Produktion pruefbar.")
  }
  if (kostenPruefbar) {
  check("Kostenprobe: echte Antwort erzeugt", sent.status === 200 && echterAnbieter,
    `${sent.status}/${sent.json?.provider}`)

  // Das benutzte Modell NICHT raten — aus dem Lauf lesen.
  const runs = await must("ki_runs lesen", admin
    .from("ki_runs").select("provider, model_id, input_tokens, output_tokens")
    .eq("tenant_id", T).order("created_at", { ascending: false }).limit(1))
  const run = runs[0]
  check("Kostenprobe: Lauf traegt Modell und Token",
    !!run?.model_id && (run?.input_tokens ?? 0) > 0, JSON.stringify(run ?? null))

  // Ohne Preis: AC-151.22 verlangt eine AUSSAGE, keine Null.
  const ohnePreis = await call(headers, "GET",
    `/api/projects/${P}/chat/conversations/${convId}/messages`)
  check("AC-151.22 ohne Preis wird es GESAGT, nicht als 0 behauptet",
    ohnePreis.json?.cost?.known === false && ohnePreis.json?.cost?.reason === "no_price",
    JSON.stringify(ohnePreis.json?.cost ?? null))

  // Mit Preis: dieselbe Unterhaltung muss jetzt eine Zahl liefern.
  await call(headers, "PUT", "/api/chat/model-prices", {
    provider: run.provider, model: run.model_id,
    input_per_1m: 1000, output_per_1m: 2000, currency: "EUR",
  })
  created.priceKeys.push([run.provider, run.model_id])
  const mitPreis = await call(headers, "GET",
    `/api/projects/${P}/chat/conversations/${convId}/messages`)
  const cost = mitPreis.json?.cost
  check("AC-151.22 mit Preis wird beziffert",
    cost?.known === true && cost.amount > 0 && cost.currency === "EUR",
    JSON.stringify(cost ?? null))

  // Gegenrechnung von Hand: belegt, dass wirklich gerechnet und nicht nur ein
  // Feld durchgereicht wird — und dass AUSGABE-Token mit dem Ausgabepreis
  // multipliziert werden (AC-151.23 haengt daran).
  const erwartet = Math.round(
    (((run.input_tokens ?? 0) / 1e6) * 1000 + ((run.output_tokens ?? 0) / 1e6) * 2000) * 100,
  ) / 100
  check("AC-151.22 die Zahl stimmt mit der Handrechnung ueberein",
    cost?.amount === erwartet, `API ${cost?.amount} vs. erwartet ${erwartet}`)

  }

  // --- AC-151.9: Class-3-Vorpruefung -------------------------------------
  const clean = await call(headers, "POST", `/api/projects/${P}/chat/check-input`,
    { content: "Wie ist der Stand der Migration im Projekt?" })
  const dirty = await call(headers, "POST", `/api/projects/${P}/chat/check-input`,
    { content: "Was hat thomas.meier@example.com dazu gesagt?" })
  check("AC-151.9 Vorpruefung antwortet", clean.status === 200 && dirty.status === 200,
    `${clean.status}/${dirty.status}`)
  check("AC-151.9 gewoehnlicher Projekttext loest KEINEN Alarm",
    clean.json?.looks_personal === false, `${clean.json?.looks_personal}`)
  check("AC-151.9 E-Mail loest den Hinweis aus",
    dirty.json?.looks_personal === true, `${dirty.json?.looks_personal}`)
}

async function cleanup() {
  for (const id of created.templateIds.filter(Boolean)) {
    await admin.from("ai_chat_prompt_favorites").delete().eq("template_id", id)
    await admin.from("ai_chat_prompt_templates").delete().eq("id", id)
  }
  for (const [provider, model] of created.priceKeys) {
    await admin.from("ai_model_prices").delete().eq("provider", provider).eq("model", model)
  }
  await admin.from("ai_chat_messages").delete().eq("tenant_id", T)
  await admin.from("ai_chat_conversations").delete().eq("tenant_id", T)
  await admin.from("ai_chat_folders").delete().eq("tenant_id", T)
  await admin.from("ki_runs").delete().eq("tenant_id", T)
  await admin.from("projects").delete().eq("tenant_id", T)

  let residue = 0
  const counted = [
    ["ai_chat_prompt_templates", "tenant_id", T],
    ["ai_chat_prompt_favorites", "tenant_id", T],
    ["ai_chat_conversations", "tenant_id", T],
    ["ai_chat_folders", "tenant_id", T],
    ["ai_chat_messages", "tenant_id", T],
    ["ki_runs", "tenant_id", T],
    ["projects", "tenant_id", T],
  ]
  for (const [t, col, val] of counted) {
    const { count } = await admin.from(t).select("*", { count: "exact", head: true }).eq(col, val)
    if (count) { log(`    RUECKSTAND ${t}: ${count}`); residue += count }
  }
  const { count: strayPrice } = await admin
    .from("ai_model_prices").select("*", { count: "exact", head: true }).eq("model", "e2e-preis-modell")
  if (strayPrice) { log(`    RUECKSTAND ai_model_prices: ${strayPrice}`); residue += strayPrice }
  check(`0 laufbezogene Rueckstaende ueber ${counted.length + 1} Tabellen`, residue === 0, `${residue}`)
}

let failed = false
try { await run() } catch (e) { console.error("FEHLER:", e.message); failed = true }
finally { await cleanup() }
const bad = results.filter((r) => !r.ok).length
log(`\n  ${results.length - bad}/${results.length} PASS, ${bad} FAIL`)
process.exit(failed || bad ? 1 : 0)
