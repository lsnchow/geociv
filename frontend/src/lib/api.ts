import type { 
  Proposal, 
  SimulationResult, 
  Scenario, 
  ScenarioSummary,
  HistoryEntry 
} from '../types';

const API_BASE = '/v1';

class ApiError extends Error {
  status: number;
  
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function request<T>(
  endpoint: string, 
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new ApiError(response.status, error.detail || 'Request failed');
  }

  return response.json();
}

// Scenarios
export async function listScenarios(): Promise<ScenarioSummary[]> {
  return request<ScenarioSummary[]>('/scenarios');
}

export async function getScenario(id: string): Promise<Scenario> {
  return request<Scenario>(`/scenario/${id}`);
}

export async function seedKingstonScenario(): Promise<Scenario> {
  return request<Scenario>('/scenario/seed-kingston', { method: 'POST' });
}

// Simulation
export interface SimulateOptions {
  scenario_id: string;
  proposal: Proposal;
  lambda_override?: number;
  include_narrative?: boolean;
}

export async function simulate(options: SimulateOptions): Promise<SimulationResult> {
  return request<SimulationResult>('/simulate', {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

// Enhanced simulation with persona
export interface EnhancedSimulateOptions extends SimulateOptions {
  persona?: string;
  show_my_work?: boolean;
}

export async function simulateEnhanced(options: EnhancedSimulateOptions): Promise<SimulationResult & { persona_response?: unknown; show_my_work?: unknown }> {
  return request('/simulate/enhanced', {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

// Chat
export interface ChatMessage {
  content: string;
  scenario_id?: string;
  persona?: string;
  auto_simulate?: boolean;
}

export interface ChatResponse {
  message: string;
  proposal_parsed: boolean;
  proposal?: Proposal;
  simulation_result?: Partial<SimulationResult>;
}

export async function sendChatMessage(message: ChatMessage): Promise<ChatResponse> {
  return request<ChatResponse>('/chat/message', {
    method: 'POST',
    body: JSON.stringify(message),
  });
}

// History (stored in backend via simulations endpoint)
export async function getSimulationHistory(scenarioId: string): Promise<{ simulations: HistoryEntry[] }> {
  return request(`/simulations/${scenarioId}`);
}

// Health check
export async function healthCheck(): Promise<{ status: string }> {
  return request('/health');
}

// Archetypes and Metrics
export async function getArchetypes(): Promise<{ archetypes: Array<{ key: string; name: string; description: string }> }> {
  return request('/archetypes');
}

export async function getMetrics(): Promise<{ metrics: Array<{ key: string; name: string; description: string }> }> {
  return request('/metrics');
}

// Personas
export async function getPersonas(): Promise<{ personas: Array<{ key: string; name: string; description: string; tone: string }> }> {
  return request('/personas');
}

// Adoption - persist decision to agent memory
import type { AdoptedEvent } from '../types/simulation';

export async function adoptProposal(sessionId: string, event: AdoptedEvent): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/ai/adopt', {
    method: 'POST',
    body: JSON.stringify({
      session_id: sessionId,
      adopted_event: event,
    }),
  });
}

// Direct Messages (agent-to-agent conversations)
export interface DMRequest {
  session_id: string;
  from_agent_key: string;
  to_agent_key: string;
  message: string;
  proposal_title?: string;
}

export interface StanceUpdate {
  relationship_delta: number;
  stance_changed: boolean;
  new_stance: string | null;
  new_intensity: number | null;
  reason: string;
}

export interface DMResponse {
  reply: string;
  stance_update: StanceUpdate;
  relationship_score: number;
}

export async function sendDM(dmRequest: DMRequest): Promise<DMResponse> {
  return request<DMResponse>('/ai/dm', {
    method: 'POST',
    body: JSON.stringify(dmRequest),
  });
}

// Relationships
export interface RelationshipEdge {
  from: string;
  to: string;
  score: number;
  reason?: string;
}

export interface RelationshipsResponse {
  session_id: string;
  edges: RelationshipEdge[];
}

export async function getRelationships(sessionId: string): Promise<RelationshipsResponse> {
  return request<RelationshipsResponse>(`/ai/relationships/${sessionId}`);
}

// =============================================================================
// Agent Overrides
// =============================================================================

export interface AgentOverrideData {
  agent_key: string;
  model: string | null;
  archetype_override: string | null;
  default_model: string;
  is_edited: boolean;
}

export interface AgentOverridesResponse {
  scenario_id: string;
  overrides: Record<string, AgentOverrideData>;
  available_models: string[];
}

export async function getAgentOverrides(scenarioId: string): Promise<AgentOverridesResponse> {
  return request<AgentOverridesResponse>(`/scenario/${scenarioId}/agent-overrides`);
}

export interface AgentOverrideUpdate {
  model?: string | null;
  archetype_override?: string | null;
}

export async function updateAgentOverride(
  scenarioId: string, 
  agentKey: string, 
  update: AgentOverrideUpdate
): Promise<AgentOverrideData> {
  return request<AgentOverrideData>(`/scenario/${scenarioId}/agents/${agentKey}`, {
    method: 'PUT',
    body: JSON.stringify(update),
  });
}

export async function resetAgentOverride(
  scenarioId: string, 
  agentKey: string
): Promise<AgentOverrideData> {
  return request<AgentOverrideData>(`/scenario/${scenarioId}/agents/${agentKey}/reset`, {
    method: 'POST',
  });
}

export async function resetAllAgentOverrides(scenarioId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/scenario/${scenarioId}/agents/reset-all`, {
    method: 'POST',
  });
}

// =============================================================================
// Cache / Promotion
// =============================================================================

export interface CacheCheckResponse {
  hit: boolean;
  cache_key: string;
  result?: Record<string, unknown>;
  provider_mix?: string;
  created_at?: string;
}

export async function checkCache(cacheKey: string): Promise<CacheCheckResponse> {
  return request<CacheCheckResponse>(`/cache/${cacheKey}`);
}

export interface PromoteRequest {
  scenario_id: string;
  proposal: Record<string, unknown>;
  session_id: string;
  agent_overrides?: Record<string, { model?: string; archetype?: string }>;
  sim_mode?: 'progressive' | 'fast';
  world_state?: Record<string, unknown>;
}

export interface PromoteResponse {
  cached: boolean;
  cache_key: string;
  result: Record<string, unknown>;
  provider_mix: string;
  message: string;
}

export async function promoteWithCache(request: PromoteRequest): Promise<PromoteResponse> {
  return request<PromoteResponse>('/cache/promote', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function invalidateCache(scenarioId: string, agentKey?: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/cache/invalidate', {
    method: 'POST',
    body: JSON.stringify({
      scenario_id: scenarioId,
      agent_key: agentKey,
    }),
  });
}

export interface CacheKeyInputs {
  scenario_id: string;
  proposal_hash: string;
  agent_models?: Record<string, string>;
  archetype_overrides?: Record<string, string>;
  sim_mode?: string;
}

export async function computeCacheKey(inputs: CacheKeyInputs): Promise<{ cache_key: string }> {
  return request<{ cache_key: string }>('/cache/compute-key', {
    method: 'POST',
    body: JSON.stringify(inputs),
  });
}

// =============================================================================
// LLM Stats
// =============================================================================

export interface ProviderStats {
  avg_latency_ms: number;
  p95_latency_ms: number;
  call_count: number;
  min_latency_ms: number;
  max_latency_ms: number;
}

export interface LLMStatsResponse {
  provider_stats: Record<string, ProviderStats>;
  total_calls: number;
  cache_hits: number;
  cache_hit_rate_pct: number;
  allowed_models: string[];
  default_model: string;
}

export async function getLLMStats(): Promise<LLMStatsResponse> {
  return request<LLMStatsResponse>('/llm-stats');
}

export { ApiError };

