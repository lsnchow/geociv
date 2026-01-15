import { useEffect, useState, useCallback } from 'react';
import { useCivicStore } from './store';
import { Header } from './components/layout';
import { MapArena, analyzeShape } from './components/map';
import { ProposalPalette } from './components/palette';
import { ResultsPanel } from './components/results';
import { ProposalEditor } from './components/editor';
import { HistoryTimeline } from './components/history';
import { AICopilot } from './components/copilot';
import { VariantGrid } from './components/variants';
import { TownHallPanel, TownHallTranscript as TownHallTranscriptComponent, AgentReactions } from './components/townhall';
import { AIFooter } from './components/footer';
import type { VariantBundle, TownHallTranscript as TownHallTranscriptType, RankedVariant } from './types/ai';
import type { Proposal, SpatialProposal } from './types';
import * as aiApi from './lib/ai-api';

function App() {
  const { 
    scenario, 
    leftPanelOpen, 
    rightPanelOpen,
    activeProposal,
    loadScenarios,
    seedKingston,
    setActiveProposal,
    runSimulation,
  } = useCivicStore();

  // AI-Max state
  const [variantBundle, setVariantBundle] = useState<VariantBundle | null>(null);
  const [townHall, setTownHall] = useState<TownHallTranscriptType | null>(null);
  const [activeAIFeatures, setActiveAIFeatures] = useState<string[]>([]);
  const [showVariants, setShowVariants] = useState(false);
  const [showTownHall, setShowTownHall] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<'results' | 'agents' | 'townhall'>('results');
  
  // Get multi-agent state from store
  const { agentReactions } = useCivicStore();

  // Load scenarios on mount
  useEffect(() => {
    loadScenarios();
  }, [loadScenarios]);

  // Auto-seed Kingston if no scenario
  useEffect(() => {
    if (!scenario) {
      seedKingston();
    }
  }, [scenario, seedKingston]);

  // Handle AI-generated variants (for legacy variant generation)
  const handleVariantsGenerated = (bundle: VariantBundle) => {
    setVariantBundle(bundle);
    setShowVariants(true);
    setActiveAIFeatures(prev => [...new Set([...prev, 'variants'])]);
  };

  // Handle town hall generation (for legacy town hall)
  const handleTownHallGenerated = (transcript: TownHallTranscriptType) => {
    setTownHall(transcript);
    setShowTownHall(true);
    setActiveAIFeatures(prev => [...new Set([...prev, 'townhall'])]);
  };
  
  // Suppress unused variable warnings (these are used by legacy features)
  void handleVariantsGenerated;
  void handleTownHallGenerated;
  
  // Auto-switch to agents tab when we get agent reactions
  useEffect(() => {
    if (agentReactions.length > 0) {
      setRightPanelTab('agents');
    }
  }, [agentReactions]);

  // Handle selecting a variant
  const handleSelectVariant = useCallback((variant: RankedVariant) => {
    setActiveProposal(variant.proposal);
    setShowVariants(false);
    runSimulation();
  }, [setActiveProposal, runSimulation]);

  // Handle compiled proposal from AI (legacy)
  const handleProposalCompiled = (_proposal: Proposal) => {
    setActiveAIFeatures(prev => [...new Set([...prev, 'parse'])]);
  };
  void handleProposalCompiled;

  // Handle lasso complete
  const handleLassoComplete = useCallback(async (
    _path: Array<{ lat: number; lng: number }>,
    shape: ReturnType<typeof analyzeShape>
  ) => {
    if (!scenario) return;
    
    // Create a proposal suggestion based on the lasso shape
    const suggestedType = shape.isCorridor ? 'bike_lane' : 'park';
    const proposal: SpatialProposal = {
      type: 'spatial',
      spatial_type: suggestedType,
      title: `New ${shape.isCorridor ? 'Bike Lane' : 'Park'} (drawn)`,
      latitude: shape.centerLat,
      longitude: shape.centerLng,
      radius_km: 0.5,
      scale: 1.0,
    };
    
    setActiveProposal(proposal);
    setActiveAIFeatures(prev => [...new Set([...prev, 'lasso'])]);
    
    // Run simulation
    setTimeout(() => runSimulation(), 100);
  }, [scenario, setActiveProposal, runSimulation]);

  // Handle cross-examine in town hall
  const handleCrossExamine = useCallback(async (speakerArchetype: string, question: string) => {
    if (!scenario || !activeProposal) return;
    
    const response = await aiApi.crossExamine(
      scenario.id,
      activeProposal,
      speakerArchetype,
      question
    );
    
    // Add to transcript
    if (townHall) {
      setTownHall({
        ...townHall,
        exchanges: [
          ...townHall.exchanges,
          {
            speaker_id: speakerArchetype,
            type: 'statement',
            content: response.response,
            cited_metrics: [],
            emotion: 'neutral',
          }
        ]
      });
    }
  }, [scenario, activeProposal, townHall]);

  // Handle flip speaker
  const handleFlipSpeaker = useCallback(async (speakerArchetype: string) => {
    if (!scenario || !activeProposal) return;
    
    const response = await aiApi.flipSpeaker(
      scenario.id,
      activeProposal,
      speakerArchetype
    );
    
    // Show suggestions
    alert(`To flip ${response.speaker_name}:\n\n${response.suggestions.join('\n')}`);
  }, [scenario, activeProposal]);

  // Copy recipe to clipboard
  const handleCopyRecipe = useCallback(() => {
    if (!activeProposal) return;
    
    const recipe = {
      proposal: activeProposal,
      scenario_id: scenario?.id,
      timestamp: new Date().toISOString(),
    };
    
    navigator.clipboard.writeText(JSON.stringify(recipe, null, 2));
  }, [activeProposal, scenario]);

  return (
    <div className="h-screen flex flex-col bg-civic-bg overflow-hidden">
      <Header />
      
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Proposals */}
        <div 
          className={`transition-all duration-300 ease-in-out border-r border-civic-border bg-civic-surface ${
            leftPanelOpen ? 'w-72' : 'w-0'
          }`}
        >
          {leftPanelOpen && (
            <div className="h-full flex flex-col">
              <div className="flex-1 overflow-hidden">
                <ProposalPalette />
              </div>
              
              {/* Proposal editor below palette */}
              {activeProposal && (
                <div className="border-t border-civic-border max-h-[40%] overflow-y-auto">
                  <ProposalEditor />
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Map Arena - Center */}
        <div className="flex-1 relative">
          <MapArena onLassoComplete={handleLassoComplete} />
          
          {/* AI Copilot (floating command bar) */}
          <AICopilot />
          
          {/* Variants overlay */}
          {showVariants && variantBundle && (
            <div className="absolute inset-y-0 left-0 w-80 bg-civic-surface/95 backdrop-blur border-r border-civic-border z-30 shadow-xl">
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-civic-border">
                  <h3 className="text-sm font-medium text-civic-text">🔮 AI Variants</h3>
                  <button
                    onClick={() => setShowVariants(false)}
                    className="text-civic-text-secondary hover:text-civic-text"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex-1 overflow-hidden">
                  <VariantGrid
                    bundle={variantBundle}
                    onSelectVariant={handleSelectVariant}
                  />
                </div>
              </div>
            </div>
          )}
          
          {/* Town Hall overlay */}
          {showTownHall && townHall && (
            <div className="absolute inset-y-0 right-0 w-96 bg-civic-surface/95 backdrop-blur border-l border-civic-border z-30 shadow-xl">
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-civic-border">
                  <h3 className="text-sm font-medium text-civic-text">🏛️ Town Hall</h3>
                  <button
                    onClick={() => setShowTownHall(false)}
                    className="text-civic-text-secondary hover:text-civic-text"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex-1 overflow-hidden">
                  <TownHallPanel
                    transcript={townHall}
                    onCrossExamine={handleCrossExamine}
                    onFlipSpeaker={handleFlipSpeaker}
                  />
                </div>
              </div>
            </div>
          )}
          
          {/* Loading overlay */}
          {!scenario && (
            <div className="absolute inset-0 bg-civic-bg/80 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin text-4xl mb-4">🌍</div>
                <p className="text-civic-text-secondary">Loading scenario...</p>
              </div>
            </div>
          )}
          
          {/* Legacy loading overlays (can be re-enabled when needed) */}
          {/* 
          {isGeneratingVariants && (
            <div className="absolute inset-0 bg-civic-bg/80 flex items-center justify-center z-40">
              <VariantGridSkeleton />
            </div>
          )}
          
          {isGeneratingTownHall && (
            <div className="absolute inset-0 bg-civic-bg/80 flex items-center justify-center z-40">
              <TownHallSkeleton />
            </div>
          )}
          */}
        </div>
        
        {/* Right Panel - Results, Agents, Town Hall & History */}
        <div 
          className={`transition-all duration-300 ease-in-out border-l border-civic-border bg-civic-surface ${
            rightPanelOpen ? 'w-96' : 'w-0'
          }`}
        >
          {rightPanelOpen && (
            <div className="h-full flex flex-col">
              {/* Tab switcher */}
              <div className="flex border-b border-civic-border bg-civic-bg/50">
                <button
                  onClick={() => setRightPanelTab('results')}
                  className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
                    rightPanelTab === 'results' 
                      ? 'text-civic-accent border-b-2 border-civic-accent bg-civic-accent/5' 
                      : 'text-civic-text-secondary hover:text-civic-text'
                  }`}
                >
                  📊 Results
                </button>
                <button
                  onClick={() => setRightPanelTab('agents')}
                  className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
                    rightPanelTab === 'agents' 
                      ? 'text-civic-accent border-b-2 border-civic-accent bg-civic-accent/5' 
                      : 'text-civic-text-secondary hover:text-civic-text'
                  }`}
                >
                  👥 Agents {agentReactions.length > 0 && `(${agentReactions.length})`}
                </button>
                <button
                  onClick={() => setRightPanelTab('townhall')}
                  className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
                    rightPanelTab === 'townhall' 
                      ? 'text-civic-accent border-b-2 border-civic-accent bg-civic-accent/5' 
                      : 'text-civic-text-secondary hover:text-civic-text'
                  }`}
                >
                  🏛️ Town Hall
                </button>
              </div>
              
              {/* Tab content */}
              <div className="flex-1 overflow-hidden">
                {rightPanelTab === 'results' && <ResultsPanel />}
                {rightPanelTab === 'agents' && <AgentReactions />}
                {rightPanelTab === 'townhall' && <TownHallTranscriptComponent />}
              </div>
              
              {/* History always visible at bottom */}
              <div className="h-48 border-t border-civic-border overflow-hidden">
                <HistoryTimeline />
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* AI Footer */}
      <AIFooter
        activeFeatures={activeAIFeatures}
        assumptionsCount={0}
        onCopyRecipe={handleCopyRecipe}
      />
    </div>
  );
}

export default App;
