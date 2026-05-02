/**
 * PROJ-35 Phase 35-α — Big5/OCEAN Tonalitäts-Lookup-Table.
 *
 * 32 = 2⁵ Quadranten der binären Bänder (low/high pro Dimension).
 * Threshold: < 50 → 'low', ≥ 50 → 'high'.
 *
 * Quelle / Begründung pro Eintrag: docs/decisions/big5-tonality-lookup.md
 *
 * Reihenfolge der 5 Bänder im Tuple-Key: [O, C, E, A, S]
 *   O = Openness
 *   C = Conscientiousness
 *   E = Extraversion
 *   A = Agreeableness
 *   S = Emotional Stability
 */

import {
  PERSONALITY_DIMENSIONS,
  type PersonalityDimension,
} from "@/types/stakeholder-profile"

export type Big5Band = "low" | "high"
export type Big5Quadrant = readonly [
  Big5Band,
  Big5Band,
  Big5Band,
  Big5Band,
  Big5Band,
]

export type ChannelPreference =
  | "1:1-Gespräch"
  | "Meeting + Folge-Mail"
  | "Schriftlich first"
  | "E-Mail mit Lese-Frist"

export interface TonalityRecommendation {
  tone: string
  detail_depth: string
  channel_preference: ChannelPreference
  notes: string[]
}

const BIG5_THRESHOLD = 50

export function quadrantKey(quadrant: Big5Quadrant): string {
  return quadrant.join("/")
}

/** Translates 0..100 numerics into a low/high quadrant. NULL → 'low'-default;
 *  caller should branch to the unknown-band handler instead when null is meaningful. */
export function bandFor(value: number | null): Big5Band {
  if (value === null || value === undefined) return "low"
  return value >= BIG5_THRESHOLD ? "high" : "low"
}

/** Convenience helper: build the full quadrant from a Big5-fremd record. */
export function quadrantFromBig5(values: {
  openness: number | null
  conscientiousness: number | null
  extraversion: number | null
  agreeableness: number | null
  emotional_stability: number | null
}): Big5Quadrant {
  return [
    bandFor(values.openness),
    bandFor(values.conscientiousness),
    bandFor(values.extraversion),
    bandFor(values.agreeableness),
    bandFor(values.emotional_stability),
  ] as const
}

/**
 * Lookup map. Key = "O/C/E/A/S" with each component ∈ {low,high}.
 * 32 entries in total — every Big5-fremd profile maps to exactly one.
 */
export const BIG5_TONALITY_TABLE: Readonly<
  Record<string, TonalityRecommendation>
