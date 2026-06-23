/**
 * PROJ-12 + PROJ-30 — provider strategy interface.
 *
 * Each provider implementation knows how to turn a project context into
 * AI output. The router picks one based on data classification and env
 * config. PROJ-30 generalizes the original Risk-only interface to a
 * multi-purpose `AIProvider` with optional methods per purpose.
 */

import type {
  AIProviderName,
  ClarifyingQuestionsAutoContext,
  ClarifyingQuestionsGenerationOutput,
  CoachingAutoContext,
  CoachingGenerationOutput,
  CrossProjectLinksAutoContext,
  CrossProjectLinksGenerationOutput,
  NarrativeAutoContext,
  NarrativeGenerationOutput,
  ProposalFromContextAutoContext,
  ProposalFromContextGenerationOutput,
  StakeholderProposalsAutoContext,
  StakeholderProposalsGenerationOutput,
  RiskProposalsAutoContext,
  RiskProposalsGenerationOutput,
  ResourceSwapAutoContext,
  ResourceSwapGenerationOutput,
  RiskAutoContext,
  RiskGenerationOutput,
  SentimentAutoContext,
  SentimentGenerationOutput,
  TrajectorySequenceAutoContext,
  TrajectorySequenceGenerationOutput,
} from "../types"

export interface RiskGenerationRequest {
  context: RiskAutoContext
  /** Number of suggestions to ask for (3–10 typical). */
  count: number
}

export interface NarrativeGenerationRequest {
  context: NarrativeAutoContext
}

export interface SentimentGenerationRequest {
  context: SentimentAutoContext
}

export interface CoachingGenerationRequest {
  context: CoachingAutoContext
}

export interface TrajectorySequenceGenerationRequest {
  context: TrajectorySequenceAutoContext
  /** Soft target for how many suggestions to emit (provider may emit fewer). */
  count: number
}

export interface ResourceSwapGenerationRequest {
  context: ResourceSwapAutoContext
  /** Soft target for how many suggestions to emit (provider may emit fewer). */
  count: number
}

export interface CrossProjectLinksGenerationRequest {
  context: CrossProjectLinksAutoContext
  /** Soft target for how many suggestions to emit (provider may emit fewer). */
  count: number
}

export interface ProposalFromContextGenerationRequest {
  context: ProposalFromContextAutoContext
  /** Soft target for how many suggestions to emit (provider may emit fewer);
   *  capped at 50 by the Zod schema regardless. */
  count: number
}

export interface StakeholderProposalsGenerationRequest {
  context: StakeholderProposalsAutoContext
  /** Soft target for how many suggestions to emit (provider may emit fewer);
   *  capped at 30 by the Zod schema regardless. */
  count: number
}

export interface RiskProposalsGenerationRequest {
  context: RiskProposalsAutoContext
  /** Soft target for how many suggestions to emit (provider may emit fewer);
   *  capped at 30 by the Zod schema regardless. */
  count: number
}

export interface ClarifyingQuestionsGenerationRequest {
  context: ClarifyingQuestionsAutoContext
  /** Soft target for how many questions to emit (provider may emit fewer);
   *  capped at 6 by the Zod schema regardless. */
  count: number
}

/**
 * PROJ-30 + PROJ-34-γ.1 — generic provider interface. Methods are optional
 * so a provider can support a subset of purposes (e.g. Ollama implements
 * none of them; Anthropic + Stub implement risk + narrative + sentiment).
 *
 * The router calls a method only after `selectProvider` has decided
 * the provider is appropriate; if a provider lacks the requested
 * method the router catches the runtime throw and falls back.
 */
export interface AIProvider {
  readonly name: AIProviderName
  readonly modelId: string | null
  generateRiskSuggestions?(
    request: RiskGenerationRequest,
  ): Promise<RiskGenerationOutput>
  generateNarrative?(
    request: NarrativeGenerationRequest,
  ): Promise<NarrativeGenerationOutput>
  generateSentiment?(
    request: SentimentGenerationRequest,
  ): Promise<SentimentGenerationOutput>
  generateCoaching?(
    request: CoachingGenerationRequest,
  ): Promise<CoachingGenerationOutput>
  // PROJ-65 ε.4.α — trajectory-sequence suggestions (Class-2, advisory)
  generateTrajectorySequence?(
    request: TrajectorySequenceGenerationRequest,
  ): Promise<TrajectorySequenceGenerationOutput>
  // PROJ-65 ε.4.β — resource-swap suggestions (Class-3 hard-fix, Ollama-only)
  generateResourceSwap?(
    request: ResourceSwapGenerationRequest,
  ): Promise<ResourceSwapGenerationOutput>
  // PROJ-65 ε.4.γ — cross-project-link suggestions (Class-2, advisory)
  generateCrossProjectLinks?(
    request: CrossProjectLinksGenerationRequest,
  ): Promise<CrossProjectLinksGenerationOutput>
  // PROJ-70-α — auto-backlog from a kickoff context_source (advisory)
  generateProposalFromContext?(
    request: ProposalFromContextGenerationRequest,
  ): Promise<ProposalFromContextGenerationOutput>
  // PROJ-88 — stakeholder extraction from a kickoff (Class-3 pin, local-only)
  generateStakeholderProposals?(
    request: StakeholderProposalsGenerationRequest,
  ): Promise<StakeholderProposalsGenerationOutput>
  // PROJ-89 — risk proposals from a kickoff (content-based class, cloud-capable)
  generateRiskProposals?(
    request: RiskProposalsGenerationRequest,
  ): Promise<RiskProposalsGenerationOutput>
  // PROJ-135 — dialogic wizard clarifying questions (content-based class,
  // cloud-capable). Returns 0–6 questions; writes no ki_suggestions.
  generateClarifyingQuestions?(
    request: ClarifyingQuestionsGenerationRequest,
  ): Promise<ClarifyingQuestionsGenerationOutput>
}

/**
 * Deprecated alias preserved so existing imports of `AIRiskProvider`
 * continue to compile. New code should use {@link AIProvider}. The
 * Risk method is required on this alias to keep backward-compat at
 * the type level.
 */
export interface AIRiskProvider extends AIProvider {
  generateRiskSuggestions(
    request: RiskGenerationRequest,
  ): Promise<RiskGenerationOutput>
}
