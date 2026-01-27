import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { 
  Proposal, 
  SpatialProposal,
  SimulationResult, 
  Scenario, 
  HistoryEntry,
  ProposalCard,
  SpatialProposalType,
  CitywideProposalType
} from '../types';
import type { SimulationResponse, ZoneSentiment, AgentReaction, TownHallTranscript, AdoptedEvent, InterpretedProposal, ProposalFeedItem, ProposalSource } from '../types/simulation';
import type { GraphNode, GraphEdge, GraphFilters } from '../components/graph/graphTypes';
import * as api from '../lib/api';

// Relationship edge for visualization
export interface RelationshipEdge {
  from: string;
  to: string;
  score: number;
  reason?: string;
}

// World state summary for agent context
export interface WorldStateSummary {
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
}

// Emoji lookup for spatial types
const SPATIAL_TYPE_EMOJI: Record<string, string> = {
  park: '🌳',
  upzone: '🏗️',
  housing_development: '🏠',
  transit_line: '🚌',
  bike_lane: '🚴',
  commercial_development: '🏪',
  community_center: '🏛️',
  factory: '🏭',
};

// Progressive simulation job state
export interface SimulationJob {
  jobId: string | null;
  status: 'idle' | 'pending' | 'running' | 'complete' | 'error';
  progress: number;  // 0-100
  phase: string;
  message: string;
  completedAgents: number;
  totalAgents: number;
  partialReactions: AgentReaction[];
  partialZones: ZoneSentiment[];
  error: string | null;
  result: unknown | null;  // Final simulation result
}

interface CivicState {
  // Scenario
  scenario: Scenario | null;
  scenarios: Array<{ id: string; name: string; description?: string; cluster_count: number; total_population: number; created_at: string }>;
  loadingScenario: boolean;
  
  // Current proposal being edited/placed
  activeProposal: Proposal | null;
  proposalPosition: { lat: number; lng: number } | null;
  isDragging: boolean;
  draggedCard: ProposalCard | null;
  
  // Placed items (committed placements that persist)
  placedItems: Array<{ id: string; proposal: SpatialProposal; position: { lat: number; lng: number } }>;
  selectedPlacedItemId: string | null;  // Currently selected placed item for highlighting/deletion
  
  // World state version (incremented on changes)
  worldStateVersion: number;
  
  // Simulation
  simulationResult: SimulationResult | null;
  isSimulating: boolean;
  autoSimulate: boolean;
  
  // Progressive simulation job
  simulationJob: SimulationJob;
  
  // Multi-agent simulation
  agentSimulation: SimulationResponse | null;
  zoneSentiments: ZoneSentiment[];
  agentReactions: AgentReaction[];
  townHall: TownHallTranscript | null;
  selectedZoneId: string | null;
  
  // Speaking as agent mode + DM targeting
  speakingAsAgent: { key: string; name: string; avatar: string } | null;
  targetAgent: { key: string; name: string } | 'all' | null;
  relationships: RelationshipEdge[];
  isSendingDM: boolean;
  
  // Session ID for thread continuity (initialized once per app load)
  sessionId: string;
  
  // Adopted proposals (persistent policies)
  adoptedProposals: AdoptedEvent[];
  isAdopting: boolean;
  adoptionError: string | null;  // Error message from last failed adoption
  
  // Proposal feed (all proposals with approval data - ephemeral)
  proposalFeed: ProposalFeedItem[];
  
  // History
  history: HistoryEntry[];
  selectedHistoryId: string | null;
  
  // Agent Overrides (per-agent model/archetype customization)
  agentOverrides: Record<string, { model?: string; archetype_override?: string; is_edited: boolean }>;
  availableModels: string[];
  defaultModel: string;
  loadingOverrides: boolean;
  
  // Cache State
  cacheStatus: 'idle' | 'checking' | 'hit' | 'miss' | 'running';
  lastCacheKey: string | null;
  lastCacheResult: Record<string, unknown> | null;
  providerMix: string | null;
  
  // Chat model override (per-message)
  chatModelOverride: string | null;  // null = use per-agent settings ("Auto")
  
  // Graph State (for force-directed visualization)
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  graphFilters: GraphFilters | null;
  graphPollingActive: boolean;
  
  // Simulation Progress (for graph visualization)
  simulationProgress: { phase: string; completedAgents: number; totalAgents: number } | null;
  
  // UI State
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  showChat: boolean;
  
  // Actions
  setScenario: (scenario: Scenario | null) => void;
  loadScenarios: () => Promise<void>;
  loadScenario: (id: string) => Promise<void>;
  seedKingston: () => Promise<void>;
  
  setActiveProposal: (proposal: Proposal | null) => void;
  updateActiveProposal: (updates: Partial<Proposal>) => void;
  setProposalPosition: (pos: { lat: number; lng: number } | null) => void;
  setIsDragging: (dragging: boolean) => void;
  setDraggedCard: (card: ProposalCard | null) => void;
  
  // Placed items actions
  commitPlacement: () => void;  // Move activeProposal to placedItems
  removePlacedItem: (id: string) => void;
  setSelectedPlacedItemId: (id: string | null) => void;
  
  // World state
  buildWorldStateSummary: () => WorldStateSummary;
  
  runSimulation: () => Promise<void>;
  setAutoSimulate: (auto: boolean) => void;
  
  // Progressive simulation actions
  startProgressiveSimulation: (message: string, scenarioId: string, options?: {
    buildProposal?: Record<string, unknown>;
    worldState?: WorldStateSummary;
    speakerMode?: string;
    speakerAgentKey?: string;
  }) => Promise<void>;
  pollSimulationStatus: (jobId: string) => Promise<void>;
  cancelSimulation: () => void;
  updateSimulationJob: (updates: Partial<SimulationJob>) => void;
  
  addToHistory: (entry: HistoryEntry) => void;
  restoreFromHistory: (id: string) => void;
  clearHistory: () => void;
  
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  toggleChat: () => void;
  
  // Multi-agent actions
  setAgentSimulation: (response: SimulationResponse | null) => void;
  setSelectedZoneId: (zoneId: string | null) => void;
  clearAgentSimulation: () => void;
  setSpeakingAsAgent: (agent: { key: string; name: string; avatar: string } | null) => void;
  
  // DM actions
  setTargetAgent: (target: { key: string; name: string } | 'all' | null) => void;
  sendDM: (sessionId: string, message: string, proposalTitle?: string) => Promise<void>;
  updateAgentReaction: (agentKey: string, updates: Partial<AgentReaction>) => void;
  loadRelationships: (sessionId: string) => Promise<void>;
  exitDMMode: () => void;
  
