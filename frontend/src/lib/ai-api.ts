// AI-Max API Client
// NO silent fallbacks - Backboard is REQUIRED

import type { Proposal } from '../types';
import type {
  GenerateVariantsResponse,
  ObjectiveGoal,
  SeekResult,
  TownHallTranscript as LegacyTownHallTranscript,
  CrossExamineResponse,
  FlipSpeakerResponse,
  HistoryAnalysis,
  ZoneDescription,
  CompileResponse,
  AIReceipt,
} from '../types/ai';
import type { SimulationResponse } from '../types/simulation';

const API_BASE = '/v1/ai';

class BackboardUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackboardUnavailableError';
  }
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || 'Request failed');
  }

  return response.json();
}

// =============================================================================
// AI Chat (Full Agent Loop) - PRIMARY INTERFACE
// =============================================================================

export interface AIChatOptions {
  message: string;
  scenario_id: string;
  thread_id?: string;
  session_id?: string; // For session continuity
  persona?: string;
  auto_simulate?: boolean;
  // Speaker mode for multi-agent roleplay
  speaker_mode?: 'user' | 'agent';
  speaker_agent_key?: string;
  // Build mode - spatial proposal with vicinity data
  build_proposal?: {
    type: 'spatial';
    spatial_type: string;
    title: string;
    latitude: number;
    longitude: number;
    scale?: number;
    radius_km?: number;
    affected_regions?: Array<{
      zone_id: string;
      zone_name: string;
      distance_bucket: 'near' | 'medium' | 'far';
      proximity_weight: number;
    }>;
    containing_zone?: { id: string; name: string };
  };
  // World state - canonical state for agent context
  world_state?: {
    version: number;
    placed_items: Array<{
      id: string;
      type: string;
      title: string;
      region_id?: string;
      region_name?: string;
      radius_km: number;
      emoji: string;
    }>;
    adopted_policies: Array<{
      id: string;
      title: string;
      summary: string;
      outcome: string;
      vote_pct: number;
      timestamp: string;
    }>;
    top_relationship_shifts: Array<{
      from_agent: string;
      to_agent: string;
      score: number;
      reason: string;
    }>;
  };
}

/**
 * Send a message to the AI chat endpoint.
 * This is the main interface for Cmd+K - NO local fallbacks.
 * Returns SimulationResponse with multi-agent reactions, zones, and town hall.
 * 
 * @throws BackboardUnavailableError if Backboard is unavailable (502)
 * @throws Error for other failures
 */
export async function chat(options: AIChatOptions): Promise<SimulationResponse> {
  // Validate message is not empty
  if (!options.message || !options.message.trim()) {
    throw new Error('Message cannot be empty');
  }
  
  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: options.message,
      scenario_id: options.scenario_id,
      thread_id: options.thread_id,
      session_id: options.session_id,
      persona: options.persona,
      auto_simulate: options.auto_simulate ?? true,
      speaker_mode: options.speaker_mode || 'user',
      speaker_agent_key: options.speaker_agent_key,
      build_proposal: options.build_proposal,
      world_state: options.world_state,
    }),
  });
  
  // Handle HTTP errors
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    
    // 502 = Backboard unavailable
    if (response.status === 502) {
      throw new BackboardUnavailableError(error.detail || 'Backboard unavailable');
    }
    
    // 400 = Bad request (e.g., empty message)
    if (response.status === 400) {
      throw new Error(error.detail || 'Invalid request');
    }
    
    throw new Error(error.detail || `Request failed with status ${response.status}`);
  }
  
  return response.json();
}

export { BackboardUnavailableError };

// =============================================================================
// Variants
// =============================================================================

export interface GenerateVariantsOptions {
  scenario_id: string;
  proposal: Proposal;
  ranking_priorities?: string[];
  include_spicy?: boolean;
}

export async function generateVariants(
  options: GenerateVariantsOptions
): Promise<GenerateVariantsResponse> {
  return request('/variants', {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

// =============================================================================
// Objective Seeking
// =============================================================================

export interface SeekObjectiveOptions {
  scenario_id: string;
  starting_proposal: Proposal;
  goal: ObjectiveGoal;
  max_iterations?: number;
}

export async function seekObjective(
  options: SeekObjectiveOptions
): Promise<{ success: boolean; result?: SeekResult; error?: string }> {
  return request('/seek', {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

// =============================================================================
// Town Hall
// =============================================================================

export interface GenerateTownHallOptions {
  scenario_id: string;
  proposal: Proposal;
  num_speakers?: number;
  include_dramatic_elements?: boolean;
  focus_archetype?: string;
}

export async function generateTownHall(
  options: GenerateTownHallOptions
): Promise<{ success: boolean; transcript?: LegacyTownHallTranscript; error?: string }> {
  return request('/townhall', {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

export async function crossExamine(
  scenario_id: string,
  proposal: Proposal,
  speaker_archetype: string,
  question: string
): Promise<CrossExamineResponse> {
  return request('/townhall/cross-examine', {
    method: 'POST',
    body: JSON.stringify({ scenario_id, proposal, speaker_archetype, question }),
  });
}

export async function flipSpeaker(
  scenario_id: string,
  proposal: Proposal,
  speaker_archetype: string
): Promise<FlipSpeakerResponse> {
  return request('/townhall/flip', {
    method: 'POST',
    body: JSON.stringify({ scenario_id, proposal, speaker_archetype }),
  });
}

// =============================================================================
// History Intelligence
// =============================================================================

export interface AnalyzeHistoryOptions {
  scenario_id: string;
  history: Array<Record<string, unknown>>;
  focus_metric?: string;
}

export async function analyzeHistory(
  options: AnalyzeHistoryOptions
): Promise<{ success: boolean; analysis?: HistoryAnalysis; error?: string }> {
  return request('/history/analyze', {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

export async function findBestRun(
  scenario_id: string,
  history: Array<Record<string, unknown>>,
  criteria: string
): Promise<{ success: boolean; run_id?: string; run?: Record<string, unknown>; explanation: string }> {
  return request('/history/best', {
    method: 'POST',
    body: JSON.stringify({ scenario_id, history, criteria }),
  });
}

// =============================================================================
// Zone Description
// =============================================================================

export interface DescribeZoneOptions {
  scenario_id: string;
  cluster_id: string;
  current_proposal?: Proposal;
}

export async function describeZone(
  options: DescribeZoneOptions
): Promise<{ success: boolean; description?: ZoneDescription; error?: string }> {
  return request('/zones/describe', {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

// =============================================================================
// Compile
// =============================================================================

export interface CompileOptions {
  scenario_id: string;
  input_text: string;
  map_click?: { lat: number; lng: number };
  lasso_path?: Array<{ lat: number; lng: number }>;
}

export async function compileInput(options: CompileOptions): Promise<CompileResponse> {
  return request('/compile', {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

// =============================================================================
// Receipt
// =============================================================================

export async function getReceipt(run_id: string): Promise<AIReceipt> {
  return request(`/receipt/${run_id}`, { method: 'GET' });
}

