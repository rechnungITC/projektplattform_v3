const EXACT_SENSITIVE_KEYS = new Set([
  "content_excerpt",
  "contentexcerpt",
  "excerpt",
  "parser_output",
  "parseroutput",
  "raw_parser_output",
  "rawparseroutput",
  "raw_text",
  "rawtext",
  "parsed_text",
  "parsedtext",
  "email_body",
  "emailbody",
  "source_metadata",
  "sourcemetadata",
  "proj70_delta_email",
  "proj70deltaemail",
])

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[-_\s]/g, "")
}

export function isSensitiveSentryKey(key: string) {
  const lowerKey = key.toLowerCase()
  const normalized = normalizeKey(key)

  return (
    EXACT_SENSITIVE_KEYS.has(lowerKey) ||
    EXACT_SENSITIVE_KEYS.has(normalized) ||
    lowerKey.endsWith("_excerpt") ||
    lowerKey.endsWith("-excerpt") ||
    normalized.endsWith("excerpt") ||
    normalized.endsWith("parseroutput")
  )
}

function scrubValue(value: unknown, seen: WeakSet<object>): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => scrubValue(entry, seen))
  }

  if (!value || typeof value !== "object") {
    return value
  }

  if (seen.has(value)) {
    return "[Circular]"
  }

  seen.add(value)

  const scrubbed: Record<string, unknown> = {}
  for (const [key, nestedValue] of Object.entries(value)) {
    if (isSensitiveSentryKey(key)) continue
    scrubbed[key] = scrubValue(nestedValue, seen)
  }

  return scrubbed
}

export function scrubSentryEvent<T>(event: T): T {
  return scrubValue(event, new WeakSet<object>()) as T
}