> = Object.freeze({
  // ------ All-low: introvertiert, konservativ, schwer erreichbar ------
  "low/low/low/low/low": {
    tone: "ruhig, unaufgeregt, sachlich",
    detail_depth: "knapp und konkret",
    channel_preference: "Schriftlich first",
    notes: [
      "Wenig Vertrauensvorschuss — Beziehung schrittweise aufbauen",
      "Reaktiv, nicht proaktiv kommunikativ",
      "Druck wirkt destabilisierend — Tempo niedrig halten",
      "Kein Small-Talk, direkt zur Sache",
    ],
  },
  "low/low/low/low/high": {
    tone: "sachlich-direkt, frei von Floskeln",
    detail_depth: "knapp und konkret",
    channel_preference: "E-Mail mit Lese-Frist",
    notes: [
      "Stabil unter Druck — Eskalationen kommen nicht aus emotionalem Stress",
      "Kompetitiv eingestellt; nicht persönlich nehmen",
      "Wenig Bedarf an Beziehungspflege",
      "Klare Erwartungen schriftlich fixieren",
    ],
  },
  "low/low/low/high/low": {
    tone: "freundlich-bedacht, mit Ankündigung",
    detail_depth: "moderat, mit Kontext",
    channel_preference: "1:1-Gespräch",
    notes: [
      "Konfliktscheu + sensibel — Eskalationen früh entschärfen",
      "Kooperativ, sucht Konsens, braucht Sicherheit",
      "Direktiver Ton überfordert — vorsichtig führen",
      "Vertrauen aufbauen vor schwieriger Diskussion",
    ],
  },
  "low/low/low/high/high": {
    tone: "warm, kooperativ, zugewandt",
    detail_depth: "moderat, mit Kontext",
    channel_preference: "Meeting + Folge-Mail",
    notes: [
      "Stabil und kooperativ — verlässlicher Partner",
      "Wenig kommunikativ-aktiv, aber konstruktiv im 1:1",
      "Routine-Aufgaben gut, Innovation muss gepusht werden",
      "Kein Druck nötig — Vertrauen funktioniert",
    ],
  },
  "low/low/high/low/low": {
    tone: "kontrolliert-bestimmt, mit klaren Limits",
    detail_depth: "knapp, mit Anchor-Punkten",
    channel_preference: "Meeting + Folge-Mail",
    notes: [
      "Extravertiert + niedrige Stabilität → reaktiv-emotional, wenn unter Druck",
      "Kompetitiv, sucht Bühne — Rolle klar abgrenzen",
      "Spontan, wenig planvoll → schriftliche Vereinbarungen",
      "Gespräche gut moderieren, nicht ausufern lassen",
    ],
  },
  "low/low/high/low/high": {
    tone: "energetisch-direkt, ergebnisorientiert",
    detail_depth: "knapp, mit Highlights",
    channel_preference: "Meeting + Folge-Mail",
    notes: [
      "Extravertiert + stabil + niedrige Verträglichkeit = klassischer Performer",
      "Schnelle Entscheidungen erwarten, Tempo halten",
      "Direkte Kritik unproblematisch, aber niemals öffentlich",
      "Resultate-orientiert, weniger prozesstreu",
    ],
  },
  "low/low/high/high/low": {
    tone: "freundlich-zugewandt, mit Sicherheit gebend",
    detail_depth: "moderat, beruhigend",
    channel_preference: "1:1-Gespräch",
    notes: [
      "Sozial aktiv, kooperativ, aber emotional anfällig",
      "Braucht Bestätigung und Vorhersehbarkeit",
      "Konflikt vermeidend; Kritik sandwich-style verpacken",
      "Engagement steigt mit persönlicher Bindung",
    ],
  },
  "low/low/high/high/high": {
    tone: "kollegial-warm, motivierend",
    detail_depth: "moderat",
    channel_preference: "Meeting + Folge-Mail",
    notes: [
      "Stabiler Networker — gute Multiplikator-Person",
      "Konsens-orientiert, kann aber Position halten",
      "Zugang über Beziehung, nicht über Prozess",
      "Stakeholder-Brücke zu skeptischeren Personen einsetzbar",
    ],
  },
  // ------ Hoch C, niedrig O: konservativ-strukturiert ------
  "low/high/low/low/low": {
    tone: "präzise-faktenbasiert, formell",
    detail_depth: "hoch-detailliert",
    channel_preference: "E-Mail mit Lese-Frist",
    notes: [
      "Pflichtbewusst, systematisch, kritisch gegenüber Veränderung",
      "Fakten und Daten zählen, nicht Vision",
      "Kann unter Druck rigide werden",
      "Schriftliche Vorlagen mit Quellen funktionieren",
    ],
  },
  "low/high/low/low/high": {
    tone: "sachlich-direkt, datengetrieben",
    detail_depth: "hoch-detailliert",
    channel_preference: "E-Mail mit Lese-Frist",
    notes: [
      "Klassischer Skeptiker mit hoher Selbstdisziplin",
      "Argumente schlagen Beziehung; sauber begründen",
      "Stabil unter Druck, lässt sich nicht treiben",
      "Wenig Floskeln, kein Small-Talk",
    ],
  },
  "low/high/low/high/low": {
    tone: "freundlich-präzise, mit Sicherheit gebend",
    detail_depth: "hoch-detailliert",
    channel_preference: "Schriftlich first",
    notes: [
      "Loyaler Detail-Mensch, konfliktscheu",
      "Braucht klare Strukturen und Vorlauf",
      "Kann Kritik schwer äußern, aber stark spüren",
      "Sicheres Setting bevorzugen, keine Bühne",
    ],
  },
  "low/high/low/high/high": {
    tone: "warm-präzise, vertrauensvoll",
    detail_depth: "hoch-detailliert",
    channel_preference: "Meeting + Folge-Mail",
    notes: [
      "Verlässlicher Detail-Anker im Team",
      "Konsens + Struktur zugleich",
      "Geringe Innovations-Tendenz, aber sehr ausführungsstark",
      "Sehr gute Audit-/Compliance-Rolle",
    ],
  },
  "low/high/high/low/low": {
    tone: "fokussiert-bestimmt, mit Kontext-Diskipline",
    detail_depth: "hoch-detailliert",
    channel_preference: "Meeting + Folge-Mail",
    notes: [
      "Strukturiert + extravertiert + niedrige Stabilität = Perfektionist mit Stress",
      "Erwartet sauber vorbereitete Diskussionen",
      "Druck baut sich schnell auf — Eskalation vermeiden",
      "Detailtiefe sehr hoch, aber kompetitiv im Auftreten",
    ],
  },
  "low/high/high/low/high": {
    tone: "klar-ergebnisorientiert, mit harter Linie",
    detail_depth: "hoch-detailliert",
    channel_preference: "Meeting + Folge-Mail",
    notes: [
      "Effektivität-Person, hohe Anspruchshaltung",
      "Direkte Kritik OK, sachlich begründet",
      "Schnelle Entscheidungen, klare Verantwortung",
      "Kann Team-Dynamik herausfordern",
    ],
  },
  "low/high/high/high/low": {
    tone: "warm-strukturiert, sicherheitsgebend",
    detail_depth: "hoch-detailliert",
    channel_preference: "1:1-Gespräch",
    notes: [
      "Pflichtbewusst, sozial, aber emotional anfällig",
      "Braucht Anerkennung und planvolle Kommunikation",
      "Konflikt sucht zu glätten — Eskalations-Indikator nicht offensichtlich",
      "Gute Bridge-Person bei klarer Strukturierung",
    ],
  },
  "low/high/high/high/high": {
    tone: "kollegial-faktenbasiert, vertrauensvoll",
    detail_depth: "hoch-detailliert",
    channel_preference: "Meeting + Folge-Mail",
    notes: [
      "Idealer Co-Pilot: strukturiert, sozial, stabil",
      "Sehr verlässlich, aber wenig Innovation",
      "Ergebnis + Beziehung gleichermaßen wichtig",
      "Routinemäßige Steuerung gut delegierbar",
    ],
  },
  // ------ Hoch O, niedrig C: visionär aber chaotisch ------
  "high/low/low/low/low": {
    tone: "konzeptionell-respektvoll, in Themen denken",
    detail_depth: "moderat — Big-Picture vor Details",
    channel_preference: "1:1-Gespräch",
    notes: [
      "Kreativ aber unstrukturiert + introvertiert + sensibel",
      "Konzepte ja, Operatives schwer",
      "Druck blockt Output; Flow-State erlauben",
      "Kein Small-Talk, aber Themen-Tiefe schätzen",
    ],
  },
  "high/low/low/low/high": {
    tone: "ideen-getrieben, frei von Konventionen",
    detail_depth: "moderat",
    channel_preference: "Meeting + Folge-Mail",
    notes: [
      "Innovativ + unabhängig, kein Team-Player",
      "Stabil unter Druck, aber bockt bei Fremdsteuerung",
      "Direkte Diskussionen über Konzepte funktionieren",
      "Operationelle Details delegieren lassen",
    ],
  },
  "high/low/low/high/low": {
    tone: "neugierig-warm, mit Geduld führen",
    detail_depth: "moderat — Konzept + Beispiele",
    channel_preference: "1:1-Gespräch",
    notes: [
      "Visionär + kooperativ aber emotional anfällig",
      "Braucht Sicherheit, um Ideen einzubringen",
      "Konflikt blockiert Output sofort",
      "Vertrauensvolle 1:1-Beziehung pflegen",
    ],
  },
  "high/low/low/high/high": {
    tone: "kollegial-explorativ, offen-fragend",
    detail_depth: "moderat",
    channel_preference: "Meeting + Folge-Mail",
    notes: [
      "Stabiler Querdenker mit Team-Anschluss",
      "Bringt frische Perspektiven, aber wenig Push",
      "Strukturierende Person sollte ihn ergänzen",
      "Vertrauensbasis schon vorhanden",
    ],
  },
  "high/low/high/low/low": {
    tone: "energetisch-bunt, mit klaren Anker-Punkten",
    detail_depth: "moderat — Strukturen schaffen",
    channel_preference: "Meeting + Folge-Mail",
    notes: [
      "Extravertiert + visionär + chaotisch + reaktiv-emotional",
      "Sprudelt Ideen, braucht Co-Pilot für Umsetzung",
      "Druck führt zu Ausweich-Drift",
      "Klare Aktion und Verantwortung schriftlich fixieren",
    ],
  },
  "high/low/high/low/high": {
    tone: "visionär-direkt, ergebnis-mutig",
    detail_depth: "moderat — Vision + Schritte",
    channel_preference: "Meeting + Folge-Mail",
    notes: [
      "Klassischer Innovation-Driver, kompetitiv",
      "Stabil unter Druck, aber wenig kompromissbereit",
      "Direkte Diskussionen, klare Roadmap",
      "Brauchst eigenes Detail-Counter-Part",
    ],
  },
  "high/low/high/high/low": {
    tone: "warm-explorativ, sicherheitsgebend",
    detail_depth: "moderat — Konzept + Bestätigung",
    channel_preference: "1:1-Gespräch",
    notes: [
      "Visionär, sozial, aber stress-anfällig",
      "Zugang über Beziehung, nicht über Druck",
      "Konflikt sehr unangenehm — Mediation früh",
      "Kann Konzept-Brücke zu konservativen Stakeholdern bauen",
    ],
  },
  "high/low/high/high/high": {
    tone: "kollegial-optimistisch, big-picture",
    detail_depth: "moderat — Vision + Highlights",
    channel_preference: "Meeting + Folge-Mail",
    notes: [
      "Idealer Networker + Innovation-Sponsor",
      "Stabil + sozial + visionär",
      "Brauchst Detail-Co-Pilot für die Umsetzung",
      "Sehr gut für Kommunikation nach außen",
    ],
  },
  // ------ Hoch O + hoch C: Idealfall kreativ + strukturiert ------
  "high/high/low/low/low": {
    tone: "präzise-konzeptionell, sachlich-distanziert",
    detail_depth: "hoch-detailliert",
    channel_preference: "Schriftlich first",
    notes: [
      "Visionärer Architekt-Typ, introvertiert + sensibel",
      "Schreibt sehr gut, redet weniger gerne",
      "Druck destabilisiert — Tempo niedrig halten",
      "Konzepte sauber dokumentieren lassen",
    ],
  },
  "high/high/low/low/high": {
    tone: "datengetrieben + visionär, kein Floskeln",
    detail_depth: "hoch-detailliert",
    channel_preference: "E-Mail mit Lese-Frist",
    notes: [
      "Idealer Senior-Architekt, kompetitiv und stabil",
      "Hohe Selbstführung, fordert Gleichbehandlung",
      "Direkte sachliche Kommunikation, kein Smalltalk",
      "Kann allein arbeiten, braucht keinen Konsens",
    ],
  },
  "high/high/low/high/low": {
    tone: "freundlich-präzise, mit Geduld",
    detail_depth: "hoch-detailliert",
    channel_preference: "1:1-Gespräch",
    notes: [
      "Strukturierter Visionär, kooperativ aber stress-anfällig",
      "Braucht klare Erwartungen und Vorlauf",
      "Konflikt früh deeskalieren",
      "Schriftliche Detail-Vorlagen ergänzen das Gespräch",
    ],
  },
  "high/high/low/high/high": {
    tone: "kollegial-präzise, partnerschaftlich",
    detail_depth: "hoch-detailliert",
    channel_preference: "Meeting + Folge-Mail",
    notes: [
      "Verlässlicher Senior-Sparringspartner",
      "Visionär + strukturiert + sozial + stabil",
      "Liefert Ergebnisse mit hoher Qualität",
      "Konsens-orientiert ohne Identitäts-Verlust",
    ],
  },
  "high/high/high/low/low": {
    tone: "fokussiert-konzeptionell, kontrollierte Energie",
    detail_depth: "hoch-detailliert",
    channel_preference: "Meeting + Folge-Mail",
    notes: [
      "Treiber-Typ mit Vision + Struktur, aber stress-anfällig",
      "Kompetitiv, kann Team unter Druck setzen",
      "Direkte Kritik OK, aber niemals öffentlich",
      "Eskalationen früh adressieren — sonst Rückzug",
    ],
  },
  "high/high/high/low/high": {
    tone: "klar-faktenbasiert, ergebnisstark",
    detail_depth: "hoch-detailliert",
    channel_preference: "Meeting + Folge-Mail",
    notes: [
      "Power-Profil: Vision + Struktur + Drive + Stabilität",
      "Kompromisslos im Anspruch, klar in der Linie",
      "Direkte Kritik unproblematisch",
      "Kann Steering allein dominieren — Co-Stimmen einbinden",
    ],
  },
  "high/high/high/high/low": {
    tone: "warm-präzise, mit Anerkennung",
    detail_depth: "hoch-detailliert",
    channel_preference: "1:1-Gespräch",
    notes: [
      "Idealer Diplomat mit Detail-Tiefe, aber emotional sensibel",
      "Sucht Konsens und Struktur gleichermaßen",
      "Druck führt zu Rückzug oder Konflikt-Stress",
      "Sehr gute Bridge-Person zu allen Profilen",
    ],
  },
  "high/high/high/high/high": {
    tone: "kollegial-offen, vertrauensvoll-präzise",
    detail_depth: "hoch-detailliert",
    channel_preference: "Meeting + Folge-Mail",
    notes: [
      "Idealer Diskussionspartner — alle Bänder hoch",
      "Visionär, strukturiert, sozial, stabil, kooperativ",
      "Verlässlich, aber kann durch alle Profile bremsen wenn überlastet",
      "Strategische Partner-Rolle einsetzen",
    ],
  },
})

