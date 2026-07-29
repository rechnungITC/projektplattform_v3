import { describe, expect, it } from "vitest"

import { validateExternalUrl } from "./external-link-validation"

describe("validateExternalUrl (PROJ-115 SSRF-safe static validation)", () => {
  it("accepts a normal https VDR url", () => {
    expect(validateExternalUrl("https://datasite.example.com/room/42/doc").ok).toBe(true)
  })

  it("rejects non-https schemes", () => {
    for (const u of [
      "http://vdr.example.com/x",
      "ftp://vdr.example.com/x",
      "file:///etc/passwd",
      "gopher://x",
      "data:text/html,x",
    ]) {
      expect(validateExternalUrl(u).ok, u).toBe(false)
    }
  })

  it("rejects credentials embedded in the URL", () => {
    expect(validateExternalUrl("https://user:pass@vdr.example.com/x").ok).toBe(false)
  })

  it("rejects the cloud-metadata address and link-local", () => {
    expect(validateExternalUrl("https://169.254.169.254/latest/meta-data/").ok).toBe(false)
    expect(validateExternalUrl("https://169.254.1.1/x").ok).toBe(false)
  })

  it("rejects RFC1918 + loopback + CGNAT + unspecified IPv4 literals", () => {
    for (const h of [
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.1",
      "192.168.1.1",
      "127.0.0.1",
      "0.0.0.0",
      "100.64.0.1",
    ]) {
      expect(validateExternalUrl(`https://${h}/x`).ok, h).toBe(false)
    }
  })

  it("allows public IPv4 literals", () => {
    expect(validateExternalUrl("https://8.8.8.8/x").ok).toBe(true)
    expect(validateExternalUrl("https://172.15.0.1/x").ok).toBe(true) // just outside 172.16/12
    expect(validateExternalUrl("https://172.32.0.1/x").ok).toBe(true)
  })

  it("rejects internal IPv6 (loopback, link-local, ULA, mapped-v4-internal)", () => {
    for (const h of ["[::1]", "[fe80::1]", "[fc00::1]", "[fd12::1]", "[::ffff:10.0.0.1]"]) {
      expect(validateExternalUrl(`https://${h}/x`).ok, h).toBe(false)
    }
  })

  it("rejects malformed octets + unparseable urls", () => {
    expect(validateExternalUrl("https://999.1.1.1/x").ok).toBe(false)
    expect(validateExternalUrl("not a url").ok).toBe(false)
  })
})
