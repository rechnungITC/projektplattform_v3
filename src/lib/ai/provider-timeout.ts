/**
 * PROJ-152 — Zeitbudget für jeden Provider-Aufruf.
 *
 * Befund, der diese Datei nötig macht: es gab **nirgends** einen Timeout.
 * Weder die Provider-Clients (`createOpenAICompatible`/`createAnthropic`/…
 * wurden ohne eigenes `fetch` erzeugt) noch die API-Routen (`maxDuration`
 * war in null von allen Routen gesetzt) begrenzten die Wartezeit. Bei einem
 * Ollama, das die Verbindung annimmt aber nicht antwortet, hing damit der
 * ganze POST bis zur Plattformgrenze — gemessen an zwei `ki_runs`-Zeilen vom
 * 2026-08-27 19:52/19:53, die mit `latency_ms = null` und 0 Vorschlägen
 * stehengeblieben sind. Im sequenziellen Orchestrator (PROJ-90) blockierte
 * das die nachfolgenden Module, obwohl die in 8 Sekunden durchgelaufen
 * wären.
 *
 * **Warum am `fetch` und nicht an den Aufrufen:** `generateObject`/
 * `generateText` nimmt ein `abortSignal`, aber es gibt **45 solche
 * Aufrufstellen** über fünf Provider und zwei Runner. Ein Budget je
 * Aufrufstelle wäre 45× dieselbe Zeile, und die 46. würde es vergessen —
 * genau die Klasse Lücke, an der PROJ-85 den stillen Stub-Rückfall hatte.
 * Das `fetch` des Clients ist der eine Ort, durch den **jeder** Aufruf
 * dieses Providers läuft, auch jeder künftige.
 *
 * Die zwei Budgets sind nicht symmetrisch, weil die Laufzeiten es nicht
 * sind (live gemessen): Cloud antwortet in 6–9 s, ein lokales Ollama
 * brauchte für dieselbe Aufgabe 176 s bzw. 253 s. Ein Budget, das lokale
 * Modelle bedient, wäre für Cloud sinnlos weit — und umgekehrt schnitte
 * ein cloud-taugliches Budget jeden erfolgreichen Ollama-Lauf ab.
 */

/** Lokale Modelle (Ollama). Nutzer-Entscheid: großzügig, dafür mit
 *  sichtbarer Fortschrittsanzeige in der Fläche. Live gemessene
 *  erfolgreiche Läufe lagen bei 176 s und 253 s, das Budget muss die
 *  also überleben. 240 s lässt unter der Vercel-Pro-Grenze von 300 s
 *  noch 60 s für Kontext-Sammlung und die DB-Schreibvorgänge. */
export const LOCAL_PROVIDER_TIMEOUT_MS = 240_000

/** Cloud-Anbieter (Anthropic · OpenAI · Google · Azure). Live gemessen
 *  6–9 s; 90 s ist reichlich und trotzdem endlich. Ein unbegrenztes
 *  `fetch` ist dieselbe Defektklasse, auch wenn sie dort bisher nicht
 *  aufgefallen ist. */
export const CLOUD_PROVIDER_TIMEOUT_MS = 90_000

/**
 * Ein Provider hat sein Zeitbudget überschritten.
 *
 * Eigene Klasse, damit der Router das von einem gewöhnlichen
 * Provider-Fehler unterscheiden und dem Nutzer den Unterschied sagen kann:
 * „falsch konfiguriert" und „antwortet nicht" führen zu verschiedenen
 * nächsten Schritten.
 */
export class ProviderTimeoutError extends Error {
  readonly providerName: string
  readonly timeoutMs: number

  constructor(providerName: string, timeoutMs: number) {
    const seconds = Math.round(timeoutMs / 1000)
    super(
      `Der Anbieter "${providerName}" hat innerhalb von ${seconds} Sekunden ` +
        `nicht geantwortet. Bei einem tenant-eigenen Ollama: läuft der ` +
        `Endpunkt, ist er von außen erreichbar, und ist das hinterlegte ` +
        `Modell dort wirklich installiert?`,
    )
    this.name = "ProviderTimeoutError"
    this.providerName = providerName
    this.timeoutMs = timeoutMs
  }
}

/** Erkennt den Abbruch, den `AbortSignal.timeout()` auslöst. */
function isAbortLikeError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "TimeoutError") return true
  if (err instanceof DOMException && err.name === "AbortError") return true
  if (err instanceof Error) {
    return err.name === "TimeoutError" || err.name === "AbortError"
  }
  return false
}

/**
 * Baut ein `fetch`, das jeder Anfrage ein Zeitbudget mitgibt.
 *
 * Das mitgelieferte Signal des Aufrufers wird **nicht** ersetzt, sondern
 * mit dem Budget-Signal verbunden — sonst nähme man dem AI-SDK (und einem
 * abbrechenden Client) die Möglichkeit, selbst abzubrechen. Wo
 * `AbortSignal.any` fehlt, gilt das Budget-Signal allein; ein
 * Zeitbudget ohne Verbund ist immer noch besser als gar keines.
 */
export function createTimeoutFetch(
  providerName: string,
  timeoutMs: number,
): typeof globalThis.fetch {
  return async (input, init) => {
    // Bewusst ein eigener Controller statt `AbortSignal.timeout()`:
    //   1. dessen Timer laeuft nach einer erfolgreichen Antwort weiter (bei
    //      240 s ein Handle, das die Anfrage ueberlebt) — hier wird er im
    //      `finally` abgeraeumt;
    //   2. er haengt an einem Node-internen Zeitgeber, den Testzeitsteuerung
    //      nicht stellen kann. Der Kernfall dieser Datei ist "antwortet nie";
    //      ein Test, der ihn nicht in vertretbarer Zeit ausloesen kann, wird
    //      nicht geschrieben — und dann bewacht nichts den Defekt.
    const budget = new AbortController()
    const timer = setTimeout(() => budget.abort(), timeoutMs)

    const incoming = init?.signal ?? null
    let signal: AbortSignal = budget.signal
    if (incoming) {
      signal =
        typeof AbortSignal.any === "function"
          ? AbortSignal.any([budget.signal, incoming])
          : budget.signal
    }

    try {
      return await globalThis.fetch(input, { ...init, signal })
    } catch (err) {
      // Nur das eigene Budget in einen sprechenden Fehler uebersetzen. Ein
      // Abbruch, der vom Aufrufer kam, bleibt ein Abbruch — ihn als Timeout
      // zu melden waere eine falsche Auskunft.
      if (budget.signal.aborted && isAbortLikeError(err)) {
        throw new ProviderTimeoutError(providerName, timeoutMs)
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }
}

/**
 * Formuliert die Meldung, mit der ein Provider-Fehler in den Stub-Rückfall
 * übergeht.
 *
 * Der Unterschied, den diese Funktion macht: „antwortet nicht" ist für den
 * Nutzer eine **andere** Lage als „hat einen Fehler geliefert". Beim Timeout
 * gibt es keine Fremdmeldung, die man zitieren könnte — die generische
 * `Provider X failed (…)`-Hülle würde dann nur eine deutsche Erklärung in
 * einen englischen Rahmen packen und die eigentliche Aussage verstecken.
 * PROJ-137 verlangt, dass ein leeres Ergebnis erklärbar ist; hier wird es
 * erklärt statt bloß gemeldet.
 */
export function describeProviderFallback(
  providerName: string,
  err: unknown,
): string {
  if (err instanceof ProviderTimeoutError) return err.message
  const detail = err instanceof Error ? err.message : String(err)
  return `Provider ${providerName} failed (${detail}); fell back to Stub.`
}
