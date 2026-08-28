/**
 * PROJ-Y-151b — echter Anbieter-Durchlauf des Projekt-Chats gegen die
 * DEPLOYTE Anwendung.
 *
 *   PROD_WRITE_ACK=1 node scripts/verify-prod-chat-roundtrip.mjs
 *
 * Bewusst NICHT in CI: der Lauf legt Zeilen in der Produktionsdatenbank an,
 * ruft einen echten Anbieter mit echtem Schluessel und kostet Geld. Muster
 * uebernommen von scripts/verify-prod-snapshot-render.mts (PROJ-Y-146a).
 *
 * WARUM ueberhaupt — PROJ-151 hat den Anbieter-Aufruf ausschliesslich gegen
 * gemockte Anbieter belegt. Genau die Luecke, an der PROJ-142 gezeigt hat,
 * dass eine gemockte Abdeckung einen ganzen Major-Sprung still ueberlebt.
 *
 * EIGENE LANE, nicht der Kundenmandant (CLAUDE.md prod-test-fixtures):
 * `audit_lifecycle_exempt` wird VOR dem Seeden gesetzt, weil Audit-Zeilen seit
 * PROJ-130-alpha append-only sind und ihren Mandanten ueberleben.
 *
 * Der Lane-MANDANT bleibt bewusst stehen, wie die vier bestehenden
 * `[E2E]`-Mandanten (PROJ-Y-144d, PROJ-Y-143l). Grund ist gemessen, nicht
 * bequem: `enforce_admin_invariant` verbietet das Loeschen der letzten
 * Admin-Mitgliedschaft und trifft ueber den CASCADE den Mandanten selbst — es
 * gibt keinen DML-Pfad, und ein Trigger-Ausstieg waere genau die Aushebelung,
 * die PROJ-Y-148c gerade zurueckgebaut hat. Alles LAUFBEZOGENE wird entfernt
 * und auf 0 nachgezaehlt, ausdruecklich auch die Kopie des Anbieter-Schluessels.
 *
 * DREI KONTROLLVEKTOREN, damit ein Bestehen etwas heisst. Eine bloss plausible
 * Antwort ist kein Nachweis — der Stub-Anbieter liefert leeren Text, und ein
 * Modell kann ueber ERP-Projekte auch ohne jeden Kontext plaudern:
 *   K1  Projektkontext  — eine Kennung, die kein Weltwissen sein kann, steht
 *                         in der Projektbeschreibung und muss in der Antwort
 *                         auftauchen.
 *   K2  Skill-Kontext   — ein aktiver Skill schreibt ein Losungswort vor, das
 *                         ebenfalls in der Antwort stehen muss.
 *   K3  Class-3-Sperre  — dieselbe Lane, eine Frage MIT E-Mail-Adresse: der
 *                         Chat darf den Cloud-Anbieter dann NICHT waehlen.
 *                         Ohne diesen Vektor belegt der Lauf nur, dass Cloud
 *                         funktioniert, nicht dass die Sperre haelt.
 */
import { createClient } from "@supabase/supabase-js"
import { createChunks, stringToBase64URL } from "@supabase/ssr"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

if (process.env.PROD_WRITE_ACK !== "1") {
  console.error(
    "Dieser Lauf SCHREIBT in die Produktionsdatenbank und ruft einen echten,\n" +
      "kostenpflichtigen KI-Anbieter. Erneut starten mit PROD_WRITE_ACK=1.",
  )
  process.exit(2)
}

const envPath = resolve(process.cwd(), ".env.local")
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, ""),
    ]),
)

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const PROD = process.env.PROD_BASE_URL ?? "https://projektplattform-v3.vercel.app"
const EMAIL = "e2e-rfc4122@projektplattform-v3.test"
const PASSWORD = "Test-Password-PROJ29!"

// RFC-4122-konform (PROJ-143): eine nicht konforme Kennung wird von Zod
// abgewiesen und der Fehler taucht erst weit spaeter als 400 auf.
const T = "cba70000-0000-4cba-8cba-000000000151"
const P = "cba70000-0000-4cba-8cba-000000000152"
const SKILL = "cba70000-0000-4cba-8cba-000000000153"

