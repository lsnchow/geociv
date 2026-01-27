import type { GraphEdge } from './graphTypes';
import { getRelativeTime, EDGE_COLORS } from './graphTypes';

interface EdgeTooltipProps {
  edge: GraphEdge;
  x: number;
  y: number;
}

export function EdgeTooltip({ edge, x, y }: EdgeTooltipProps) {
  // Calculate position (avoid going off screen)
  const tooltipWidth = 260;
  const tooltipHeight = 120;
  const padding = 12;
  
  let left = x + 16;
  let top = y + 16;
  
  if (left + tooltipWidth > window.innerWidth - padding) {
    left = x - tooltipWidth - 16;
  }
  if (top + tooltipHeight > window.innerHeight - padding) {
    top = y - tooltipHeight - 16;
  }

  // Determine edge type info
  const isDM = edge.type === 'dm';
  const color = isDM ? EDGE_COLORS.dm.stroke : EDGE_COLORS.call.stroke;
  
  // Status indicator
  const getStatusIndicator = () => {
    switch (edge.status) {
      case 'pending':
        return <span className="text-amber-400">⏳ Pending</span>;
      case 'running':
        return <span className="text-blue-400 animate-pulse">⚡ Running</span>;
      case 'error':
        return <span className="text-red-400">✗ Error</span>;
      default:
        return <span className="text-green-400">✓ Complete</span>;
    }
  };

  // Get source/target names
  const sourceName = typeof edge.source === 'string' ? edge.source : edge.source.name;
  const targetName = typeof edge.target === 'string' ? edge.target : edge.target.name;

  return (
    <div
      className="fixed z-50 bg-civic-surface border border-civic-border rounded-lg shadow-xl p-3"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${tooltipWidth}px`,
        pointerEvents: 'none',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div 
            className="w-3 h-3 rounded-full" 
            style={{ backgroundColor: color }}
          />
          <span className="text-xs font-medium text-civic-text">
            {isDM ? 'Direct Message' : 'API Call'}
          </span>
        </div>
        <span className="text-[10px] text-civic-text-secondary">
          {getRelativeTime(edge.timestamp)}
        </span>
      </div>

      {/* Connection info */}
      <div className="text-[10px] text-civic-text-secondary mb-2">
        {sourceName} → {targetName}
      </div>

      {/* Message snippet (for DMs) */}
      {isDM && edge.lastMessage && (
        <div className="bg-civic-elevated rounded p-2 mb-2">
          <p className="text-[11px] text-civic-text line-clamp-2 italic">
            "{edge.lastMessage}"
          </p>
        </div>
      )}

      {/* Stance change */}
      {edge.stanceBefore && edge.stanceAfter && edge.stanceBefore !== edge.stanceAfter && (
        <div className="flex items-center gap-2 text-[10px] mb-2">
          <span className="text-civic-text-secondary">Stance:</span>
          <span className={`font-medium ${
            edge.stanceBefore === 'support' ? 'text-green-400' :
            edge.stanceBefore === 'oppose' ? 'text-red-400' :
            'text-gray-400'
          }`}>
            {edge.stanceBefore}
          </span>
          <span className="text-civic-text-secondary">→</span>
          <span className={`font-medium ${
            edge.stanceAfter === 'support' ? 'text-green-400' :
            edge.stanceAfter === 'oppose' ? 'text-red-400' :
            'text-gray-400'
          }`}>
            {edge.stanceAfter}
          </span>
        </div>
      )}

      {/* Status */}
      <div className="flex items-center justify-between pt-2 border-t border-civic-border">
        <div className="text-[10px]">
          {getStatusIndicator()}
        </div>
        {edge.score !== 0 && (
          <div className="text-[10px] text-civic-text-secondary">
            Score: <span className={edge.score > 0 ? 'text-green-400' : 'text-red-400'}>
              {edge.score > 0 ? '+' : ''}{edge.score.toFixed(2)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
