import { RefreshCw, RotateCcw } from 'lucide-react';
import type { GraphFilters } from './graphTypes';
import { EDGE_COLORS } from './graphTypes';

interface GraphFiltersProps {
  filters: GraphFilters;
  onFilterChange: (updates: Partial<GraphFilters>) => void;
  onResetView: () => void;
  onReload: () => void;
  isLoading?: boolean;
}

export function GraphFiltersBar({
  filters,
  onFilterChange,
  onResetView,
  onReload,
  isLoading,
}: GraphFiltersProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-civic-elevated border-b border-civic-border">
      {/* Filter toggles */}
      <div className="flex items-center gap-2">
        {/* Show DMs */}
        <button
          onClick={() => onFilterChange({ showDMs: !filters.showDMs })}
          className={`
            flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all
            ${filters.showDMs 
              ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50' 
              : 'bg-civic-surface text-civic-text-secondary border border-civic-border hover:border-civic-muted'
            }
          `}
        >
          <div 
            className="w-2.5 h-0.5 rounded"
            style={{ backgroundColor: EDGE_COLORS.dm.stroke }}
          />
          DMs
        </button>

        {/* Show Calls */}
        <button
          onClick={() => onFilterChange({ showCalls: !filters.showCalls })}
          className={`
            flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all
            ${filters.showCalls 
              ? 'bg-teal-500/20 text-teal-400 border border-teal-500/50' 
              : 'bg-civic-surface text-civic-text-secondary border border-civic-border hover:border-civic-muted'
            }
          `}
        >
          <div 
            className="w-2.5 h-0.5 rounded"
            style={{ backgroundColor: EDGE_COLORS.call.stroke }}
          />
          Calls
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-civic-border mx-1" />

        {/* Show Historical */}
        <button
          onClick={() => onFilterChange({ showHistorical: !filters.showHistorical })}
          className={`
            flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all
            ${filters.showHistorical 
              ? 'bg-civic-accent/20 text-civic-accent border border-civic-accent/50' 
              : 'bg-civic-surface text-civic-text-secondary border border-civic-border hover:border-civic-muted'
            }
          `}
        >
          📜 Historical
        </button>

        {/* Show Active Only */}
        <button
          onClick={() => onFilterChange({ showActiveOnly: !filters.showActiveOnly })}
          className={`
            flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all
            ${filters.showActiveOnly 
              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50' 
              : 'bg-civic-surface text-civic-text-secondary border border-civic-border hover:border-civic-muted'
            }
          `}
        >
          ⚡ Active Only
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Legend */}
      <div className="flex items-center gap-3 text-[10px] text-civic-text-secondary">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-slate-600 border border-slate-500" />
          Idle
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          Pending
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
          Running
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          Done
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          Error
        </div>
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-civic-border mx-2" />

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={onResetView}
          className="p-1.5 rounded text-civic-text-secondary hover:text-civic-text hover:bg-civic-surface transition-colors"
          title="Reset View"
        >
          <RotateCcw size={14} />
        </button>
        <button
          onClick={onReload}
          disabled={isLoading}
          className={`
            p-1.5 rounded transition-colors
            ${isLoading 
              ? 'text-civic-accent animate-spin' 
              : 'text-civic-text-secondary hover:text-civic-text hover:bg-civic-surface'
            }
          `}
          title="Reload Data"
        >
          <RefreshCw size={14} />
        </button>
      </div>
    </div>
  );
}
