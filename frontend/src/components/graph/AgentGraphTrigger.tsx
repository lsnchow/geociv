import { useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { useCivicStore } from '../../store';
import { AgentGraphPopout } from './AgentGraphPopout';
import { CALL_STATE_COLORS } from './graphTypes';

// Agent emojis for mini display
const AGENT_AVATARS: Record<string, string> = {
  queens_west: '🏃',
  queens_main: '👩‍🔬',
  union_stuart: '💻',
  kingscourt: '🏡',
  williamsville: '🔧',
  portsmouth: '⛵',
  cataraqui_west: '👨‍👩‍👧',
  highway_15_corridor: '🚛',
  strathcona_park: '🎻',
  victoria_park: '🐕',
  north_end: '👪',
  skeleton_park: '🎨',
  inner_harbour: '🌆',
  sydenham: '✊',
  johnson_triangle: '🛒',
  calvin_park: '🛍️',
  rideau_heights: '🌍',
  henderson: '📰',
  market_square: '🍕',
  cataraqui_centre: '👗',
  lake_ontario_park: '🦆',
};

export function AgentGraphTrigger() {
  const [isOpen, setIsOpen] = useState(false);
  const { sessionId, graphNodes, simulationProgress } = useCivicStore();

  // Count agents by state
  const agentNodes = graphNodes.filter(n => n.type === 'agent');
  const pendingCount = agentNodes.filter(n => n.callState === 'pending').length;
  const runningCount = agentNodes.filter(n => n.callState === 'running').length;
  const doneCount = agentNodes.filter(n => n.callState === 'done').length;
  const errorCount = agentNodes.filter(n => n.callState === 'error').length;
  
  // Use simulation progress if available
  const isSimulating = simulationProgress && simulationProgress.phase !== 'done';
  const activeAgents = runningCount + pendingCount;

  return (
    <>
      {/* Trigger panel */}
      <div className="h-56 border-t border-civic-border flex flex-col bg-civic-surface">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-civic-border">
          <div className="flex items-center gap-2">
            <span className="text-sm">🌐</span>
            <span className="text-xs font-medium text-civic-text">Agent Network</span>
          </div>
          <button
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium
              bg-civic-elevated text-civic-text-secondary hover:text-civic-text 
              hover:bg-civic-muted transition-colors"
          >
            <Maximize2 size={12} />
            Expand
          </button>
        </div>

        {/* Mini agent grid */}
        <div className="flex-1 p-2 overflow-hidden">
          <div className="flex flex-wrap gap-1">
            {Object.entries(AGENT_AVATARS).slice(0, 14).map(([key, avatar]) => {
              const node = graphNodes.find(n => n.id === key);
              const state = node?.callState || 'idle';
              const stateColors = CALL_STATE_COLORS[state];
              
              return (
                <div
                  key={key}
                  className={`
                    w-7 h-7 rounded-full flex items-center justify-center text-sm
                    ${state === 'running' ? 'animate-pulse' : ''}
                    ${state === 'pending' ? 'animate-pulse' : ''}
                  `}
                  style={{
                    backgroundColor: stateColors.fill,
                    border: `2px solid ${stateColors.stroke}`,
                  }}
                  title={key}
                >
                  {avatar}
                </div>
              );
            })}
            {Object.keys(AGENT_AVATARS).length > 14 && (
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] 
                bg-civic-elevated text-civic-text-secondary border border-civic-border">
                +{Object.keys(AGENT_AVATARS).length - 14}
              </div>
            )}
          </div>
        </div>

        {/* Status bar */}
        <div className="px-3 py-2 border-t border-civic-border flex items-center justify-between">
          <div className="flex items-center gap-3 text-[10px]">
            {activeAgents > 0 && (
              <span className="flex items-center gap-1 text-blue-400">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                {activeAgents} active
              </span>
            )}
            {doneCount > 0 && (
              <span className="flex items-center gap-1 text-green-400">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                {doneCount} done
              </span>
            )}
            {errorCount > 0 && (
              <span className="flex items-center gap-1 text-red-400">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                {errorCount} error
              </span>
            )}
            {activeAgents === 0 && doneCount === 0 && errorCount === 0 && (
              <span className="text-civic-text-secondary">
                {Object.keys(AGENT_AVATARS).length} agents ready
              </span>
            )}
          </div>
          
          {isSimulating && simulationProgress && (
            <span className="text-[10px] text-civic-accent">
              {simulationProgress.phase}
            </span>
          )}
        </div>
      </div>

      {/* Fullscreen popout */}
      <AgentGraphPopout
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        sessionId={sessionId}
      />
    </>
  );
}
