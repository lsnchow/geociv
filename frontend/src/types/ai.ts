// AI-Max Types

import type { Proposal } from './index';

// =============================================================================
// Variants
// =============================================================================

export interface RankedVariant {
  id: string;
  variant_type: 'alternate' | 'compromise' | 'spicy' | 'base';
  name: string;
  description: string;
  proposal: Proposal;
  overall_approval: number;
  overall_sentiment: string;
  metric_deltas: Record<string, number>;
  support_score: number;
  equity_score: number;
  environment_score: number;
  feasibility_score: number;
  changes_from_base: string[];
}

export interface VariantBundle {
  base: RankedVariant;
  alternates: RankedVariant[];
  compromises: RankedVariant[];
  spicy: RankedVariant;
  rankings: Record<string, string[]>;
  analysis_summary: string;
  recommended_variant_id?: string;
  recommendation_reason: string;
}

export interface GenerateVariantsResponse {
  success: boolean;
  bundle?: VariantBundle;
  error?: string;
  generation_time_ms: number;
}

// =============================================================================
// Objective Seeking
// =============================================================================

export interface Constraint {
  metric: string;
  operator: '>' | '>=' | '<' | '<=' | '==';
  value: number;
}

export interface ObjectiveGoal {
  constraints: Constraint[];
  priorities: string[];
  description: string;
}

export interface SeekIteration {
  iteration: number;
  proposal: Proposal;
  approval: number;
  constraints_met: number;
  constraints_total: number;
  change_made: string;
}

export interface SeekResult {
  success: boolean;
  goal_achieved: boolean;
  best_proposal: Proposal;
  best_approval: number;
  constraints_met: number;
  constraints_total: number;
  iterations_used: number;
  iteration_history: SeekIteration[];
  explanation: string;
  suggestions_if_failed: string[];
}

// =============================================================================
// Town Hall
// =============================================================================

export interface Speaker {
  id: string;
  archetype_key: string;
  name: string;
  role: string;
  stance: 'support' | 'oppose' | 'mixed';
  approval_score: number;
  avatar_emoji: string;
}

export interface Exchange {
  speaker_id: string;
  type: 'statement' | 'question' | 'rebuttal' | 'interruption' | 'agreement';
  content: string;
  cited_metrics: string[];
  emotion: string;
}

export interface TownHallTranscript {
  speakers: Speaker[];
  exchanges: Exchange[];
  summary: string;
  key_tensions: string[];
  consensus_points: string[];
  vote_prediction: string;
}

export interface CrossExamineResponse {
  speaker_name: string;
  response: string;
  stance_changed: boolean;
  new_stance?: string;
}

export interface FlipSpeakerResponse {
  speaker_name: string;
  current_stance: string;
  current_score: number;
  suggestions: string[];
  modified_proposal?: Proposal;
  projected_new_score?: number;
}

// =============================================================================
// History Intelligence
// =============================================================================

export interface HistoryInsight {
  id: string;
  pattern_type: 'lever_effect' | 'archetype_trend' | 'metric_correlation' | 'best_practice' | 'warning';
  title: string;
  description: string;
  confidence: number;
  evidence_count: number;
  evidence_ids: string[];
  actionable_advice: string;
}

export interface HistoryAnalysis {
  total_runs: number;
  insights: HistoryInsight[];
  best_run_id?: string;
  best_run_approval?: number;
  worst_run_id?: string;
  worst_run_approval?: number;
  playbook_recommendations: string[];
  summary: string;
}

// =============================================================================
// Zone Description
// =============================================================================

export interface ZoneDescription {
  cluster_id: string;
  cluster_name: string;
  primary_character: string;
  description: string;
  dominant_archetypes: string[];
  archetype_breakdown: Record<string, number>;
  recommended_proposals: string[];
  avoid_proposals: string[];
  current_score?: number;
  score_explanation?: string;
}

// =============================================================================
// Compile
// =============================================================================

export interface CompiledProposal {
  proposal: Proposal;
  confidence: number;
  assumptions: Array<{ field: string; value: string; reason: string }>;
  interpretation: string;
}

export interface CompileResponse {
  success: boolean;
  proposals: CompiledProposal[];
  message: string;
  needs_clarification: boolean;
  clarification_question?: string;
}

// =============================================================================
// AI Receipt
// =============================================================================

export interface AIReceipt {
  run_hash: string;
  active_features: string[];
  assumptions_count: number;
  assumptions: Array<{ field: string; value: string; reason: string }>;
  deterministic_metrics: boolean;
  timestamp: string;
  scenario_seed?: number;
  recipe: Record<string, unknown>;
}

// =============================================================================
// AI Chat Response (Full Agent Loop)
// =============================================================================

export interface SimulationSummary {
  overall_approval: number;
  overall_sentiment: string;
  top_supporters: string[];
  top_opponents: string[];
  key_drivers: Array<Record<string, unknown>>;
  metric_deltas: Record<string, number>;
}

export interface AIChatResponse {
  // Conversation
  thread_id: string;
  assistant_message: string;
  
  // Parsed proposal
  proposal_parsed: boolean;
  proposal?: Proposal;
  confidence: number;
  assumptions: Array<{ field: string; value: string; reason: string }>;
  
  // Simulation
  simulation_ran: boolean;
  simulation_result?: SimulationSummary;
  grounded_narrative?: string;
  
  // Roleplay
  persona_reaction?: string;
  persona_name?: string;
  
  // Receipt
  receipt: AIReceipt;
  
  // Error handling
  error?: string;
  backboard_available: boolean;
}

