// Multi-agent simulation types

// =============================================================================
// Proposal Interpretation
// =============================================================================

export interface ProposalLocation {
  kind: 'none' | 'zone' | 'point' | 'polygon';
  zone_ids: string[];
  point?: { lat: number; lng: number } | null;
  polygon?: GeoJSON.Polygon | null;
}

export interface ProposalParameters {
  scale: number;
  budget_millions?: number | null;
  target_group?: string | null;
}

export interface InterpretedProposal {
  type: 'build' | 'policy';
  title: string;
  summary: string;
  location: ProposalLocation;
  parameters: ProposalParameters;
}

// =============================================================================
// Adopted Event (compact summary for memory)
// =============================================================================

export interface AdoptedQuote {
  agent_name: string;
  stance: 'support' | 'oppose' | 'neutral';
  quote: string;
}

export interface ZoneDelta {
  zone_id: string;
  zone_name: string;
  sentiment_shift: number;  // -1 to +1
}

export interface AdoptedEvent {
  id: string;
  timestamp: string;
  session_id: string;
  proposal: InterpretedProposal;
  outcome: 'adopted' | 'forced';
  origin_proposal_id: string;  // For idempotent promotion
  vote_summary: {
    support: number;
    oppose: number;
    neutral: number;
    agreement_pct: number;
  };
  key_quotes: AdoptedQuote[];  // 2-4 representative quotes
  zone_deltas: ZoneDelta[];    // which zones shifted most
}

// =============================================================================
// Proposal Feed Item (for Results feed)
// =============================================================================

export type ProposalSource = 'townhall' | 'general_chat' | 'placement';

export interface ProposalFeedItem {
  id: string;  // Unique proposal ID for idempotent promotion
  timestamp: string;
  source: ProposalSource;
  proposal: InterpretedProposal;
  reactions: AgentReaction[];
  vote_summary: {
    support: number;
    oppose: number;
    neutral: number;
    agreement_pct: number;
  };
  can_promote: boolean;  // true if agreement_pct >= 50
  is_promoted: boolean;  // true if already in adoptedProposals
}

// =============================================================================
// Agent Reaction
// Note: agent_key == region_id (canonical rule)
// =============================================================================

export interface ZoneEffect {
  zone_id: string;
  effect: 'support' | 'oppose' | 'neutral';
  intensity: number;
}

export interface AgentReaction {
  agent_key: string;  // == region_id
  agent_name: string; // display_name
  avatar: string;
  role: string;       // e.g., "North End Parent"
  bio: string;        // UI-only identity field
  tags: string[];     // e.g., ["families", "safety"]
  stance: 'support' | 'oppose' | 'neutral';
  intensity: number;
  support_reasons: string[];
  concerns: string[];
  quote: string;
  what_would_change_my_mind: string[];
  zones_most_affected: ZoneEffect[];
  proposed_amendments: string[];
}

// =============================================================================
// Zone Sentiment
// =============================================================================

export interface QuoteAttribution {
  agent_name: string;
  quote: string;
}

export interface ZoneSentiment {
  zone_id: string;
  zone_name: string;
  sentiment: 'support' | 'oppose' | 'neutral';
  score: number; // -1 to +1
  top_support_quotes: QuoteAttribution[];
  top_oppose_quotes: QuoteAttribution[];
}

// =============================================================================
// Town Hall Transcript
// =============================================================================

export interface TranscriptTurn {
  speaker: string;
  text: string;
}

export interface TownHallTranscript {
  moderator_summary: string;
  turns: TranscriptTurn[];
  compromise_options: string[];
}

// =============================================================================
// Full Response
// =============================================================================

export interface SimulationReceipt {
  provider: string;
  memory: string;
  model_name: string;
  agent_count: number;
  duration_ms: number;
  run_hash: string;
  timestamp: string;
}

export interface SimulationResponse {
  session_id: string;
  thread_id: string;
  assistant_message: string;
  proposal?: InterpretedProposal | null;
  reactions: AgentReaction[];
  zones: ZoneSentiment[];
  town_hall?: TownHallTranscript | null;
  receipt: SimulationReceipt;
  error?: string | null;
}

// Alias for compatibility
export type MultiAgentResponse = SimulationResponse;

// =============================================================================
// Zone GeoJSON Feature
// Note: id == agent_key (canonical rule)
// =============================================================================

export interface ZoneFeatureProperties {
  id: string;           // zone_id == agent_key
  name: string;
  description: string;
}

export interface ZoneFeature extends GeoJSON.Feature<GeoJSON.Polygon, ZoneFeatureProperties> {}

export interface ZoneFeatureCollection extends GeoJSON.FeatureCollection<GeoJSON.Polygon, ZoneFeatureProperties> {}

