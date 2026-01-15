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
import type { SimulationResponse, ZoneSentiment, AgentReaction, TownHallTranscript, AdoptedEvent, InterpretedProposal } from '../types/simulation';
import * as api from '../lib/api';

// Relationship edge for visualization
export interface RelationshipEdge {
  from: string;
  to: string;
  score: number;
  reason?: string;
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
  
  // Simulation
  simulationResult: SimulationResult | null;
  isSimulating: boolean;
  autoSimulate: boolean;
  
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
  
  // Adopted proposals
  adoptedProposals: AdoptedEvent[];
  isAdopting: boolean;
  
  // History
  history: HistoryEntry[];
  selectedHistoryId: string | null;
  
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
  
  runSimulation: () => Promise<void>;
  setAutoSimulate: (auto: boolean) => void;
  
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
  
  // Adoption actions
  adoptProposal: (proposal: InterpretedProposal, reactions: AgentReaction[], sessionId: string) => Promise<void>;
  forceForwardProposal: (proposal: InterpretedProposal, reactions: AgentReaction[], sessionId: string) => Promise<void>;
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
      
      simulationResult: null,
      isSimulating: false,
      autoSimulate: true,
      
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
      
      // Adopted proposals
      adoptedProposals: [],
      isAdopting: false,
      
      history: [],
      selectedHistoryId: null,
      
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
        set(state => ({
          agentReactions: state.agentReactions.map(r =>
            r.agent_key === agentKey ? { ...r, ...updates } : r
          ),
        }));
      },
      
      loadRelationships: async (sessionId) => {
        try {
          const response = await api.getRelationships(sessionId);
          set({ relationships: response.edges || [] });
        } catch (error) {
          console.warn('Failed to load relationships:', error);
        }
      },
      
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
      
      // Adoption actions
      adoptProposal: async (proposal, reactions, sessionId) => {
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
          
          // Create adopted event
          const adoptedEvent: AdoptedEvent = {
            id: `adopted_${Date.now()}`,
            timestamp: new Date().toISOString(),
            session_id: sessionId,
            proposal,
            outcome: 'adopted',
            vote_summary: { support, oppose, neutral, agreement_pct: agreementPct },
            key_quotes: keyQuotes,
            zone_deltas: zoneDeltas,
          };
          
          // Call backend to persist in agent threads
          await api.adoptProposal(sessionId, adoptedEvent);
          
          // Add to local state
          set(state => ({
            adoptedProposals: [...state.adoptedProposals, adoptedEvent],
            isAdopting: false,
          }));
        } catch (error) {
          console.error('Failed to adopt proposal:', error);
          set({ isAdopting: false });
          throw error;
        }
      },
      
      forceForwardProposal: async (proposal, reactions, sessionId) => {
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
          
          // Create adopted event (forced)
          const adoptedEvent: AdoptedEvent = {
            id: `adopted_${Date.now()}`,
            timestamp: new Date().toISOString(),
            session_id: sessionId,
            proposal,
            outcome: 'forced',
            vote_summary: { support, oppose, neutral, agreement_pct: agreementPct },
            key_quotes: keyQuotes,
            zone_deltas: zoneDeltas,
          };
          
          // Call backend to persist in agent threads
          await api.adoptProposal(sessionId, adoptedEvent);
          
          // Add to local state
          set(state => ({
            adoptedProposals: [...state.adoptedProposals, adoptedEvent],
            isAdopting: false,
          }));
        } catch (error) {
          console.error('Failed to force forward proposal:', error);
          set({ isAdopting: false });
          throw error;
        }
      },
    }),
    {
      name: 'civicsim-storage',
      partialize: (state) => ({
        history: state.history,
        autoSimulate: state.autoSimulate,
        adoptedProposals: state.adoptedProposals,
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