  // Adoption actions (promoteToPolicy is the new primary action)
  adoptProposal: (proposal: InterpretedProposal, reactions: AgentReaction[], sessionId: string, originProposalId?: string) => Promise<void>;
  forceForwardProposal: (proposal: InterpretedProposal, reactions: AgentReaction[], sessionId: string, originProposalId?: string) => Promise<void>;
  promoteToPolicy: (proposalId: string) => Promise<void>;  // Idempotent by origin_proposal_id
  forcePolicy: (proposalId: string) => Promise<void>;  // Admin force via origin_proposal_id
  clearAdoptionError: () => void;  // Dismiss error banner
  
  // Proposal feed actions
  addToProposalFeed: (item: Omit<ProposalFeedItem, 'is_promoted'>) => void;
  isProposalPromoted: (proposalId: string) => boolean;
  
  // Simulate All action
  simulateAll: (framingQuestion?: string) => Promise<void>;
  
  // Agent Override actions
  loadAgentOverrides: (scenarioId: string) => Promise<void>;
  updateAgentOverride: (agentKey: string, update: { model?: string | null; archetype_override?: string | null }) => Promise<void>;
  resetAgentOverride: (agentKey: string) => Promise<void>;
  resetAllAgentOverrides: () => Promise<void>;
  
  // Cache actions
  checkPromotionCache: (proposalHash: string) => Promise<boolean>;
  reloadFromCache: () => Promise<void>;
  
  // Chat model override
  setChatModelOverride: (model: string | null) => void;
  
  // Graph actions
  loadGraphData: (sessionId: string) => Promise<void>;
  pollActiveCalls: (sessionId: string) => Promise<void>;
  setGraphFilters: (filters: GraphFilters) => void;
}

// Default proposal values
const defaultSpatialProps = {
  radius_km: 0.5,
  scale: 1.0,
  includes_affordable_housing: false,
  includes_green_space: false,
  includes_transit_access: false,
};

const defaultCitywideProps = {
  amount: 50,
  percentage: 10,
  income_targeted: false,
};

