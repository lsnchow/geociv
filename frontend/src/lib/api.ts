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

export { ApiError };

