import { useCivicStore } from '../../store';
import { Panel, PanelSection, PanelDivider, Button, Slider, Toggle } from '../ui';
import type { SpatialProposal, CitywideProposal } from '../../types';

export function ProposalEditor() {
  const { 
    activeProposal, 
    updateActiveProposal, 
    setActiveProposal,
    runSimulation,
    isSimulating 
  } = useCivicStore();
  
  if (!activeProposal) {
    return null;
  }
  
  const handleTitleChange = (title: string) => {
    updateActiveProposal({ title });
  };
  
  const handleClear = () => {
    setActiveProposal(null);
  };
  
  return (
    <Panel 
      title="Proposal Details" 
      className="flex flex-col"
      actions={
        <Button variant="ghost" size="sm" onClick={handleClear}>
          ✕
        </Button>
      }
    >
      {/* Title input */}
      <PanelSection>
        <input
          type="text"
          value={activeProposal.title}
          onChange={(e) => handleTitleChange(e.target.value)}
          className="w-full bg-civic-bg border border-civic-border rounded px-3 py-2 text-sm text-civic-text focus:outline-none focus:border-civic-accent"
          placeholder="Proposal title..."
        />
      </PanelSection>
      
      <PanelDivider />
      
      {/* Type-specific controls */}
      <div className="flex-1 overflow-y-auto">
        {activeProposal.type === 'spatial' ? (
          <SpatialControls 
            proposal={activeProposal} 
            onChange={(updates) => updateActiveProposal(updates)}
          />
        ) : (
          <CitywideControls 
            proposal={activeProposal}
            onChange={(updates) => updateActiveProposal(updates)}
          />
        )}
      </div>
      
      <PanelDivider />
      
      {/* Run button */}
      <PanelSection>
        <Button 
          className="w-full"
          onClick={() => runSimulation()}
          loading={isSimulating}
          disabled={activeProposal.type === 'spatial' && !activeProposal.latitude}
        >
          {isSimulating ? 'Simulating...' : 'Run Simulation'}
        </Button>
      </PanelSection>
    </Panel>
  );
}

interface SpatialControlsProps {
  proposal: SpatialProposal;
  onChange: (updates: Partial<SpatialProposal>) => void;
}

function SpatialControls({ proposal, onChange }: SpatialControlsProps) {
  return (
    <PanelSection className="space-y-4">
      <Slider
        label="Impact Radius"
        value={proposal.radius_km || 0.5}
        onChange={(v) => onChange({ radius_km: v })}
        min={0.1}
        max={5}
        step={0.1}
        unit=" km"
      />
      
      <Slider
        label="Scale / Intensity"
        value={(proposal.scale || 1) * 100}
        onChange={(v) => onChange({ scale: v / 100 })}
        min={25}
        max={200}
        step={5}
        unit="%"
      />
      
      <div className="pt-2 space-y-3">
        <Toggle
          label="Include Affordable Housing"
          checked={proposal.includes_affordable_housing || false}
          onChange={(v) => onChange({ includes_affordable_housing: v })}
        />
        
        <Toggle
          label="Include Green Space"
          checked={proposal.includes_green_space || false}
          onChange={(v) => onChange({ includes_green_space: v })}
        />
        
        <Toggle
          label="Include Transit Access"
          checked={proposal.includes_transit_access || false}
          onChange={(v) => onChange({ includes_transit_access: v })}
        />
      </div>
      
      {/* Location display */}
      {proposal.latitude && proposal.longitude && (
        <div className="pt-3 border-t border-civic-border">
          <p className="text-[10px] text-civic-text-secondary mb-1">LOCATION</p>
          <p className="text-xs font-mono text-civic-text">
            {proposal.latitude.toFixed(4)}, {proposal.longitude.toFixed(4)}
          </p>
        </div>
      )}
    </PanelSection>
  );
}

interface CitywideControlsProps {
  proposal: CitywideProposal;
  onChange: (updates: Partial<CitywideProposal>) => void;
}

function CitywideControls({ proposal, onChange }: CitywideControlsProps) {
  const isPercentageBased = ['tax_increase', 'tax_decrease'].includes(proposal.citywide_type);
  const isAmountBased = ['subsidy', 'transit_funding'].includes(proposal.citywide_type);
  
  return (
    <PanelSection className="space-y-4">
      {isPercentageBased && (
        <Slider
          label="Percentage Change"
          value={proposal.percentage || 10}
          onChange={(v) => onChange({ percentage: v })}
          min={1}
          max={50}
          step={1}
          unit="%"
        />
      )}
      
      {isAmountBased && (
        <Slider
          label="Amount (Millions)"
          value={proposal.amount || 50}
          onChange={(v) => onChange({ amount: v })}
          min={10}
          max={500}
          step={10}
          unit="M"
        />
      )}
      
      <div className="pt-2 space-y-3">
        <Toggle
          label="Income Targeted"
          checked={proposal.income_targeted || false}
          onChange={(v) => onChange({ income_targeted: v })}
        />
        
        {proposal.income_targeted && (
          <div className="pl-4">
            <label className="text-xs text-civic-text-secondary block mb-2">
              Target Income Level
            </label>
            <div className="flex gap-1">
              {(['low', 'middle', 'high', 'all'] as const).map(level => (
                <button
                  key={level}
                  onClick={() => onChange({ target_income_level: level })}
                  className={`flex-1 text-xs py-1.5 rounded transition-colors ${
                    proposal.target_income_level === level
                      ? 'bg-civic-accent text-white'
                      : 'bg-civic-bg text-civic-text-secondary hover:text-civic-text'
                  }`}
                >
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Description */}
      <div className="pt-3">
        <label className="text-xs text-civic-text-secondary block mb-2">
          Description (optional)
        </label>
        <textarea
          value={proposal.description || ''}
          onChange={(e) => onChange({ description: e.target.value })}
          className="w-full bg-civic-bg border border-civic-border rounded px-3 py-2 text-sm text-civic-text focus:outline-none focus:border-civic-accent resize-none"
          rows={3}
          placeholder="Add details about this policy..."
        />
      </div>
    </PanelSection>
  );
}