/**
 * Sentinel for unknown / incomplete Big5 — UI tooltip should reflect this.
 */
export const TONALITY_FALLBACK: Readonly<TonalityRecommendation> = Object.freeze(
  {
    tone: "respektvoll-neutral, kontextabhängig",
    detail_depth: "moderat",
    channel_preference: "Meeting + Folge-Mail",
    notes: [
      "Big5-Profil unvollständig — diese Empfehlung ist generisch.",
      "Profil ergänzen für präzise Tonalitäts-Empfehlung.",
    ],
  },
)

export interface TonalityResolveInput {
  big5_fremd: {
    openness: number | null
    conscientiousness: number | null
    extraversion: number | null
    agreeableness: number | null
    emotional_stability: number | null
  }
  /** Optional channel-override from qualitative fields. */
  preferred_channel?: ChannelPreference | null
  /** Optional adjustment from `communication_need='critical'`. */
  high_communication_need?: boolean
}

export interface ResolvedTonality {
  recommendation: TonalityRecommendation
  fallback: boolean
  quadrant_key: string | null
}

export function resolveTonality(
  input: TonalityResolveInput,
): ResolvedTonality {
  const allKnown = PERSONALITY_DIMENSIONS.every(
    (d: PersonalityDimension) => input.big5_fremd[d] !== null,
  )

  if (!allKnown) {
    const rec = applyOverrides(TONALITY_FALLBACK, input)
    return {
      recommendation: rec,
      fallback: true,
      quadrant_key: null,
    }
  }

  const q = quadrantFromBig5(input.big5_fremd)
  const key = quadrantKey(q)
  const base =
    BIG5_TONALITY_TABLE[key] ?? TONALITY_FALLBACK
  return {
    recommendation: applyOverrides(base, input),
    fallback: base === TONALITY_FALLBACK,
    quadrant_key: key,
  }
}

function applyOverrides(
  base: TonalityRecommendation,
  input: TonalityResolveInput,
): TonalityRecommendation {
  const channel = input.preferred_channel
    ? input.preferred_channel
    : base.channel_preference

  const notes = input.high_communication_need
    ? [
        ...base.notes,
        "Kommunikations-Bedarf ist als kritisch markiert — höhere Frequenz, früher informieren.",
      ]
    : base.notes

  return { ...base, channel_preference: channel, notes }
}
