import { z } from "zod"

import {
  ALPHA_PROVIDERS,
  MAILBOX_PROVIDERS,
  MAILBOX_SECURITY,
} from "@/lib/mailboxes/validation"

/**
 * PROJ-158-α — gemeinsame Eingabepruefung der Postfach-Routen.
 *
 * `provider` kennt alle drei Werte, damit β keine Schema-Aenderung braucht;
 * die Einschraenkung auf `imap` steht als eigene Regel daneben und wird von β
 * schlicht entfernt. Das trennt „was die Ablage kann" von „was diese Slice
 * freigibt" — ohne die Trennung muesste β beides gleichzeitig anfassen.
 */

const label = z.string().trim().min(1).max(120)

export const CreateMailboxSchema = z
  .object({
    label,
    provider: z.enum(MAILBOX_PROVIDERS),
    imap_host: z.string().trim().min(1).max(253).optional(),
    imap_port: z.number().int().min(1).max(65535).optional(),
    imap_security: z.enum(MAILBOX_SECURITY).optional(),
    imap_username: z.string().trim().min(1).max(320).optional(),
    password: z.string().min(1).max(1024).optional(),
  })
  .superRefine((v, ctx) => {
    if (!ALPHA_PROVIDERS.includes(v.provider)) {
      ctx.addIssue({
        code: "custom",
        path: ["provider"],
        message: "provider_not_available_yet",
      })
      return
    }
    // Ein IMAP-Postfach ohne vollstaendige Angaben waere ein Eintrag, den
    // niemand pruefen kann — dieselbe Regel wie der CHECK in der Ablage.
    for (const field of [
      "imap_host",
      "imap_port",
      "imap_security",
      "imap_username",
      "password",
    ] as const) {
      if (v[field] === undefined) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "required_for_imap",
        })
      }
    }
  })

export type CreateMailboxInput = z.infer<typeof CreateMailboxSchema>

/**
 * Beim Aendern ist jedes Feld optional. `password` fehlt zu lassen bedeutet
 * ausdruecklich **unveraendert** — es gibt keinen Weg, es zu leeren, weil ein
 * Postfach ohne Geheimnis nicht pruefbar waere.
 */
export const UpdateMailboxSchema = z
  .object({
    label: label.optional(),
    imap_host: z.string().trim().min(1).max(253).optional(),
    imap_port: z.number().int().min(1).max(65535).optional(),
    imap_security: z.enum(MAILBOX_SECURITY).optional(),
    imap_username: z.string().trim().min(1).max(320).optional(),
    password: z.string().min(1).max(1024).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "empty_update" })

export type UpdateMailboxInput = z.infer<typeof UpdateMailboxSchema>
