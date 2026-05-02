/**
 * PROJ-31 — Magic-Link token sign / verify.
 *
 * HMAC-SHA256 with a server-side secret (`APPROVAL_TOKEN_SECRET` env-var).
 * The token is base64url(payload) + "." + base64url(signature) where
 * payload = JSON.stringify({ approver_id, decision_id, tenant_id, exp }).
 *
 * Server-side only. Never expose this module from a client component.
 *
 * Defense layers (validation order on incoming token):
 *   1. parse + signature (HMAC) — this module
 *   2. expiry — this module
 *   3. tenant_id match — caller checks against decision row
 *   4. approver row exists, response is null — caller checks
 *   5. decision_approval_state.status='pending' — caller checks
 *   6. decisions.is_revised = false — caller checks
 */

import { createHmac, timingSafeEqual } from "node:crypto"

export interface ApprovalTokenPayload {
  approver_id: string
  decision_id: string
  tenant_id: string
  /** Unix-epoch seconds. */
  exp: number
}

function base64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

function fromBase64url(s: string): Buffer {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/")
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4))
  return Buffer.from(padded + pad, "base64")
}

function getSecret(): string {
  const secret = process.env.APPROVAL_TOKEN_SECRET
  if (!secret || secret.length < 32) {
    throw new Error(
      "APPROVAL_TOKEN_SECRET is not set or too short (min 32 chars). " +
        "See .env.local.example.",
    )
  }
  return secret
}

function sign(secret: string, message: string): Buffer {
  return createHmac("sha256", secret).update(message).digest()
}

export function signApprovalToken(payload: ApprovalTokenPayload): string {
  const secret = getSecret()
  const json = JSON.stringify(payload)
  const head = base64url(json)
  const sig = sign(secret, head)
  return `${head}.${base64url(sig)}`
}

export type TokenVerifyResult =
  | { ok: true; payload: ApprovalTokenPayload }
  | { ok: false; reason: "malformed" | "invalid_signature" | "expired" }

export function verifyApprovalToken(token: string): TokenVerifyResult {
  if (typeof token !== "string" || !token.includes(".")) {
    return { ok: false, reason: "malformed" }
  }
  const [head, sigStr] = token.split(".")
  if (!head || !sigStr) return { ok: false, reason: "malformed" }

  let secret: string
  try {
    secret = getSecret()
  } catch {
    return { ok: false, reason: "malformed" }
  }

  let sigBuf: Buffer
  try {
    sigBuf = fromBase64url(sigStr)
  } catch {
    return { ok: false, reason: "malformed" }
  }

  const expected = sign(secret, head)
  if (sigBuf.length !== expected.length) {
    return { ok: false, reason: "invalid_signature" }
  }
  if (!timingSafeEqual(sigBuf, expected)) {
    return { ok: false, reason: "invalid_signature" }
  }

  let payload: ApprovalTokenPayload
  try {
    const json = fromBase64url(head).toString("utf8")
    payload = JSON.parse(json) as ApprovalTokenPayload
  } catch {
    return { ok: false, reason: "malformed" }
  }

  if (
    typeof payload.approver_id !== "string" ||
    typeof payload.decision_id !== "string" ||
    typeof payload.tenant_id !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return { ok: false, reason: "malformed" }
  }

  if (payload.exp * 1000 < Date.now()) {
    return { ok: false, reason: "expired" }
  }

  return { ok: true, payload }
}