// Losungsworte. Bewusst sinnfrei: waeren es echte Woerter, koennte das Modell
// sie erraten und der Vektor waere wertlos.
const MARK_PROJECT = "ZORQ-4471"
const MARK_SKILL = "NORDLICHT"

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})
const log = (...a) => console.log(...a)

/**
 * supabase-js WIRFT bei Datenbankfehlern nicht, es gibt `{error}` zurueck.
 * Der erste Entwurf ignorierte das — und genau deshalb blieb ein Seed-Fehler
 * unsichtbar, waehrend eine Folgezusicherung LEER bestand (`[].every()` ist
 * wahr). Ab hier scheitert jeder Datenbankfehler laut.
 */
async function must(label, thenable) {
  const { data, error } = await thenable
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}
const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok })
  log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`)
}

let conversationId = null

/**
 * Inhalt des Lane-Skills wechseln.
 *
 * NICHT per `update`: `skill_versions` sind unveraenderlich (PROJ-76/77, der
 * Trigger antwortet "skill versions are immutable"). Das ist das Produkt, das
 * richtig arbeitet — die erste Fassung dieses Vektors war schlicht naiv. Also
 * derselbe Weg wie im Seed: Verweis loesen, Fassung ersetzen, Verweis neu
 * setzen.
 */
async function setSkillContent(userId, text) {
  await must("Verweis loesen", admin
    .from("skills").update({ current_version_id: null }).eq("id", SKILL))
  await must("alte Fassung entfernen", admin
    .from("skill_versions").delete().eq("skill_id", SKILL))
  const v = await must("neue Fassung", admin.from("skill_versions").insert({
    skill_id: SKILL, tenant_id: T, version_number: 1, status: "active",
    markdown_content: text, created_by: userId,
  }).select("id").single())
  await must("Verweis setzen", admin
    .from("skills").update({ current_version_id: v.id }).eq("id", SKILL))
}

async function seed() {
  const { data: u } = await admin.auth.admin.listUsers()
  const user = u.users.find((x) => x.email === EMAIL)
  if (!user) throw new Error(`E2E-Nutzer ${EMAIL} nicht gefunden`)

  await must("tenants", admin.from("tenants").upsert({
    id: T,
    name: "[E2E] PROJ-Y-151b Lane",
    domain: "e2e-151b.test",
    created_by: user.id,
    audit_lifecycle_exempt: true,
  }))
  // `onConflict` ist Pflicht: ohne Angabe zielt upsert auf den PRIMAERschluessel
  // (id), nicht auf die Eindeutigkeit (tenant_id,user_id) — jeder Wiederholungs-
  // lauf scheiterte damit still, solange die Zeile aus dem Vorlauf noch stand.
  await must("tenant_memberships", admin
    .from("tenant_memberships")
    .upsert({ tenant_id: T, user_id: user.id, role: "admin" },
      { onConflict: "tenant_id,user_id" }))
  await must("tenant_settings", admin.from("tenant_settings").upsert({
    tenant_id: T,
    active_modules: ["ai_chat", "risks", "decisions", "ai_proposals"],
    privacy_defaults: { default_class: 2 },
    // OHNE diesen Schalter waehlt der Router den Stub — und zwar OHNE Sperre
    // und ohne reason_code (router.ts:162). Die Vorgabe ist "none"
    // (router.ts:124), eine frisch geseedete Lane laeuft also stumm ins Leere.
    // Der Wert ist ein Zwei-Wert-Relikt ("anthropic" | "none"): er entscheidet
    // nur OB extern gerufen wird, nicht WELCHER Anbieter — die Wahl trifft die
    // Reihenfolge ueber die konfigurierten Anbieter. Der Kundenmandant steht
    // aus genau diesem Grund auf "anthropic" und laeuft trotzdem ueber openai.
    ai_provider_config: { external_provider: "anthropic" },
  }))
  await must("projects", admin.from("projects").upsert({
    id: P,
    tenant_id: T,
    name: "[E2E] Chat-Lane",
    description:
      `Einfuehrung eines ERP-Systems auf Basis von MS Dynamics. ` +
      `Das interne Projektkennzeichen lautet ${MARK_PROJECT}.`,
    project_type: "erp",
    project_method: "waterfall",
    lifecycle_status: "active",
    created_by: user.id,
    responsible_user_id: user.id,
  }))
  await must("project_memberships", admin
    .from("project_memberships")
    .upsert({ project_id: P, user_id: user.id, role: "lead", created_by: user.id },
      { onConflict: "project_id,user_id" }))

  // K2 — Skill nach PROJ-76/77: Skill + aktive Fassung + Projektzuordnung.
  await must("skills", admin.from("skills").upsert({
    id: SKILL,
    tenant_id: T,
    name: "[E2E] Losungswort-Skill",
    slug: "e2e-151b-losungswort",
    category: "cross_cutting",
    is_active: true,
    created_by: user.id,
  }))
  await admin
    .from("skill_versions")
    .delete()
    .eq("skill_id", SKILL)
  const { data: version, error: versionError } = await admin
    .from("skill_versions")
    .insert({
      skill_id: SKILL,
      tenant_id: T,
      version_number: 1,
      status: "active",
      markdown_content:
        `Beginne jede Antwort mit dem Wort ${MARK_SKILL} in Grossbuchstaben, ` +
        `gefolgt von einem Doppelpunkt.`,
      created_by: user.id,
    })
    .select("id")
    .single()
  if (versionError) throw new Error("Skill-Fassung: " + versionError.message)
  await must("skills.current_version_id", admin
    .from("skills")
    .update({ current_version_id: version.id })
    .eq("id", SKILL))
  await must("project_skills", admin.from("project_skills").upsert({
    tenant_id: T,
    project_id: P,
    skill_id: SKILL,
    assignment_source: "manual_admin",
  }, { onConflict: "project_id,skill_id" }))

  // Anbieter-Konfiguration des Eigners in die Lane kopieren. Entschluesselung
  // haengt NICHT am Mandanten (pgp_sym_decrypt mit Umgebungsschluessel,
  // an der Live-Definition geprueft), die Kopie ist also gueltig.
  const src = await must("tenant_ai_providers lesen", admin
    .from("tenant_ai_providers")
    .select("provider, encrypted_config, key_fingerprint, last_validation_status")
    .eq("provider", "openai")
    .limit(1)
    .single())
  if (!src) throw new Error("kein openai-Anbieter zum Kopieren vorhanden")
  await must("tenant_ai_providers schreiben", admin.from("tenant_ai_providers").upsert(
    {
      tenant_id: T,
      provider: "openai",
      encrypted_config: src.encrypted_config,
      key_fingerprint: src.key_fingerprint,
      last_validation_status: src.last_validation_status,
      created_by: user.id,
    },
    { onConflict: "tenant_id,provider" },
  ))
  log("  Lane geseedet: Mandant, Projekt, Skill, Modul ai_chat, openai-Anbieter")
  return user.id
}

async function authHeaders() {
  const c = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await c.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  })
  if (error) throw new Error("Anmeldung fehlgeschlagen: " + error.message)

  // Der SSR-Client liest KEIN rohes Zugriffstoken. Er erwartet die ganze
  // Sitzung als `base64-<base64url(JSON)>`, ueber mehrere Cookies gestueckelt —
  // derselbe Encoder wie in tests/fixtures/global-setup.ts.
  const ref = SUPABASE_URL.replace(/^https:\/\//, "").split(".")[0]
  const encoded = `base64-${stringToBase64URL(JSON.stringify(data.session))}`
  const cookie = createChunks(`sb-${ref}-auth-token`, encoded)
    .map((c) => `${c.name}=${c.value}`)
    .concat([`active_tenant_id=${T}`])
    .join("; ")
  return { headers: { "Content-Type": "application/json", Cookie: cookie }, userClient: c }
}

async function ask(headers, content) {
  // `redirect: "manual"` ist tragend: ein 307 auf /anmelden behaelt bei
  // automatischem Folgen die Methode bei, die Seiten-Route antwortet mit 405 —
  // ein Auth-Fehler tarnt sich dann als Methodenfehler.
  const res = await fetch(
    `${PROD}/api/projects/${P}/chat/conversations/${conversationId}/messages`,
    { method: "POST", headers, redirect: "manual", body: JSON.stringify({ content }) },
  )
  if (res.status !== 200) {
    throw new Error(`messages -> ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  return res.json()
}

