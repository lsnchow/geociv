import { useState } from 'react';
import { useCivicStore } from '../../store';
import { Panel, PanelSection, PanelDivider } from '../ui';
import { ApprovalMeter } from './ApprovalMeter';
import { DriverList } from './DriverList';
import { ArchetypeBreakdown } from './ArchetypeBreakdown';
import { VotingPanel } from './VotingPanel';
import { PolicyFeed } from './PolicyFeed';

type ResultsTab = 'current' | 'feed';

export function ResultsPanel() {
  const [activeTab, setActiveTab] = useState<ResultsTab>('current');
  const { 
    simulationResult, 
    isSimulating, 
    activeProposal,
    agentReactions,
    agentSimulation,
    isAdopting,
    adoptProposal,
    forceForwardProposal,
    adoptedProposals,
    proposalFeed,
  } = useCivicStore();
  
  // Get interpreted proposal from agent simulation
  const interpretedProposal = agentSimulation?.proposal;
  const sessionId = agentSimulation?.session_id;
  
  // Generate origin proposal ID for idempotent promotion
  const originProposalId = agentSimulation?.thread_id 
    ? `proposal_${agentSimulation.thread_id}_current` 
    : undefined;
  
  // Handlers for voting actions
  const handleAdopt = async () => {
    if (interpretedProposal && sessionId) {
      try {
        await adoptProposal(interpretedProposal, agentReactions, sessionId, originProposalId);
      } catch (error) {
        console.error('Adoption failed:', error);
      }
    }
  };
  
  const handleForceForward = async () => {
    if (interpretedProposal && sessionId) {
      try {
        await forceForwardProposal(interpretedProposal, agentReactions, sessionId, originProposalId);
      } catch (error) {
        console.error('Force forward failed:', error);
      }
    }
  };
  
  // Count for feed badge
  const feedCount = adoptedProposals.length + proposalFeed.filter(p => !p.is_promoted).length;
  
  // Tab header component
  const TabHeader = () => (
    <div className="flex border-b border-civic-border">
      <button
        onClick={() => setActiveTab('current')}
        className={`flex-1 py-2 text-xs font-medium transition-colors ${
          activeTab === 'current'
            ? 'text-civic-accent border-b-2 border-civic-accent'
            : 'text-civic-text-secondary hover:text-civic-text'
        }`}
      >
        Current
      </button>
      <button
        onClick={() => setActiveTab('feed')}
        className={`flex-1 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
          activeTab === 'feed'
            ? 'text-civic-accent border-b-2 border-civic-accent'
            : 'text-civic-text-secondary hover:text-civic-text'
        }`}
      >
        Feed
        {feedCount > 0 && (
          <span className="bg-civic-accent/20 text-civic-accent text-[10px] px-1.5 py-0.5 rounded-full">
            {feedCount}
          </span>
        )}
      </button>
    </div>
  );
  
  // Feed tab content
  if (activeTab === 'feed') {
    return (
      <Panel title="Results" className="h-full flex flex-col">
        <TabHeader />
        <div className="flex-1 overflow-hidden">
          <PolicyFeed />
        </div>
      </Panel>
    );
  }
  
  // Current tab - empty state
  if (!activeProposal) {
    return (
      <Panel title="Results" className="h-full flex flex-col">
        <TabHeader />
        <PanelSection>
          <div className="text-center py-12">
            <div className="text-4xl mb-3 opacity-50">📊</div>
            <p className="text-sm text-civic-text-secondary">
              Select a proposal to see predicted community reaction
            </p>
          </div>
        </PanelSection>
      </Panel>
    );
  }
  
  if (isSimulating) {
    return (
      <Panel title="Results" className="h-full flex flex-col">
        <TabHeader />
        <PanelSection>
          <div className="text-center py-12">
            <div className="animate-pulse text-4xl mb-3">⚙️</div>
            <p className="text-sm text-civic-text-secondary">
              Simulating community reaction...
            </p>
          </div>
        </PanelSection>
      </Panel>
    );
  }
  
  if (!simulationResult) {
    return (
      <Panel title="Results" className="h-full flex flex-col">
        <TabHeader />
        <PanelSection>
          <div className="text-center py-12">
            <div className="text-4xl mb-3 opacity-50">🎯</div>
            <p className="text-sm text-civic-text-secondary">
              {activeProposal.type === 'spatial' 
                ? 'Drop proposal on map to simulate'
                : 'Adjust settings and run simulation'}
            </p>
          </div>
        </PanelSection>
      </Panel>
    );
  }
  
  return (
    <Panel title="Results" className="h-full flex flex-col">
      <TabHeader />
      
      {/* Overall approval */}
      <PanelSection>
        <ApprovalMeter 
          score={simulationResult.overall_approval} 
          sentiment={simulationResult.overall_sentiment}
        />
      </PanelSection>
      
      <PanelDivider />
      
      {/* Voting Panel - show when we have agent reactions */}
      {agentReactions.length > 0 && interpretedProposal && (
        <>
          <PanelSection>
            <VotingPanel 
              reactions={agentReactions}
              proposal={interpretedProposal}
              onAdopt={handleAdopt}
              onForceForward={handleForceForward}
              isAdopting={isAdopting}
            />
          </PanelSection>
          <PanelDivider />
        </>
      )}
      
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Top drivers */}
        <PanelSection>
          <h4 className="text-xs font-medium text-civic-text-secondary mb-3">
            KEY DRIVERS
          </h4>
          <DriverList drivers={simulationResult.top_drivers.slice(0, 5)} />
        </PanelSection>
        
        <PanelDivider />
        
        {/* Archetype breakdown */}
        <PanelSection>
          <h4 className="text-xs font-medium text-civic-text-secondary mb-3">
            BY GROUP
          </h4>
          <ArchetypeBreakdown archetypes={simulationResult.approval_by_archetype} />
        </PanelSection>
        
        {/* Narrative (if available) */}
        {simulationResult.narrative && (
          <>
            <PanelDivider />
            <PanelSection>
              <h4 className="text-xs font-medium text-civic-text-secondary mb-3">
                NARRATIVE
              </h4>
              <p className="text-sm text-civic-text leading-relaxed">
                {simulationResult.narrative.summary}
              </p>
              
              {simulationResult.narrative.compromise_suggestion && (
                <div className="mt-3 p-2 bg-civic-accent/10 border border-civic-accent/30 rounded">
                  <p className="text-xs text-civic-accent">
                    💡 {simulationResult.narrative.compromise_suggestion}
                  </p>
                </div>
              )}
            </PanelSection>
          </>
        )}
      </div>
      
      {/* Deterministic receipt footer */}
      <div className="border-t border-civic-border">
        <PanelSection className="py-2">
          <div className="flex items-center justify-between text-[10px] text-civic-text-secondary font-mono">
            <span>DETERMINISTIC • NO AI</span>
            <span>
              Δ={Object.values(simulationResult.metric_deltas || {}).reduce((a, b) => a + Math.abs(b), 0).toFixed(2)}
            </span>
          </div>
        </PanelSection>
      </div>
    </Panel>
  );
}

