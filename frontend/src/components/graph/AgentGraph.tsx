import { useEffect, useState, useMemo } from 'react';
import { useCivicStore } from '../../store';
import { Panel, PanelSection, Button } from '../ui';
import { AgentNodeDrawer } from './AgentNodeDrawer';

// Provider colors for model chips
const PROVIDER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'amazon/nova-micro-v1': { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/50' },
  'anthropic/claude-3-haiku': { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/50' },
  'gemini-2.0-flash-lite-001': { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/50' },
  default: { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/50' },
};

// Default agents for display (copied from MapArena for consistency)
const DEFAULT_AGENTS: Record<string, { name: string; avatar: string; role: string }> = {
  queens_west: { name: 'Marcus Thompson', avatar: '🏃', role: 'Varsity Athlete' },
  queens_main: { name: 'Dr. Priya Sharma', avatar: '👩‍🔬', role: 'Engineering Professor' },
  union_stuart: { name: 'Jordan Chen', avatar: '💻', role: 'Remote Tech Worker' },
  kingscourt: { name: 'Patricia Morrison', avatar: '🏡', role: 'Retired Teacher' },
  williamsville: { name: 'Mike Kowalski', avatar: '🔧', role: 'Auto Shop Owner' },
  portsmouth: { name: 'Catherine Blackwood', avatar: '⛵', role: 'Heritage Preservationist' },
  cataraqui_west: { name: 'Jason & Lisa Park', avatar: '👨‍👩‍👧', role: 'Young Family' },
  highway_15_corridor: { name: 'Tony Marchetti', avatar: '🚛', role: 'Trucking Dispatcher' },
  strathcona_park: { name: 'Victoria Ashworth-Smythe', avatar: '🎻', role: 'Arts Patron' },
  victoria_park: { name: 'Aisha Rahman', avatar: '🐕', role: 'Community Organizer' },
  north_end: { name: 'Karen & Dave Murphy', avatar: '👪', role: 'Working Parents' },
  skeleton_park: { name: 'River Stone', avatar: '🎨', role: 'Installation Artist' },
  inner_harbour: { name: 'Alexandra Sterling', avatar: '🌆', role: 'Condo Board President' },
  sydenham: { name: 'Dwayne Williams', avatar: '✊', role: 'Tenant Advocate' },
  johnson_triangle: { name: 'Omar Hassan', avatar: '🛒', role: 'Convenience Store Owner' },
  calvin_park: { name: 'Sandra Mitchell', avatar: '🛍️', role: 'Retail Manager' },
  rideau_heights: { name: 'Blessing Okafor', avatar: '🌍', role: 'Newcomer Support Worker' },
  henderson: { name: 'George Patterson', avatar: '📰', role: 'Retired Journalist' },
  market_square: { name: 'Marco Rinaldi', avatar: '🍕', role: 'Restaurant Owner' },
  cataraqui_centre: { name: 'Ashley Young', avatar: '👗', role: 'Fashion Retail Worker' },
  lake_ontario_park: { name: 'Dr. Eleanor Marsh', avatar: '🦆', role: 'Conservation Biologist' },
};

interface AgentNode {
  key: string;
  name: string;
  avatar: string;
  role: string;
  model: string | null;
  archetypeOverride: string | null;
  isEdited: boolean;
  stance?: 'support' | 'oppose' | 'neutral';
  status: 'idle' | 'pending' | 'running' | 'done' | 'error';
}

function getModelShortName(model: string | null | undefined): string {
  if (!model) return 'Nova';
  if (model.includes('nova')) return 'Nova';
  if (model.includes('claude') || model.includes('haiku')) return 'Haiku';
  if (model.includes('gemini')) return 'Gemini';
  return 'Default';
}

function getModelColors(model: string | null | undefined) {
  const key = model || 'default';
  return PROVIDER_COLORS[key] || PROVIDER_COLORS.default;
}

export function AgentGraph() {
  const {
    scenario,
    agentOverrides,
    agentReactions,
    relationships,
    simulationJob,
    loadAgentOverrides,
    loadingOverrides,
    availableModels,
    defaultModel,
  } = useCivicStore();

  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Load overrides when scenario changes
  useEffect(() => {
    if (scenario?.id) {
      loadAgentOverrides(scenario.id);
    }
  }, [scenario?.id, loadAgentOverrides]);

  // Build agent nodes from definitions + overrides + reactions
  const agentNodes: AgentNode[] = useMemo(() => {
    return Object.entries(DEFAULT_AGENTS).map(([key, agent]) => {
      const override = agentOverrides[key];
      const reaction = agentReactions.find(r => r.agent_key === key);
      
      // Determine status based on simulation job
      let status: AgentNode['status'] = 'idle';
      if (simulationJob.status === 'running') {
        const completed = simulationJob.partialReactions.some(r => r.agent_key === key);
        status = completed ? 'done' : 'running';
      } else if (simulationJob.status === 'complete') {
        status = 'done';
      } else if (simulationJob.status === 'error') {
        status = 'error';
      }

      return {
        key,
        name: agent.name,
        avatar: agent.avatar,
        role: agent.role,
        model: override?.model || null,
        archetypeOverride: override?.archetype_override || null,
        isEdited: override?.is_edited || false,
        stance: reaction?.stance,
        status,
      };
    });
  }, [agentOverrides, agentReactions, simulationJob]);

  // Group agents into rows for grid layout
  const rows = useMemo(() => {
    const result: AgentNode[][] = [];
    for (let i = 0; i < agentNodes.length; i += 4) {
      result.push(agentNodes.slice(i, i + 4));
    }
    return result;
  }, [agentNodes]);

  const handleNodeClick = (agentKey: string) => {
    setSelectedAgent(agentKey);
    setIsDrawerOpen(true);
  };

  const handleRefresh = () => {
    if (scenario?.id) {
      loadAgentOverrides(scenario.id);
    }
  };

  const selectedAgentData = selectedAgent 
    ? agentNodes.find(n => n.key === selectedAgent)
    : null;

  if (!scenario) {
    return (
      <Panel title="Agent Graph" className="h-full">
        <PanelSection>
          <div className="text-center py-8">
            <div className="text-3xl mb-2 opacity-50">🔗</div>
            <p className="text-xs text-civic-text-secondary">
              Load a scenario to view agents
            </p>
          </div>
        </PanelSection>
      </Panel>
    );
  }

  return (
    <>
      <Panel 
        title="Agent Graph" 
        className="h-full flex flex-col"
        actions={
          <div className="flex gap-1">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleRefresh}
              loading={loadingOverrides}
              title="Reload agent settings"
            >
              ↻
            </Button>
          </div>
        }
      >
        {/* Legend */}
        <PanelSection className="border-b border-civic-border">
          <div className="flex items-center gap-4 text-[10px] text-civic-text-secondary">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-orange-400" />
              Nova
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Haiku
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              Gemini
            </span>
            <span className="flex items-center gap-1 ml-auto">
              <span className="w-2 h-2 rounded-full bg-civic-accent" />
              Edited
            </span>
          </div>
        </PanelSection>

        {/* Agent Grid */}
        <div className="flex-1 overflow-y-auto p-2">
          <div className="space-y-2">
            {rows.map((row, rowIdx) => (
              <div key={rowIdx} className="grid grid-cols-4 gap-2">
                {row.map(node => (
                  <AgentNodeCard
                    key={node.key}
                    node={node}
                    isSelected={selectedAgent === node.key}
                    onClick={() => handleNodeClick(node.key)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Relationships Summary */}
        {relationships.length > 0 && (
          <PanelSection className="border-t border-civic-border">
            <h4 className="text-[10px] font-medium text-civic-text-secondary mb-2">
              RECENT INTERACTIONS ({relationships.length})
            </h4>
            <div className="space-y-1 max-h-20 overflow-y-auto">
              {relationships.slice(0, 5).map((rel, i) => (
                <div key={i} className="flex items-center gap-1 text-[10px]">
                  <span className="text-civic-text">{rel.from}</span>
                  <span className={rel.score > 0 ? 'text-green-400' : 'text-red-400'}>
                    {rel.score > 0 ? '→' : '⇢'}
                  </span>
                  <span className="text-civic-text">{rel.to}</span>
                  <span className="text-civic-text-secondary ml-auto">
                    {rel.score > 0 ? '+' : ''}{(rel.score * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </PanelSection>
        )}
      </Panel>

      {/* Agent Edit Drawer */}
      <AgentNodeDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        agentKey={selectedAgent}
        agentData={selectedAgentData}
        availableModels={availableModels}
        defaultModel={defaultModel}
      />
    </>
  );
}

interface AgentNodeCardProps {
  node: AgentNode;
  isSelected: boolean;
  onClick: () => void;
}

function AgentNodeCard({ node, isSelected, onClick }: AgentNodeCardProps) {
  const modelColors = getModelColors(node.model);
  const modelName = getModelShortName(node.model);
  
  // Status indicator
  const statusColor = {
    idle: 'bg-gray-500',
    pending: 'bg-yellow-500',
    running: 'bg-blue-500 animate-pulse',
    done: 'bg-green-500',
    error: 'bg-red-500',
  }[node.status];

  // Stance background
  const stanceClass = {
    support: 'border-green-500/30',
    oppose: 'border-red-500/30',
    neutral: 'border-gray-500/30',
  }[node.stance || 'neutral'];

  return (
    <button
      onClick={onClick}
      className={`
        relative p-2 rounded border transition-all text-left
        ${isSelected ? 'bg-civic-accent/10 border-civic-accent' : `bg-civic-elevated ${stanceClass}`}
        hover:bg-civic-muted/30
      `}
    >
      {/* Status indicator */}
      <div className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${statusColor}`} />
      
      {/* Edited indicator */}
      {node.isEdited && (
        <div className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-civic-accent" />
      )}
      
      {/* Avatar and name */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-base">{node.avatar}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-medium text-civic-text truncate">
            {node.name.split(' ')[0]}
          </div>
        </div>
      </div>
      
      {/* Model chip */}
      <div className={`
        text-[8px] px-1.5 py-0.5 rounded border
        ${modelColors.bg} ${modelColors.text} ${modelColors.border}
      `}>
        {modelName}
      </div>
    </button>
  );
}