async function run() {
  const userId = await seed()
  const { headers, userClient } = await authHeaders()

  // Gegenprobe VOR dem ersten Aufruf: sieht der ANRUFER den Skill? Das trennt
  // drei Ursachen, die sonst alle als leeres `skills_applied` erscheinen —
  // Seed falsch, RLS verbirgt, oder die Route fragt gar nicht.
  const { data: seenLinks } = await userClient
    .from("project_skills")
    .select("skill_id, skills(name, is_active, current_version_id)")
    .eq("project_id", P)
    .eq("tenant_id", T)
  const { data: seenVersions } = await userClient
    .from("skill_versions")
    .select("skill_id, status, markdown_content")
    .eq("skill_id", SKILL)
  log(`  Sicht des Anrufers: project_skills=${JSON.stringify(seenLinks)}`)
  log(`  Sicht des Anrufers: skill_versions=${(seenVersions ?? []).length} ` +
    `(${(seenVersions ?? []).map((v) => v.status).join(",")})`)
  // Die ALTE, fehlerhafte Form der Ladefunktion nachgestellt. Sie MUSS
  // scheitern — dass sie es tut, ist der Beleg fuer die Ursache und haelt sie
  // fest: wer die Einbettung je wieder einbaut, laeuft erneut in eine still
  // leere Skill-Liste.
  const oldForm = await userClient
    .from("skill_versions")
    .select("skill_id, markdown_content, status, skills(name)")
    .in("skill_id", [SKILL])
    .eq("status", "active")
  check("alte Form der Skill-Abfrage ist weiterhin mehrdeutig (Ursache belegt)",
    (oldForm.error?.message ?? "").includes("more than one relationship"),
    oldForm.error?.message ?? "kein Fehler")

  const created = await fetch(`${PROD}/api/projects/${P}/chat/conversations`, {
    method: "POST",
    headers,
    redirect: "manual",
    body: JSON.stringify({ title: "PROJ-Y-151b Live-Nachweis" }),
  })
  check("Unterhaltung ueber die deployte Route angelegt", created.status === 201,
    `HTTP ${created.status}`)
  if (created.status !== 201) return
  conversationId = (await created.json()).conversation.id

  // --- Durchlauf 1: Class-2, Cloud-Anbieter erwartet -----------------------
  const a = await ask(
    headers,
    "Nenne in einem Satz das interne Projektkennzeichen dieses Projekts.",
  )
  const answer = a.answer_text ?? a.message?.content ?? ""
  log(`  Antwort: ${JSON.stringify(answer.slice(0, 160))}`)

  check("echter Anbieter statt Stub", a.provider === "openai", `provider=${a.provider}`)
  check("Lauf erfolgreich", a.status === "success", `status=${a.status}`)
  check("Antwort ist nicht leer", answer.trim().length > 0)
  check("Anbieter meldet verbrauchte Token",
    (a.message?.token_input ?? 0) > 0 && (a.message?.token_output ?? 0) > 0,
    `in=${a.message?.token_input} out=${a.message?.token_output}`)
  check(`K1 Projektkontext erreicht das Modell (${MARK_PROJECT})`,
    answer.includes(MARK_PROJECT))
  check(`K2 Skill-Anweisung wirkt (${MARK_SKILL})`, answer.includes(MARK_SKILL))
  check("K2 Skill wird als angewandt gemeldet",
    Array.isArray(a.skills_applied) && a.skills_applied.length > 0,
    JSON.stringify(a.skills_applied))

  // --- Durchlauf 2 (K3): Class-3 darf NICHT in die Cloud -------------------
  const b = await ask(
    headers,
    "Bitte fasse zusammen, was Herr Meier unter thomas.meier@example.com berichtet hat.",
  )
  // `classification` steht NICHT im Antwort-Rumpf der Route — die erste Fassung
  // pruefte ein Feld, das es nie gab, und meldete `undefined`. Der belastbare
  // Ort ist ki_runs, weiter unten.
  check("K3 kein Cloud-Anbieter bei Class-3", b.provider !== "openai",
    `provider=${b.provider}`)
  check("K3 leere Antwort ist erklaert", typeof b.reason_code === "string",
    `reason_code=${b.reason_code}`)

  // --- K4: der Skill selbst wird klassifiziert (PROJ-Y-151e) ---------------
  //
  // Die Skill-Anweisungen gehen ueber den System-Prompt an den Anbieter, standen
  // aber nicht im Suchtext des Klassifizierers. Eine Mandanten-Administration
  // haette damit Personendaten in einen Skill schreiben koennen, und sie waeren
  // an einem Cloud-Modell gelandet, OHNE dass der Class-3-Gate greift — fuer
  // Invariante #3 derselbe Bruch, auch wenn der Skill das Tor nicht aushebelt,
  // sondern daran vorbeigeht. Hier wird das Verhalten am DEPLOYTEN Stand
  // gemessen, nicht nur im Unit-Test.
  await setSkillContent(userId, "Ansprechpartner ist thomas.meier@example.com.")

  const c = await ask(headers, "Fasse den Stand in einem Satz zusammen.")
  check("K4 ein Skill mit Personendaten hebt auf Klasse 3",
    c.provider !== "openai" && c.reason_code === "class3_blocked",
    `provider=${c.provider} reason=${c.reason_code}`)

  // Gegenprobe: mit unauffaelligem Skill geht es wieder in die Cloud. Ohne sie
  // waere K4 auch dann gruen, wenn der Chat generell nichts mehr sendet.
  await setSkillContent(userId,
    `Beginne jede Antwort mit dem Wort ${MARK_SKILL} in Grossbuchstaben, gefolgt von einem Doppelpunkt.`)
  // FRISCHE Unterhaltung fuer die Gegenprobe. Die bisherige traegt seit K3 eine
  // E-Mail im Verlauf, und der Verlauf wird mitklassifiziert — jede weitere
  // Frage darin ist zu Recht Klasse 3. Die erste Fassung fragte in derselben
  // Unterhaltung nach und mass damit das Gedaechtnis statt den Skill.
  const frisch = await fetch(`${PROD}/api/projects/${P}/chat/conversations`, {
    method: "POST", headers, redirect: "manual",
    body: JSON.stringify({ title: "K4 Gegenprobe" }),
  })
  conversationId = (await frisch.json()).conversation.id
  const d = await ask(headers, "Nenne in einem Satz den Projekttyp.")
  check("K4 Gegenprobe: unauffaelliger Skill geht weiter in die Cloud",
    d.provider === "openai", `provider=${d.provider}`)

  // --- Was in ki_runs wirklich steht ---------------------------------------
  const runs = await must("ki_runs lesen", admin
    .from("ki_runs")
    .select("purpose, provider, status, classification, reason_code, input_tokens, output_tokens")
    .eq("tenant_id", T)
    .order("created_at", { ascending: true }))
  log("  ki_runs der Lane:")
  for (const r of runs) {
    log(`    ${r.purpose} provider=${r.provider} status=${r.status} ` +
      `class=${r.classification} reason=${r.reason_code} ` +
      `token=${r.input_tokens}/${r.output_tokens}`)
  }
  // Vier: K1/K2, K3, K4 und die K4-Gegenprobe. Die frische Unterhaltung der
  // Gegenprobe fuegt KEINEN Lauf hinzu — sie isoliert nur den Verlauf. Die
  // erste Fassung erwartete faelschlich fuenf; die Zusicherung hat es gefangen.
  check("alle vier Laeufe sind in ki_runs protokolliert", runs.length === 4,
    `${runs.length} Zeilen`)
  // `every` auf einer leeren Liste ist wahr — diese Zusicherung bestand in der
  // ersten Fassung LEER, weil das `select` an falschen Spaltennamen scheiterte
  // und der Fehler verschluckt wurde. Deshalb erst die Laenge, dann der Inhalt.
  check("alle Laeufe tragen den Zweck project_chat",
    runs.length === 4 && runs.every((r) => r.purpose === "project_chat"))
  check("K3 Class-3 in ki_runs erkannt", runs[1]?.classification === 3,
    `classification=${runs[1]?.classification}`)
  check("Durchlauf 1 ist in ki_runs als openai-Erfolg protokolliert",
    runs[0]?.provider === "openai" && runs[0]?.status === "success" &&
      (runs[0]?.input_tokens ?? 0) > 0,
    `${runs[0]?.provider}/${runs[0]?.status}/${runs[0]?.input_tokens}`)
}