export const useCivicStore = create<CivicState>()(
  persist(
    (set, get) => ({
      // Initial state
      scenario: null,
      scenarios: [],
      loadingScenario: false,
      
      activeProposal: null,
      proposalPosition: null,
      isDragging: false,
      draggedCard: null,
      placedItems: [],
      selectedPlacedItemId: null,
      worldStateVersion: 0,
      
      simulationResult: null,
      isSimulating: false,
      autoSimulate: true,
      
      // Progressive simulation job
      simulationJob: {
        jobId: null,
        status: 'idle',
        progress: 0,
        phase: '',
        message: '',
        completedAgents: 0,
        totalAgents: 0,
        partialReactions: [],
        partialZones: [],
        error: null,
        result: null,
      },
      
      // Multi-agent simulation
      agentSimulation: null,
      zoneSentiments: [],
      agentReactions: [],
      townHall: null,
      selectedZoneId: null,
      speakingAsAgent: null,
      targetAgent: null,
      relationships: [],
      isSendingDM: false,
      sessionId: crypto.randomUUID(),
      
      // Adopted proposals (persistent policies)
      adoptedProposals: [],
      isAdopting: false,
      adoptionError: null,
      
      // Proposal feed (ephemeral results)
      proposalFeed: [],
      
      history: [],
      selectedHistoryId: null,
      
      // Agent Overrides
      agentOverrides: {},
      availableModels: ['amazon/nova-micro-v1', 'anthropic/claude-3-haiku', 'gemini-2.0-flash-lite-001'],
      defaultModel: 'amazon/nova-micro-v1',
      loadingOverrides: false,
      
      // Cache State
      cacheStatus: 'idle',
      lastCacheKey: null,
      lastCacheResult: null,
      providerMix: null,
      
      // Chat model override
      chatModelOverride: null,
      
      // Graph State
      graphNodes: [],
      graphEdges: [],
      graphFilters: null,
      graphPollingActive: false,
      
      // Simulation Progress
      simulationProgress: null,
      
      leftPanelOpen: true,
      rightPanelOpen: true,
      showChat: false,
      
      // Actions
      setScenario: (scenario) => set({ scenario }),
      
      loadScenarios: async () => {
        try {
          const scenarios = await api.listScenarios();
          set({ scenarios });
        } catch (error) {
          console.error('Failed to load scenarios:', error);
        }
      },
      
      loadScenario: async (id) => {
        set({ loadingScenario: true });
        try {
          const scenario = await api.getScenario(id);
          set({ scenario, loadingScenario: false });
        } catch (error) {
          console.error('Failed to load scenario:', error);
          set({ loadingScenario: false });
        }
      },
      
      seedKingston: async () => {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/36b22d3a-abef-4d8c-b3d9-d3a34145295b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store:seedKingston:start',message:'seedKingston called',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        set({ loadingScenario: true });
        try {
          const scenario = await api.seedKingstonScenario();
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/36b22d3a-abef-4d8c-b3d9-d3a34145295b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store:seedKingston:success',message:'seedKingston succeeded',data:{scenarioId:scenario?.id,scenarioName:scenario?.name},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          set({ scenario });
          get().loadScenarios();
        } catch (error: unknown) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/36b22d3a-abef-4d8c-b3d9-d3a34145295b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store:seedKingston:catch',message:'seedKingston error',data:{errorStatus:(error as api.ApiError)?.status,errorMsg:String(error)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          // 409 = scenario already exists, treat as success
          if ((error as api.ApiError).status === 409) {
            try {
              const scenarios = await api.listScenarios();
              const kingston = scenarios.find(s => s.name === 'Kingston, Ontario');
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/36b22d3a-abef-4d8c-b3d9-d3a34145295b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store:seedKingston:409fallback',message:'409 fallback',data:{foundKingston:!!kingston,kingstonId:kingston?.id},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
              // #endregion
              if (kingston) {
                await get().loadScenario(kingston.id);
              }
            } catch (innerError) {
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/36b22d3a-abef-4d8c-b3d9-d3a34145295b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store:seedKingston:409innerError',message:'409 inner fallback failed',data:{innerError:String(innerError)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
              // #endregion
              console.error('Failed in 409 fallback:', innerError);
            }
          } else {
            console.error('Failed to seed Kingston:', error);
          }
        } finally {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/36b22d3a-abef-4d8c-b3d9-d3a34145295b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store:seedKingston:finally',message:'seedKingston finally',data:{scenarioAfter:!!get().scenario},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          // Always reset loading state
          set({ loadingScenario: false });
        }
      },
      
      setActiveProposal: (proposal) => set({ activeProposal: proposal }),
      
      updateActiveProposal: (updates) => {
        const { activeProposal } = get();
        if (activeProposal) {
          set({ activeProposal: { ...activeProposal, ...updates } as Proposal });
          // Auto-simulate if enabled
          if (get().autoSimulate && get().scenario) {
            get().runSimulation();
          }
        }
      },
      
      setProposalPosition: (pos) => {
        set({ proposalPosition: pos });
        const { activeProposal, autoSimulate, scenario } = get();
        if (activeProposal && activeProposal.type === 'spatial' && pos) {
          set({
            activeProposal: {
              ...activeProposal,
              latitude: pos.lat,
              longitude: pos.lng,
            } as SpatialProposal,
          });
          if (autoSimulate && scenario) {
            get().runSimulation();
          }
        }
      },
      
      setIsDragging: (dragging) => set({ isDragging: dragging }),
      setDraggedCard: (card) => set({ draggedCard: card }),
      
      // Commit current placement to placedItems array
      commitPlacement: () => {
        const { activeProposal, proposalPosition, placedItems, worldStateVersion } = get();
        console.log('[STORE] commitPlacement called:', { 
          hasActiveProposal: !!activeProposal, 
          type: activeProposal?.type,
          hasPosition: !!proposalPosition,
          currentCount: placedItems.length 
        });
        
        if (activeProposal && activeProposal.type === 'spatial' && proposalPosition) {
          const newItem = {
            id: `placed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            proposal: activeProposal as SpatialProposal,
            position: proposalPosition,
          };
          const newPlacedItems = [...placedItems, newItem];
          console.log('[STORE] Adding item:', newItem.id, 'New count:', newPlacedItems.length);
          
          set({
            placedItems: newPlacedItems,
            worldStateVersion: worldStateVersion + 1,
            // Clear current placement after committing
            activeProposal: null,
            proposalPosition: null,
          });
        } else {
          console.warn('[STORE] commitPlacement skipped - conditions not met');
        }
      },
      
      removePlacedItem: (id) => {
        const { placedItems, selectedPlacedItemId, worldStateVersion } = get();
        console.log('[STORE] removePlacedItem called:', id, 'Current count:', placedItems.length);
        const newItems = placedItems.filter(item => item.id !== id);
        console.log('[STORE] After removal:', newItems.length);
        // Clear selection if the deleted item was selected
        const newSelection = selectedPlacedItemId === id ? null : selectedPlacedItemId;
        set({ placedItems: newItems, selectedPlacedItemId: newSelection, worldStateVersion: worldStateVersion + 1 });
      },
      
      setSelectedPlacedItemId: (id) => set({ selectedPlacedItemId: id }),
      
      // Build world state summary for agent context
      buildWorldStateSummary: () => {
        const { placedItems, adoptedProposals, relationships, worldStateVersion } = get();
        
        // Map placed items
        const placed_items = placedItems.map(item => ({
          id: item.id,
          type: item.proposal.spatial_type,
          title: item.proposal.title,
          region_id: item.proposal.containing_zone?.id,
          region_name: item.proposal.containing_zone?.name,
          radius_km: item.proposal.radius_km || 0.5,
          emoji: SPATIAL_TYPE_EMOJI[item.proposal.spatial_type] || '📍',
        }));
        
        // Map adopted policies
        const adopted_policies = adoptedProposals.map(event => ({
          id: event.id,
          title: event.proposal.title,
          summary: event.proposal.summary,
          outcome: event.outcome,
          vote_pct: event.vote_summary.agreement_pct,
          timestamp: event.timestamp,
        }));
        
        // Get top 3 relationship shifts (non-zero scores)
        const top_relationship_shifts = relationships
          .filter(r => Math.abs(r.score) > 0.1)
          .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
          .slice(0, 3)
          .map(r => ({
            from_agent: r.from,
            to_agent: r.to,
            score: r.score,
            reason: r.reason || '',
          }));
        
        return {
          version: worldStateVersion,
          placed_items,
          adopted_policies,
          top_relationship_shifts,
        };
      },
      
      runSimulation: async () => {
        const { scenario, activeProposal } = get();
        if (!scenario || !activeProposal) return;
        
        // Validate spatial proposals have coordinates
        if (activeProposal.type === 'spatial' && (!activeProposal.latitude || !activeProposal.longitude)) {
          return;
        }
        
        set({ isSimulating: true });
        try {
          const result = await api.simulate({
            scenario_id: scenario.id,
            proposal: activeProposal,
            include_narrative: true,
          });
          set({ simulationResult: result, isSimulating: false });
          
          // Add to history
          const historyEntry: HistoryEntry = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            scenario_id: scenario.id,
            scenario_name: scenario.name,
            proposal: activeProposal,
            result,
          };
          get().addToHistory(historyEntry);
        } catch (error) {
          console.error('Simulation failed:', error);
          set({ isSimulating: false });
        }
      },
      
      setAutoSimulate: (auto) => set({ autoSimulate: auto }),
      
      // Progressive simulation actions
      startProgressiveSimulation: async (message, scenarioId, options = {}) => {
        const apiBase = (import.meta.env.VITE_API_URL || 'http://localhost:8000/v1')
          .replace(/\/$/, '');
        const AI_BASE = `${apiBase}/ai`;
        
        // Reset simulation job state
        set({
          isSimulating: true,
          simulationJob: {
            jobId: null,
            status: 'pending',
            progress: 0,
            phase: 'initializing',
            message: 'Starting simulation...',
            completedAgents: 0,
            totalAgents: 0,
            partialReactions: [],
            partialZones: [],
            error: null,
          },
          // Clear previous results
          agentSimulation: null,
          zoneSentiments: [],
          agentReactions: [],
          townHall: null,
        });
        
        try {
          const response = await fetch(`${AI_BASE}/simulate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message,
              scenario_id: scenarioId,
              session_id: get().sessionId,
              build_proposal: options.buildProposal,
              world_state: options.worldState,
              speaker_mode: options.speakerMode || 'user',
              speaker_agent_key: options.speakerAgentKey,
            }),
          });
          
          if (!response.ok) {
            const error = await response.text();
            throw new Error(error || 'Failed to start simulation');
          }
          
          const data = await response.json();
          const jobId = data.job_id;
          
          set((state) => ({
            simulationJob: {
              ...state.simulationJob,
              jobId,
              status: 'pending',
              message: 'Simulation queued...',
            },
          }));
          
          // Start polling
          get().pollSimulationStatus(jobId);
          
        } catch (error) {
          console.error('[SIM] Start failed:', error);
          set({
            isSimulating: false,
            simulationJob: {
              ...get().simulationJob,
              status: 'error',
              error: error instanceof Error ? error.message : 'Failed to start simulation',
            },
          });
        }
      },
      
      pollSimulationStatus: async (jobId) => {
        const apiBase = (import.meta.env.VITE_API_URL || 'http://localhost:8000/v1')
          .replace(/\/$/, '');
        const AI_BASE = `${apiBase}/ai`;
        const POLL_INTERVAL = 1500; // 1.5 seconds
        
        const poll = async () => {
          try {
            const response = await fetch(`${AI_BASE}/simulate/${jobId}`);
            
            if (!response.ok) {
              if (response.status === 404) {
                throw new Error('Simulation job not found');
              }
              throw new Error('Failed to poll simulation status');
            }
            
            const data = await response.json();
            
            // Update simulation job state
            set((state) => ({
              simulationJob: {
                ...state.simulationJob,
                status: data.status,
                progress: data.progress,
                phase: data.phase,
                message: data.message,
                completedAgents: data.completed_agents || 0,
                totalAgents: data.total_agents || 0,
                partialReactions: data.partial_reactions || state.simulationJob.partialReactions,
                partialZones: data.partial_zones || state.simulationJob.partialZones,
              },
              // Update partial zone sentiments for real-time map coloring
              zoneSentiments: data.partial_zones?.length 
                ? data.partial_zones.map((z: Record<string, unknown>) => ({
                    zone_id: z.zone_id,
                    zone_name: z.zone_name,
                    sentiment: z.sentiment,
                    dominant_stance: z.dominant_stance,
                  }))
                : state.zoneSentiments,
              // Update partial reactions for real-time agent display
              agentReactions: data.partial_reactions?.length
                ? data.partial_reactions
                : state.agentReactions,
            }));
            
            // Check terminal states
            if (data.status === 'complete') {
              // Simulation complete - update with full results
              const result = data.result;
              if (result) {
                set({
                  isSimulating: false,
                  agentSimulation: result,
                  zoneSentiments: result.zones || [],
                  agentReactions: result.reactions || [],
                  townHall: result.town_hall || null,
                  simulationJob: {
                    ...get().simulationJob,
                    status: 'complete',
                    progress: 100,
                    phase: 'complete',
                    message: 'Simulation complete',
                    result: result,
                  },
                });
              }
              return; // Stop polling
            }
            
            if (data.status === 'error') {
              set({
                isSimulating: false,
                simulationJob: {
                  ...get().simulationJob,
                  status: 'error',
                  error: data.error || 'Simulation failed',
                },
              });
              return; // Stop polling
            }
            
            // Continue polling if still running
            if (data.status === 'pending' || data.status === 'running') {
              setTimeout(poll, POLL_INTERVAL);
            }
            
          } catch (error) {
            console.error('[SIM] Poll error:', error);
            set({
              isSimulating: false,
              simulationJob: {
                ...get().simulationJob,
                status: 'error',
                error: error instanceof Error ? error.message : 'Poll failed',
              },
            });
          }
        };
        
        // Start polling
        poll();
      },
      
      cancelSimulation: () => {
        // Cancel current simulation (client-side only for now)
        set({
          isSimulating: false,
          simulationJob: {
            jobId: null,
            status: 'idle',
            progress: 0,
            phase: '',
            message: '',
            completedAgents: 0,
            totalAgents: 0,
            partialReactions: [],
            partialZones: [],
            error: null,
          },
        });
      },
      
      updateSimulationJob: (updates) => {
        set((state) => ({
          simulationJob: { ...state.simulationJob, ...updates },
        }));
      },
      
      addToHistory: (entry) => {
        const { history } = get();
        // Keep last 50 entries
        const newHistory = [entry, ...history].slice(0, 50);
        set({ history: newHistory, selectedHistoryId: entry.id });
      },
      
      restoreFromHistory: (id) => {
        const { history } = get();
        const entry = history.find(h => h.id === id);
        if (entry) {
          set({
            activeProposal: entry.proposal,
            simulationResult: entry.result,
            selectedHistoryId: id,
            proposalPosition: entry.proposal.type === 'spatial' 
              ? { lat: entry.proposal.latitude, lng: entry.proposal.longitude }
              : null,
          });
        }
      },
      
      clearHistory: () => set({ history: [], selectedHistoryId: null }),
      
      toggleLeftPanel: () => set(s => ({ leftPanelOpen: !s.leftPanelOpen })),
      toggleRightPanel: () => set(s => ({ rightPanelOpen: !s.rightPanelOpen })),
      toggleChat: () => set(s => ({ showChat: !s.showChat })),
      
      // Multi-agent actions
      setAgentSimulation: (response) => {
        if (response) {
          set({
            agentSimulation: response,
            zoneSentiments: response.zones || [],
            agentReactions: response.reactions || [],
            townHall: response.town_hall || null,
          });
          
          // Add to proposal feed if we have a proposal and reactions
          if (response.proposal && response.reactions.length > 0) {
            const reactions = response.reactions;
            const support = reactions.filter(r => r.stance === 'support').length;
            const oppose = reactions.filter(r => r.stance === 'oppose').length;
            const neutral = reactions.filter(r => r.stance === 'neutral').length;
            const totalVotes = support + oppose;
            const agreementPct = totalVotes > 0 ? Math.round((support / totalVotes) * 100) : 0;
            
            // Determine source based on context
            const source: ProposalSource = response.town_hall ? 'townhall' : 'general_chat';
            
            const feedItem: Omit<ProposalFeedItem, 'is_promoted'> = {
              id: `proposal_${response.thread_id}_${Date.now()}`,
              timestamp: new Date().toISOString(),
              source,
              proposal: response.proposal,
              reactions,
              vote_summary: { support, oppose, neutral, agreement_pct: agreementPct },
              can_promote: agreementPct >= 50,
            };
            
            get().addToProposalFeed(feedItem);
          }
        } else {
          set({
            agentSimulation: null,
            zoneSentiments: [],
            agentReactions: [],
            townHall: null,
          });
        }
      },
      
      setSelectedZoneId: (zoneId) => set({ selectedZoneId: zoneId }),
      
      setSpeakingAsAgent: (agent) => set({ speakingAsAgent: agent }),
      
      // DM actions
      setTargetAgent: (target) => set({ targetAgent: target }),
      
      sendDM: async (sessionId, message, proposalTitle) => {
        const { speakingAsAgent, targetAgent, agentReactions } = get();
        if (!speakingAsAgent || !targetAgent || targetAgent === 'all') {
          console.error('sendDM requires speakingAsAgent and a specific targetAgent');
          return;
        }
        
        set({ isSendingDM: true });
        try {
          const response = await api.sendDM({
            session_id: sessionId,
            from_agent_key: speakingAsAgent.key,
            to_agent_key: targetAgent.key,
            message,
            proposal_title: proposalTitle,
          });
          
          // If stance changed, update the reaction
          if (response.stance_update.stance_changed && response.stance_update.new_stance) {
            const updatedReactions = agentReactions.map(r => {
              if (r.agent_key === targetAgent.key) {
                return {
                  ...r,
                  stance: response.stance_update.new_stance as 'support' | 'oppose' | 'neutral',
                  intensity: response.stance_update.new_intensity ?? r.intensity,
                  quote: `After talking with ${speakingAsAgent.name}: "${response.stance_update.reason}"`,
                };
              }
              return r;
            });
            set({ agentReactions: updatedReactions });
          }
          
          // Update relationships
          get().loadRelationships(sessionId);
          
          set({ isSendingDM: false });
        } catch (error) {
          console.error('Failed to send DM:', error);
          set({ isSendingDM: false });
          throw error;
        }
      },
      
      updateAgentReaction: (agentKey, updates) => {
        set(state => {
          // Update agent reactions
          const updatedReactions = state.agentReactions.map(r =>
            r.agent_key === agentKey ? { ...r, ...updates } : r
          );
          
          // If stance changed, also update zoneSentiments (agent_key == zone_id)
          let updatedZoneSentiments = state.zoneSentiments;
          if (updates.stance !== undefined || updates.intensity !== undefined) {
            updatedZoneSentiments = state.zoneSentiments.map(z => {
              if (z.zone_id === agentKey) {
                const newStance = updates.stance ?? state.agentReactions.find(r => r.agent_key === agentKey)?.stance ?? z.sentiment;
                const newIntensity = updates.intensity ?? state.agentReactions.find(r => r.agent_key === agentKey)?.intensity ?? Math.abs(z.score);
                // Convert stance + intensity to score (-1 to +1)
                const newScore = newStance === 'support' ? newIntensity : newStance === 'oppose' ? -newIntensity : 0;
                return { ...z, sentiment: newStance, score: newScore };
              }
              return z;
            });
          }
          
          return {
            agentReactions: updatedReactions,
            zoneSentiments: updatedZoneSentiments,
          };
        });
      },
      
      loadRelationships: async (sessionId) => {
        try {
          const response = await api.getRelationships(sessionId);
          set({ relationships: response.edges || [] });
        } catch (error) {
          console.warn('Failed to load relationships:', error);
        }
      },
      
      exitDMMode: () => set({
        speakingAsAgent: null,
        targetAgent: null,
      }),
      
      clearAgentSimulation: () => set({
        agentSimulation: null,
        zoneSentiments: [],
        agentReactions: [],
        townHall: null,
        selectedZoneId: null,
        speakingAsAgent: null,
        targetAgent: null,
        relationships: [],
        isSendingDM: false,
      }),
      
      // Proposal feed actions
      addToProposalFeed: (item) => {
        const { adoptedProposals, proposalFeed } = get();
        // Check if already promoted (idempotent)
        const isPromoted = adoptedProposals.some(p => p.origin_proposal_id === item.id);
        // Check if already in feed
        const existsInFeed = proposalFeed.some(p => p.id === item.id);
        if (existsInFeed) {
          // Update existing entry
          set(state => ({
            proposalFeed: state.proposalFeed.map(p => 
              p.id === item.id ? { ...item, is_promoted: isPromoted } : p
            ),
          }));
        } else {
          // Add new entry
          set(state => ({
            proposalFeed: [{ ...item, is_promoted: isPromoted }, ...state.proposalFeed],
          }));
        }
      },
      
      isProposalPromoted: (proposalId) => {
        const { adoptedProposals } = get();
        return adoptedProposals.some(p => p.origin_proposal_id === proposalId);
      },
      
      // Adoption actions
      adoptProposal: async (proposal, reactions, sessionId, originProposalId) => {
        set({ isAdopting: true });
        try {
          // Calculate vote tally
          const support = reactions.filter(r => r.stance === 'support').length;
          const oppose = reactions.filter(r => r.stance === 'oppose').length;
          const neutral = reactions.filter(r => r.stance === 'neutral').length;
          const totalVotes = support + oppose;
          const agreementPct = totalVotes > 0 ? Math.round((support / totalVotes) * 100) : 0;
          
          // Select 2-4 key quotes (prioritize strong stances)
          const keyQuotes = reactions
            .filter(r => r.stance !== 'neutral')
            .slice(0, 4)
            .map(r => ({
              agent_name: r.agent_name,
              stance: r.stance,
              quote: r.quote,
            }));
          
          // Get zone deltas from zoneSentiments
          const { zoneSentiments } = get();
          const zoneDeltas = zoneSentiments.slice(0, 3).map(z => ({
            zone_id: z.zone_id,
            zone_name: z.zone_name,
            sentiment_shift: z.sentiment === 'support' ? 0.5 : z.sentiment === 'oppose' ? -0.5 : 0,
          }));
          
          // Generate origin proposal ID if not provided
          const effectiveOriginId = originProposalId || `proposal_${Date.now()}`;
          
          // Check idempotency - don't adopt if already adopted
          const { adoptedProposals } = get();
          if (adoptedProposals.some(p => p.origin_proposal_id === effectiveOriginId)) {
            console.warn('[STORE] Proposal already promoted, skipping:', effectiveOriginId);
            set({ isAdopting: false });
            return;
          }
          
          // Create adopted event
          const adoptedEvent: AdoptedEvent = {
            id: `adopted_${Date.now()}`,
            timestamp: new Date().toISOString(),
            session_id: sessionId,
            proposal,
            outcome: 'adopted',
            origin_proposal_id: effectiveOriginId,
            vote_summary: { support, oppose, neutral, agreement_pct: agreementPct },
            key_quotes: keyQuotes,
            zone_deltas: zoneDeltas,
          };
          
          // Call backend to persist in agent threads
          await api.adoptProposal(sessionId, adoptedEvent);
          
          // Add to local state and increment world state version
          set(state => ({
            adoptedProposals: [...state.adoptedProposals, adoptedEvent],
            // Mark as promoted in proposalFeed
            proposalFeed: state.proposalFeed.map(p =>
              p.id === effectiveOriginId ? { ...p, is_promoted: true } : p
            ),
            worldStateVersion: state.worldStateVersion + 1,
            isAdopting: false,
            adoptionError: null,  // Clear any previous error
          }));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to promote policy';
          console.error('Failed to adopt proposal:', error);
          set({ isAdopting: false, adoptionError: errorMessage });
          // Don't rethrow - error is captured in state for UI display
        }
      },
      
      forceForwardProposal: async (proposal, reactions, sessionId, originProposalId) => {
        set({ isAdopting: true });
        try {
          // Calculate vote tally
          const support = reactions.filter(r => r.stance === 'support').length;
          const oppose = reactions.filter(r => r.stance === 'oppose').length;
          const neutral = reactions.filter(r => r.stance === 'neutral').length;
          const totalVotes = support + oppose;
          const agreementPct = totalVotes > 0 ? Math.round((support / totalVotes) * 100) : 0;
          
          // Select 2-4 key quotes
          const keyQuotes = reactions
            .filter(r => r.stance !== 'neutral')
            .slice(0, 4)
            .map(r => ({
              agent_name: r.agent_name,
              stance: r.stance,
              quote: r.quote,
            }));
          
          // Get zone deltas
          const { zoneSentiments } = get();
          const zoneDeltas = zoneSentiments.slice(0, 3).map(z => ({
            zone_id: z.zone_id,
            zone_name: z.zone_name,
            sentiment_shift: z.sentiment === 'support' ? 0.5 : z.sentiment === 'oppose' ? -0.5 : 0,
          }));
          
          // Generate origin proposal ID if not provided
          const effectiveOriginId = originProposalId || `proposal_${Date.now()}`;
          
          // Check idempotency - don't adopt if already adopted
          const { adoptedProposals } = get();
          if (adoptedProposals.some(p => p.origin_proposal_id === effectiveOriginId)) {
            console.warn('[STORE] Proposal already promoted, skipping:', effectiveOriginId);
            set({ isAdopting: false });
            return;
          }
          
          // Create adopted event (forced)
          const adoptedEvent: AdoptedEvent = {
            id: `adopted_${Date.now()}`,
            timestamp: new Date().toISOString(),
            session_id: sessionId,
            proposal,
            outcome: 'forced',
            origin_proposal_id: effectiveOriginId,
            vote_summary: { support, oppose, neutral, agreement_pct: agreementPct },
            key_quotes: keyQuotes,
            zone_deltas: zoneDeltas,
          };
          
          // Call backend to persist in agent threads
          await api.adoptProposal(sessionId, adoptedEvent);
          
          // Add to local state and increment world state version
          set(state => ({
            adoptedProposals: [...state.adoptedProposals, adoptedEvent],
            // Mark as promoted in proposalFeed
            proposalFeed: state.proposalFeed.map(p =>
              p.id === effectiveOriginId ? { ...p, is_promoted: true } : p
            ),
            worldStateVersion: state.worldStateVersion + 1,
            isAdopting: false,
            adoptionError: null,  // Clear any previous error
          }));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to force policy';
          console.error('Failed to force forward proposal:', error);
          set({ isAdopting: false, adoptionError: errorMessage });
          // Don't rethrow - error is captured in state for UI display
        }
      },
      
      // Promote to Policy - find in feed and adopt (convenience method)
      promoteToPolicy: async (proposalId) => {
        const { proposalFeed, adoptProposal, sessionId } = get();
        const feedItem = proposalFeed.find(p => p.id === proposalId);
        
        if (!feedItem) {
          console.error('[STORE] promoteToPolicy: Proposal not found in feed:', proposalId);
          return;
        }
        
        if (!feedItem.can_promote) {
          console.error('[STORE] promoteToPolicy: Proposal does not meet threshold:', proposalId);
          return;
        }
        
        if (feedItem.is_promoted) {
          console.warn('[STORE] promoteToPolicy: Already promoted:', proposalId);
          return;
        }
        
        await adoptProposal(feedItem.proposal, feedItem.reactions, sessionId, proposalId);
      },
      
      // Force Policy - find in feed and force adopt (admin override)
      forcePolicy: async (proposalId) => {
        const { proposalFeed, forceForwardProposal, sessionId } = get();
        const feedItem = proposalFeed.find(p => p.id === proposalId);
        
        if (!feedItem) {
          console.error('[STORE] forcePolicy: Proposal not found in feed:', proposalId);
          return;
        }
        
        if (feedItem.is_promoted) {
          console.warn('[STORE] forcePolicy: Already promoted:', proposalId);
          return;
        }
        
        await forceForwardProposal(feedItem.proposal, feedItem.reactions, sessionId, proposalId);
      },
      
      // Clear adoption error (dismiss banner)
      clearAdoptionError: () => {
        set({ adoptionError: null });
      },
      
      // Simulate All action - evaluates combined effects of all placed items
      simulateAll: async (framingQuestion?: string) => {
        const { scenario, placedItems, sessionId, buildWorldStateSummary, setAgentSimulation } = get();
        
        if (!scenario) {
          console.warn('[STORE] simulateAll: No scenario loaded');
          return;
        }
        
        if (placedItems.length === 0) {
          console.warn('[STORE] simulateAll: No placed items to simulate');
          return;
        }
        
        set({ isSimulating: true });
        
        try {
          // Build world state
          const worldState = buildWorldStateSummary();
          
          // Auto-generate evaluation prompt
          const itemDescriptions = placedItems.map(item => {
            const emoji = SPATIAL_TYPE_EMOJI[item.proposal.spatial_type] || '📍';
            const region = item.proposal.containing_zone?.name || 'unknown area';
            return `${emoji} ${item.proposal.title} in ${region}`;
          });
          
          let message = `Evaluate the combined effects of ${placedItems.length} placed buildings:\n${itemDescriptions.join('\n')}`;
          
          // Add optional framing question
          if (framingQuestion?.trim()) {
            message += `\n\nSpecific question: ${framingQuestion.trim()}`;
          }
          
          // Import ai-api dynamically to avoid circular deps
          const aiApi = await import('../lib/ai-api');
          
          const response = await aiApi.chat({
            message,
            scenario_id: scenario.id,
            session_id: sessionId,
            world_state: worldState,
          });
          
          setAgentSimulation(response);
          
        } catch (error) {
          console.error('[STORE] simulateAll failed:', error);
        } finally {
          set({ isSimulating: false });
        }
      },
      
      // Agent Override actions
      loadAgentOverrides: async (scenarioId: string) => {
        set({ loadingOverrides: true });
        try {
          const response = await api.getAgentOverrides(scenarioId);
          const overrides: Record<string, { model?: string; archetype_override?: string; is_edited: boolean }> = {};
          
          for (const [key, data] of Object.entries(response.overrides)) {
            overrides[key] = {
              model: data.model || undefined,
              archetype_override: data.archetype_override || undefined,
              is_edited: data.is_edited,
            };
          }
          
          set({
            agentOverrides: overrides,
            availableModels: response.available_models,
            loadingOverrides: false,
          });
        } catch (error) {
          console.error('[STORE] loadAgentOverrides failed:', error);
          set({ loadingOverrides: false });
        }
      },
      
      updateAgentOverride: async (agentKey: string, update: { model?: string | null; archetype_override?: string | null }) => {
        const { scenario } = get();
        if (!scenario) {
          console.warn('[STORE] updateAgentOverride: No scenario loaded');
          return;
        }
        
        try {
          const response = await api.updateAgentOverride(scenario.id, agentKey, update);
          
          set(state => ({
            agentOverrides: {
              ...state.agentOverrides,
              [agentKey]: {
                model: response.model || undefined,
                archetype_override: response.archetype_override || undefined,
                is_edited: response.is_edited,
              },
            },
            // Invalidate cache when override changes
            cacheStatus: 'idle',
            lastCacheKey: null,
            lastCacheResult: null,
          }));
        } catch (error) {
          console.error('[STORE] updateAgentOverride failed:', error);
        }
      },
      
      resetAgentOverride: async (agentKey: string) => {
        const { scenario } = get();
        if (!scenario) {
          console.warn('[STORE] resetAgentOverride: No scenario loaded');
          return;
        }
        
        try {
          const response = await api.resetAgentOverride(scenario.id, agentKey);
          
          set(state => ({
            agentOverrides: {
              ...state.agentOverrides,
              [agentKey]: {
                model: undefined,
                archetype_override: undefined,
                is_edited: false,
              },
            },
            // Invalidate cache
            cacheStatus: 'idle',
            lastCacheKey: null,
            lastCacheResult: null,
          }));
        } catch (error) {
          console.error('[STORE] resetAgentOverride failed:', error);
        }
      },
      
      resetAllAgentOverrides: async () => {
        const { scenario } = get();
        if (!scenario) {
          console.warn('[STORE] resetAllAgentOverrides: No scenario loaded');
          return;
        }
        
        try {
          await api.resetAllAgentOverrides(scenario.id);
          
          // Clear all overrides
          set({
            agentOverrides: {},
            cacheStatus: 'idle',
            lastCacheKey: null,
            lastCacheResult: null,
          });
        } catch (error) {
          console.error('[STORE] resetAllAgentOverrides failed:', error);
        }
      },
      
      // Cache actions
      checkPromotionCache: async (proposalHash: string) => {
        const { scenario, agentOverrides } = get();
        if (!scenario) return false;
        
        set({ cacheStatus: 'checking' });
        
        try {
          // Build agent models map from overrides
          const agentModels: Record<string, string> = {};
          for (const [key, override] of Object.entries(agentOverrides)) {
            if (override.model) {
              agentModels[key] = override.model;
            }
          }
          
          // Compute cache key
          const keyResponse = await api.computeCacheKey({
            scenario_id: scenario.id,
            proposal_hash: proposalHash,
            agent_models: agentModels,
            sim_mode: 'progressive',
          });
          
          // Check cache
          const cacheResponse = await api.checkCache(keyResponse.cache_key);
          
          if (cacheResponse.hit) {
            set({
              cacheStatus: 'hit',
              lastCacheKey: cacheResponse.cache_key,
              lastCacheResult: cacheResponse.result || null,
              providerMix: cacheResponse.provider_mix || null,
            });
            return true;
          } else {
            set({
              cacheStatus: 'miss',
              lastCacheKey: keyResponse.cache_key,
              lastCacheResult: null,
              providerMix: null,
            });
            return false;
          }
        } catch (error) {
          console.error('[STORE] checkPromotionCache failed:', error);
          set({ cacheStatus: 'idle' });
          return false;
        }
      },
      
      reloadFromCache: async () => {
        const { lastCacheKey } = get();
        if (!lastCacheKey) {
          console.warn('[STORE] reloadFromCache: No cache key');
          return;
        }
        
        try {
          const response = await api.checkCache(lastCacheKey);
          if (response.hit && response.result) {
            set({
              lastCacheResult: response.result,
              providerMix: response.provider_mix || null,
            });
          }
        } catch (error) {
          console.error('[STORE] reloadFromCache failed:', error);
        }
      },
      
      // Chat model override
      setChatModelOverride: (model: string | null) => {
        set({ chatModelOverride: model });
      },
      
      // Graph actions
      loadGraphData: async (sessionId: string) => {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/833df7df-b87b-44c1-befe-7231bf52dc09',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store:loadGraphData:start',message:'loadGraphData called',data:{sessionId},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'A-C'})}).catch(()=>{});
        // #endregion
        try {
          const response = await api.getGraphData(sessionId);
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/833df7df-b87b-44c1-befe-7231bf52dc09',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store:loadGraphData:response',message:'Graph data received',data:{sessionId,nodeCount:response.nodes?.length,edgeCount:response.edges?.length,firstEdge:response.edges?.[0]},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          
          // Transform API response to GraphNode/GraphEdge types
          const nodes: GraphNode[] = response.nodes.map((n: api.GraphNodeData) => ({
            id: n.id,
            type: n.type as 'agent' | 'townhall' | 'user' | 'system',
            name: n.name,
            avatar: n.avatar,
            role: n.role || '',
            model: n.model || null,
            archetypeStatus: (n.archetype_status || 'default') as 'default' | 'edited',
            callState: (n.call_state || 'idle') as 'idle' | 'pending' | 'running' | 'done' | 'error',
            stance: n.stance as 'support' | 'oppose' | 'neutral' | null,
          }));

          // Ensure special nodes exist for visualization
          const ensureNode = (id: string, type: 'user' | 'system' | 'townhall', name: string, role = '') => {
            if (!nodes.find(n => n.id === id)) {
              nodes.push({
                id,
                type,
                name,
                avatar: '',
                role,
                model: null,
                archetypeStatus: 'default',
                callState: 'idle',
                stance: null,
              });
            }
          };

          ensureNode('user', 'user', 'You');
          ensureNode('system', 'system', 'Backboard', 'LLM Router');
          ensureNode('townhall', 'townhall', 'Town Hall', 'Reducer');
          
          const edges: GraphEdge[] = response.edges.map((e: api.GraphEdgeData) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            type: e.type as 'dm' | 'call',
            lastMessage: e.last_message || null,
            stanceBefore: e.stance_before as 'support' | 'oppose' | 'neutral' | null,
            stanceAfter: e.stance_after as 'support' | 'oppose' | 'neutral' | null,
            timestamp: e.timestamp || null,
            status: (e.status || 'complete') as 'pending' | 'running' | 'complete' | 'error',
            score: e.score || 0,
          }));
          
          set({ graphNodes: nodes, graphEdges: edges });
        } catch (error) {
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/833df7df-b87b-44c1-befe-7231bf52dc09',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store:loadGraphData:error',message:'Graph data load failed',data:{sessionId,error:String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'A-C'})}).catch(()=>{});
          // #endregion
          console.error('[STORE] loadGraphData failed:', error);
        }
      },
      
      pollActiveCalls: async (sessionId: string) => {
        try {
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/833df7df-b87b-44c1-befe-7231bf52dc09',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store:pollActiveCalls:start',message:'pollActiveCalls called',data:{sessionId},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
          const response = await api.pollActiveCalls(sessionId);
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/833df7df-b87b-44c1-befe-7231bf52dc09',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store:pollActiveCalls:response',message:'Active calls response',data:{sessionId,activeCount:response.active_calls.length,recentCount:response.recently_completed.length,activeSample:response.active_calls[0]},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
          
          // Update node call states and add synthetic edges to visualize live calls
          set(state => {
            const updatedNodes = state.graphNodes.map(node => {
              const activeCall = response.active_calls.find(
                (c: api.ActiveCallData) => c.agent_key === node.id
              );
              const recentlyCompleted = response.recently_completed.find(
                (c: api.ActiveCallData) => c.agent_key === node.id
              );
              
              if (activeCall) {
                return { ...node, callState: (activeCall.status as 'pending' | 'running') || 'running' };
              } else if (recentlyCompleted) {
                return { ...node, callState: 'done' as const };
              }
              return { ...node, callState: 'idle' as const };
            });

            // Remove old synthetic edges
            const preservedEdges = state.graphEdges.filter(e => !e.synthetic);
            const now = new Date().toISOString();
            const syntheticEdges: GraphEdge[] = [];

            const buildEdge = (
              id: string,
              source: string,
              target: string,
              status: 'pending' | 'running' | 'complete' | 'error',
              timestamp: string | null,
            ): GraphEdge => ({
              id,
              source,
              target,
              type: 'call',
              lastMessage: null,
              stanceBefore: null,
              stanceAfter: null,
              timestamp: timestamp || now,
              status,
              score: 0,
              synthetic: true,
            });

            response.active_calls.forEach(call => {
              const status = (call.status as 'pending' | 'running') || 'running';
              syntheticEdges.push(buildEdge(`active-user-${call.agent_key}`, 'user', call.agent_key, status, call.started_at || null));
              syntheticEdges.push(buildEdge(`active-${call.agent_key}-system`, call.agent_key, 'system', status, call.started_at || null));
              if (call.agent_key === 'townhall') {
                syntheticEdges.push(buildEdge(`active-user-townhall`, 'user', 'townhall', status, call.started_at || null));
              }
            });

            response.recently_completed.forEach(call => {
              syntheticEdges.push(buildEdge(`done-user-${call.agent_key}`, 'user', call.agent_key, 'complete', call.completed_at || now));
              syntheticEdges.push(buildEdge(`done-${call.agent_key}-system`, call.agent_key, 'system', 'complete', call.completed_at || now));
              if (call.agent_key === 'townhall') {
                syntheticEdges.push(buildEdge(`done-user-townhall`, 'user', 'townhall', 'complete', call.completed_at || now));
              }
            });
            
            const counts = updatedNodes.reduce((acc, node) => {
              acc[node.callState] = (acc[node.callState] || 0) + 1;
              return acc;
            }, {} as Record<string, number>);
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/833df7df-b87b-44c1-befe-7231bf52dc09',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store:pollActiveCalls:update',message:'Updated node call states',data:{sessionId,counts,syntheticCount:syntheticEdges.length},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            
            return { 
              graphNodes: updatedNodes,
              graphEdges: [...preservedEdges, ...syntheticEdges],
            };
          });
        } catch (error) {
          console.warn('[STORE] pollActiveCalls failed:', error);
        }
      },
      
      setGraphFilters: (filters: GraphFilters) => {
        set({ graphFilters: filters });
      },
    }),
    {
      name: 'civicsim-storage',
      partialize: (state) => ({
        history: state.history,
        autoSimulate: state.autoSimulate,
        // Note: adoptedProposals intentionally NOT persisted - policies are session-ephemeral
      }),
    }
  )
);

