/**
 * PROJ-95 — M&A standard phase preset (declarative code constant).
 *
 * The ten M&A lifecycle phases from "Strategie" to "Post-Merger-Integration".
 * Per the tech design (ADR `ma-domain-architecture`, Fork 1+5) this is a
 * CODE constant, NOT a DB table: activating the M&A phase model copies these
 * into the existing `phases` table (one row per phase). The editable template
 * LIBRARY + full deal_side preset matrix is deferred to PROJ-96; this module
 * intentionally ships ONE default set with only minimal `deal_side` annotation.
 *
 * Phase 2 ("Target-Screening") is mandate-gated: it is only seeded once the
 * project's `ma_project_profiles.mandate_status = 'approved'` (PROJ-94 gate).
 * The seed RPC `activate_ma_phase_model` owns that enforcement server-side.
 */

export type DealSide = "buy" | "sell" | "jv" | "carve_out"

export interface MaPhasePreset {
  /** Stable key (not persisted; used by FE for roadmap overlay + tests). */
  key: string
  /** 1-based sequence number written to phases.sequence_number. */
  sequence: number
  /** German phase name written to phases.name. */
  name_de: string
  /** Short description written to phases.description. */
  description_de: string
  /**
   * When true, this phase is only seeded once the mandate is approved
   * (PROJ-94). Exactly one phase carries this in the MVP preset (Phase 2).
   */
  mandateGated?: boolean
  /**
   * Forward-compatible deal_side visibility. Empty/undefined = all sides.
   * PROJ-96 turns this into the full preset matrix; MVP seeds all phases
   * regardless of deal_side (minimal variation only).
   */
  dealSides?: readonly DealSide[]
}

export const MA_PHASE_PRESET: readonly MaPhasePreset[] = [
  {
    key: "strategy",
    sequence: 1,
    name_de: "Strategie & Vorbereitung",
    description_de:
      "Deal-Rationale, Zielbild, Suchprofil und Investitionsrahmen festlegen.",
  },
  {
    key: "target_screening",
    sequence: 2,
    name_de: "Target-Screening & Identifikation",
    description_de:
      "Zielunternehmen identifizieren, longlist/shortlist priorisieren. Erst nach Mandatsfreigabe.",
    mandateGated: true,
  },
  {
    key: "approach_nda",
    sequence: 3,
    name_de: "Erstansprache & NDA",
    description_de:
      "Kontaktaufnahme, Vertraulichkeitsvereinbarung (NDA) abschließen.",
  },
  {
    key: "loi",
    sequence: 4,
    name_de: "Indikatives Angebot / LOI",
    description_de:
      "Indikatives Angebot, Letter of Intent, Verhandlungsrahmen abstecken.",
  },
  {
    key: "due_diligence",
    sequence: 5,
    name_de: "Due Diligence",
    description_de:
      "DD-Streams (Legal, Tax, Financial, Commercial, IT, HR), Findings und Red-Flags.",
  },
  {
    key: "valuation_binding_offer",
    sequence: 6,
    name_de: "Bewertung & verbindliches Angebot",
    description_de:
      "Business Case, Kaufpreis-Bridge, verbindliches Angebot ableiten.",
  },
  {
    key: "negotiation_spa",
    sequence: 7,
    name_de: "Vertragsverhandlung / SPA",
    description_de:
      "SPA-Verhandlung, Issues-List, Closing Conditions definieren.",
  },
  {
    key: "signing",
    sequence: 8,
    name_de: "Signing",
    description_de: "Vertragsunterzeichnung und Übergang zu Closing-Bedingungen.",
  },
  {
    key: "closing",
    sequence: 9,
    name_de: "Closing",
    description_de:
      "Erfüllung der Closing Conditions, Vollzug und Übergabe an Integration.",
  },
  {
    key: "pmi",
    sequence: 10,
    name_de: "Post-Merger-Integration",
    description_de:
      "Day-1- und 100-Tage-Plan, Synergie-Tracking, IMO-Steuerung.",
  },
] as const

/** The single mandate-gated phase in the MVP preset (Phase 2). */
export const MANDATE_GATED_PHASE_SEQUENCE = 2

/** Total number of phases in the M&A preset. */
export const MA_PHASE_COUNT = MA_PHASE_PRESET.length
