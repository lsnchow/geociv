import { useCivicStore } from '../../store';
import { Panel, PanelSection, PanelDivider } from '../ui';
import { ApprovalMeter } from './ApprovalMeter';
import { DriverList } from './DriverList';
import { ArchetypeBreakdown } from './ArchetypeBreakdown';
import { VotingPanel } from './VotingPanel';

export function ResultsPanel() {
  const { 
    simulationResult, 
    isSimulating, 
    activeProposal,
    agentReactions,
    agentSimulation,
    isAdopting,
    adoptProposal,
    forceForwardProposal,
  } = useCivicStore();
  
  // Get interpreted proposal from agent simulation
  const interpretedProposal = agentSimulation?.proposal;
  const sessionId = agentSimulation?.session_id;
  
  // Handlers for voting actions
  const handleAdopt = async () => {
    if (interpretedProposal && sessionId) {
      try {
        await adoptProposal(interpretedProposal, agentReactions, sessionId);
      } catch (error) {
        console.error('Adoption failed:', error);
      }
    }
  };
  
  const handleForceForward = async () => {
    if (interpretedProposal && sessionId) {
      try {
        await forceForwardProposal(interpretedProposal, agentReactions, sessionId);
      } catch (error) {
        console.error('Force forward failed:', error);
      }
    }
  };
  
  if (!activeProposal) {
    return (
      <Panel title="Results" className="h-full">
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
      <Panel title="Results" className="h-full">
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
      <Panel title="Results" className="h-full">
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