// Proposal card definitions
export const PROPOSAL_CARDS: ProposalCard[] = [
  // Spatial - Build
  { id: 'park', type: 'spatial', subtype: 'park' as SpatialProposalType, name: 'Park', icon: '🌳', description: 'Green space and recreation', category: 'build' },
  { id: 'upzone', type: 'spatial', subtype: 'upzone' as SpatialProposalType, name: 'Upzone', icon: '🏗️', description: 'Increase density allowance', category: 'build' },
  { id: 'housing', type: 'spatial', subtype: 'housing_development' as SpatialProposalType, name: 'Housing', icon: '🏠', description: 'Residential development', category: 'build' },
  { id: 'transit', type: 'spatial', subtype: 'transit_line' as SpatialProposalType, name: 'Transit', icon: '🚌', description: 'Bus or rail line', category: 'build' },
  { id: 'bike_lane', type: 'spatial', subtype: 'bike_lane' as SpatialProposalType, name: 'Bike Lane', icon: '🚴', description: 'Protected cycling infrastructure', category: 'build' },
  { id: 'commercial', type: 'spatial', subtype: 'commercial_development' as SpatialProposalType, name: 'Commercial', icon: '🏪', description: 'Shops and offices', category: 'build' },
  { id: 'community', type: 'spatial', subtype: 'community_center' as SpatialProposalType, name: 'Community', icon: '🏛️', description: 'Community center', category: 'build' },
  { id: 'factory', type: 'spatial', subtype: 'factory' as SpatialProposalType, name: 'Factory', icon: '🏭', description: 'Industrial facility', category: 'build' },
  
  // Citywide - Policy
  { id: 'subsidy', type: 'citywide', subtype: 'subsidy' as CitywideProposalType, name: 'Subsidy', icon: '💰', description: 'Financial assistance', category: 'policy' },
  { id: 'tax_up', type: 'citywide', subtype: 'tax_increase' as CitywideProposalType, name: 'Tax Increase', icon: '📈', description: 'Raise taxes', category: 'policy' },
  { id: 'tax_down', type: 'citywide', subtype: 'tax_decrease' as CitywideProposalType, name: 'Tax Cut', icon: '📉', description: 'Lower taxes', category: 'policy' },
  { id: 'transit_fund', type: 'citywide', subtype: 'transit_funding' as CitywideProposalType, name: 'Transit Fund', icon: '🚇', description: 'Transit investment', category: 'policy' },
  { id: 'housing_pol', type: 'citywide', subtype: 'housing_policy' as CitywideProposalType, name: 'Housing Policy', icon: '📋', description: 'Housing regulations', category: 'policy' },
  { id: 'env_pol', type: 'citywide', subtype: 'environmental_policy' as CitywideProposalType, name: 'Environment', icon: '🌿', description: 'Green regulations', category: 'policy' },
  { id: 'regulation', type: 'citywide', subtype: 'regulation' as CitywideProposalType, name: 'Regulation', icon: '📜', description: 'New regulations', category: 'policy' },
];

// Helper to create proposal from card
export function createProposalFromCard(
  card: ProposalCard, 
  position?: { lat: number; lng: number }
): Proposal {
  if (card.type === 'spatial') {
    return {
      type: 'spatial',
      spatial_type: card.subtype as SpatialProposalType,
      title: `New ${card.name}`,
      latitude: position?.lat ?? 0,
      longitude: position?.lng ?? 0,
      ...defaultSpatialProps,
    };
  } else {
    return {
      type: 'citywide',
      citywide_type: card.subtype as CitywideProposalType,
      title: `New ${card.name}`,
      ...defaultCitywideProps,
    };
  }
}
