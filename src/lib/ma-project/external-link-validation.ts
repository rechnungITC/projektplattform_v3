/**
 * PROJ-115 — static (SSRF-safe) validation for external datorroom URLs.
 *
 * The platform NEVER fetches these URLs server-side (active reachability check
 * is deferred to PROJ-Y-115a). This module only validates the URL statically at
 * write time so a malicious/internal target can never be persisted:
 *   - must parse + be https (no http/file/ftp/gopher/data)
 *   - no embedded credentials (user:pass@host)
 *   - hostname must not be an IP literal in a reserved/internal range
 *     (RFC1918, loopback, link-local incl. cloud-metadata 169.254.169.254,
 *      ULA, unspecified, CGNAT, IPv4-mapped IPv6)
 * Hostname-based (DNS) targets are allowed — resolving + IP-pinning belongs to
 * the deferred active-check slice, not to persistence.
 */

export interface ExternalUrlValidation {
  ok: boolean
  error?: string
}

function isReservedIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const o = m.slice(1).map((x) => Number(x))
  if (o.some((n) => n > 255)) return true // malformed octet → reject
  const [a, b] = o
  if (a === 10) return true // 10/8 RFC1918
  if (a === 127) return true // loopback
  if (a === 0) return true // 0.0.0.0/8 unspecified
  if (a === 169 && b === 254) return true // link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16/12
  if (a === 192 && b === 168) return true // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64/10 CGNAT
  return false
}

function isReservedIpv6(hostRaw: string): boolean {
  // URL hostnames wrap v6 in brackets; url.hostname already strips them.
  const host = hostRaw.toLowerCase()
  if (!host.includes(":")) return false
  if (host === "::1" || host === "::") return true // loopback / unspecified
  if (host.startsWith("fe80")) return true // link-local
  if (host.startsWith("fc") || host.startsWith("fd")) return true // fc00::/7 ULA
  // IPv4-mapped (::ffff:…) — Node may normalise the trailing v4 to hex
  // (::ffff:a00:1) so the dotted form isn't reliable; reject mapped addresses
  // outright (a real VDR uses a hostname or a plain address, never mapped-v6).
  if (host.includes("::ffff:")) return true
  const v4 = host.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (v4 && isReservedIpv4(v4[1])) return true
  return false
}

export function validateExternalUrl(raw: string): ExternalUrlValidation {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, error: "URL ist ungültig." }
  }
  if (url.protocol !== "https:") {
    return { ok: false, error: "Nur https-Links sind erlaubt." }
  }
  if (url.username || url.password) {
    return { ok: false, error: "Zugangsdaten in der URL sind nicht erlaubt." }
  }
  // Node's URL keeps IPv6 hostnames bracketed ("[::1]") — strip for range checks.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (!host) return { ok: false, error: "URL hat keinen Host." }
  if (isReservedIpv4(host) || isReservedIpv6(host)) {
    return { ok: false, error: "Interne/reservierte Adressen sind nicht erlaubt." }
  }
  if (raw.length > 2000) return { ok: false, error: "URL ist zu lang." }
  return { ok: true }
}
