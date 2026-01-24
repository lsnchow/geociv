import { useEffect, useState, useCallback, Component, type ReactNode } from 'react';
import { useCivicStore } from './store';
import { Header } from './components/layout';
import { MapArena } from './components/map';
import { ProposalPalette } from './components/palette';
import { ResultsPanel } from './components/results';
import { ProposalEditor } from './components/editor';
import { HistoryTimeline } from './components/history';
import { AgentGraph } from './components/graph';
import { AICopilot } from './components/copilot';
import { VariantGrid } from './components/variants';
import { TownHallPanel, TownHallTranscript as TownHallTranscriptComponent, AgentReactions } from './components/townhall';
import { AIFooter } from './components/footer';
import type { VariantBundle, TownHallTranscript as TownHallTranscriptType, RankedVariant } from './types/ai';
import type { Proposal } from './types';
import * as aiApi from './lib/ai-api';

// #region agent log
// Global error handler for unhandled errors
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    fetch('http://127.0.0.1:7242/ingest/36b22d3a-abef-4d8c-b3d9-d3a34145295b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'window:error',message:'Unhandled global error',data:{errorMsg:event.message,filename:event.filename,lineno:event.lineno,colno:event.colno},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
  });
  window.addEventListener('unhandledrejection', (event) => {
    fetch('http://127.0.0.1:7242/ingest/36b22d3a-abef-4d8c-b3d9-d3a34145295b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'window:unhandledrejection',message:'Unhandled promise rejection',data:{reason:String(event.reason)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
  });
}
// #endregion

// Global App Error Boundary
interface AppErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/36b22d3a-abef-4d8c-b3d9-d3a34145295b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AppErrorBoundary:catch',message:'App caught fatal error',data:{errorMsg:error.message,stack:errorInfo.componentStack?.slice(0,800)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    console.error('[CivicSim] Fatal app error:', error);
    console.error('[CivicSim] Stack:', errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0a0a0b] text-[#fafafa] flex items-center justify-center p-8">
          <div className="text-center max-w-lg bg-[#111113] border border-[#27272a] rounded-lg p-8">
            <div className="text-5xl mb-4">⚠️</div>
            <h1 className="text-xl font-bold mb-2">Application Error</h1>
            <p className="text-[#a1a1aa] mb-4">
              Something went wrong. Please reload the page to continue.
            </p>
            {this.state.error && (
              <p className="text-xs font-mono text-[#ef4444] mb-4 break-all bg-[#18181b] p-3 rounded text-left">
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-[#3b82f6] hover:bg-[#1d4ed8] text-white font-medium rounded transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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
    loadingScenario,
  } = useCivicStore();

  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7242/ingest/36b22d3a-abef-4d8c-b3d9-d3a34145295b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.tsx:render',message:'App render state',data:{hasScenario:!!scenario,scenarioId:scenario?.id,loadingScenario,leftPanelOpen,rightPanelOpen},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A-B'})}).catch(()=>{});
  }, [scenario, loadingScenario, leftPanelOpen, rightPanelOpen]);
  // #endregion

  // AI-Max state
  const [variantBundle, setVariantBundle] = useState<VariantBundle | null>(null);
  const [townHall, setTownHall] = useState<TownHallTranscriptType | null>(null);
  const [activeAIFeatures, setActiveAIFeatures] = useState<string[]>([]);
  const [showVariants, setShowVariants] = useState(false);
  const [showTownHall, setShowTownHall] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<'results' | 'agents' | 'townhall'>('results');
  
  // Get multi-agent state from store
  const { 
    agentReactions, 
    agentSimulation, 
    adoptProposal, 
    forceForwardProposal,
    sessionId,
  } = useCivicStore();

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

  // Lasso feature removed - use AI proposals instead

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
          <MapArena />
          
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
                    canPromote={(() => {
                      const support = agentReactions.filter(r => r.stance === 'support').length;
                      const oppose = agentReactions.filter(r => r.stance === 'oppose').length;
                      const totalVotes = support + oppose;
                      return totalVotes > 0 && (support / totalVotes) >= 0.5;
                    })()}
                    onPromoteToPolicy={agentSimulation?.proposal ? async () => {
                      const proposal = agentSimulation.proposal;
                      if (proposal) {
                        await adoptProposal(proposal, agentReactions, sessionId);
                      }
                    } : undefined}
                    onForcePolicy={agentSimulation?.proposal ? async () => {
                      const proposal = agentSimulation.proposal;
                      if (proposal) {
                        await forceForwardProposal(proposal, agentReactions, sessionId);
                      }
                    } : undefined}
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
              
              {/* Agent Graph - replaces History tab */}
              <div className="h-56 border-t border-civic-border overflow-hidden">
                <AgentGraph />
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

// Wrap App with error boundary
function WrappedApp() {
  return (
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  );
}

export default WrappedApp;