async function cleanup() {
  // Laufbezogen — muss restlos verschwinden, inkl. der Schluesselkopie.
  const perRun = [
    ["ai_chat_messages", "tenant_id", T],
    ["ai_chat_conversations", "tenant_id", T],
    ["ai_chat_folders", "tenant_id", T],
    ["ai_chat_prompt_favorites", "tenant_id", T],
    ["ai_chat_prompt_templates", "tenant_id", T],
    ["ki_runs", "tenant_id", T],
    ["project_skills", "tenant_id", T],
  ]
  for (const [t, col, val] of perRun) await admin.from(t).delete().eq(col, val)
  await admin.from("skills").update({ current_version_id: null }).eq("id", SKILL)
  await admin.from("skill_versions").delete().eq("skill_id", SKILL)
  await admin.from("skills").delete().eq("id", SKILL)
  await admin.from("tenant_ai_providers").delete().eq("tenant_id", T)
  await admin.from("project_memberships").delete().eq("project_id", P)
  await admin.from("projects").delete().eq("tenant_id", T)

  const counted = [
    ...perRun,
    ["skill_versions", "skill_id", SKILL],
    ["skills", "id", SKILL],
    ["tenant_ai_providers", "tenant_id", T],
    ["project_memberships", "project_id", P],
    ["projects", "tenant_id", T],
  ]
  let residue = 0
  for (const [t, col, val] of counted) {
    const { count } = await admin
      .from(t)
      .select("*", { count: "exact", head: true })
      .eq(col, val)
    if (count) {
      log(`    RUECKSTAND ${t}: ${count}`)
      residue += count
    }
  }
  check(`0 laufbezogene Rueckstaende ueber ${counted.length} Tabellen`,
    residue === 0, `${residue}`)

  // Gegenprobe: der Kundenmandant darf durch diesen Lauf keine Zeile bekommen
  // haben. Ohne sie belegt "0 Rueckstaende" nur, dass die LANE leer ist.
  const { count: foreign } = await admin
    .from("ai_chat_conversations")
    .select("*", { count: "exact", head: true })
    .neq("tenant_id", T)
  check("keine Chat-Zeile ausserhalb der Lane", (foreign ?? 0) === 0, `${foreign}`)

  log(`  Lane-Mandant ${T} bleibt als Fixture stehen (siehe Kopf).`)
}

let failed = false
try {
  await run()
} catch (e) {
  console.error("FEHLER:", e.message)
  failed = true
} finally {
  await cleanup()
}
const bad = results.filter((r) => !r.ok).length
log(`\n  ${results.length - bad}/${results.length} PASS, ${bad} FAIL`)
process.exit(failed || bad ? 1 : 0)
