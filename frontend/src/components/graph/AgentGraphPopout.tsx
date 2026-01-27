import { useState, useEffect, useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import { useCivicStore } from '../../store';
import { ForceGraph } from './ForceGraph';
import { GraphFiltersBar } from './GraphFilters';
import { NodePopover } from './NodePopover';
import type { GraphNode, GraphFilters } from './graphTypes';

interface AgentGraphPopoutProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string | null;
}

const DEFAULT_FILTERS: GraphFilters = {
  showDMs: true,
  showCalls: true,
  showHistorical: true,
  showActiveOnly: false,
};

export function AgentGraphPopout({
  isOpen,
  onClose,
  sessionId,
}: AgentGraphPopoutProps) {
  const {
    graphNodes,
    graphEdges,
    graphFilters,
    loadGraphData,
    pollActiveCalls,
    setGraphFilters,
    availableModels,
    defaultModel,
  } = useCivicStore();

  const [isLoading, setIsLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize filters if not set
  useEffect(() => {
    if (!graphFilters) {
      setGraphFilters(DEFAULT_FILTERS);
    }
  }, [graphFilters, setGraphFilters]);

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [isOpen]);

  // Load data and start polling when opened
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/833df7df-b87b-44c1-befe-7231bf52dc09',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgentGraphPopout.tsx:useEffect',message:'Graph popout effect triggered',data:{isOpen,sessionId,hasSessionId:!!sessionId},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    if (!isOpen || !sessionId) return;

    // Initial load
    const load = async () => {
      setIsLoading(true);
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/833df7df-b87b-44c1-befe-7231bf52dc09',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgentGraphPopout.tsx:load',message:'Loading graph data',data:{sessionId},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      try {
        await loadGraphData(sessionId);
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/833df7df-b87b-44c1-befe-7231bf52dc09',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgentGraphPopout.tsx:loadSuccess',message:'Graph data loaded successfully',data:{sessionId},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
      } finally {
        setIsLoading(false);
      }
    };
    load();

    // Start polling every 1.5s
    pollingRef.current = setInterval(() => {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/833df7df-b87b-44c1-befe-7231bf52dc09',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgentGraphPopout.tsx:poll',message:'Polling active calls',data:{sessionId},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      pollActiveCalls(sessionId);
    }, 1500);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [isOpen, sessionId, loadGraphData, pollActiveCalls]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedNode) {
          setSelectedNode(null);
        } else {
          onClose();
        }
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose, selectedNode]);

  // Handle node click
  const handleNodeClick = useCallback((node: GraphNode) => {
    // Only show popover for agent nodes
    if (node.type !== 'agent') return;
    
    // Calculate anchor position based on node position in SVG
    // This is approximate - in a real implementation you'd transform coordinates
    const svgRect = containerRef.current?.getBoundingClientRect();
    if (svgRect && node.x !== undefined && node.y !== undefined) {
      setPopoverAnchor({
        x: svgRect.left + node.x,
        y: svgRect.top + 48 + node.y, // Account for filter bar height
      });
    }
    setSelectedNode(node);
  }, []);

  // Reset view - restart simulation
  const handleResetView = useCallback(() => {
    // Force re-render by reloading data
    if (sessionId) {
      loadGraphData(sessionId);
    }
  }, [sessionId, loadGraphData]);

  // Reload data
  const handleReload = useCallback(async () => {
    if (!sessionId) return;
    setIsLoading(true);
    try {
      await loadGraphData(sessionId);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, loadGraphData]);

  if (!isOpen) return null;

  const currentFilters = graphFilters || DEFAULT_FILTERS;

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      {/* Dimmed backdrop */}
      <div 
        className="absolute inset-0 bg-black/80"
        onClick={() => {
          if (selectedNode) {
            setSelectedNode(null);
          } else {
            onClose();
          }
        }}
      />

      {/* Modal container */}
      <div className="relative flex flex-col w-full h-full bg-civic-bg/95 backdrop-blur-sm m-4 rounded-xl border border-civic-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-civic-surface border-b border-civic-border">
          <div className="flex items-center gap-3">
            <span className="text-xl">🌐</span>
            <div>
              <h2 className="font-semibold text-civic-text">Agent Network Graph</h2>
              <p className="text-[10px] text-civic-text-secondary">
                {graphNodes.length} nodes • {graphEdges.length} connections
              </p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-civic-text-secondary hover:text-civic-text hover:bg-civic-elevated transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Filters */}
        <GraphFiltersBar
          filters={currentFilters}
          onFilterChange={(updates) => setGraphFilters({ ...currentFilters, ...updates })}
          onResetView={handleResetView}
          onReload={handleReload}
          isLoading={isLoading}
        />

        {/* Graph container */}
        <div ref={containerRef} className="flex-1 relative overflow-hidden">
          {dimensions.width > 0 && dimensions.height > 0 && (
            <ForceGraph
              nodes={graphNodes}
              edges={graphEdges}
              filters={currentFilters}
              width={dimensions.width}
              height={dimensions.height}
              onNodeClick={handleNodeClick}
            />
          )}
          
          {/* Loading overlay */}
          {isLoading && graphNodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-civic-bg/50">
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-2 border-civic-accent border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-civic-text-secondary">Loading graph data...</span>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && graphNodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <span className="text-4xl mb-3 block">🌐</span>
                <h3 className="text-lg font-medium text-civic-text mb-1">No Graph Data</h3>
                <p className="text-sm text-civic-text-secondary">
                  Start a simulation to see agents and their interactions
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Node popover */}
        <NodePopover
          node={selectedNode}
          anchorX={popoverAnchor.x}
          anchorY={popoverAnchor.y}
          onClose={() => setSelectedNode(null)}
          availableModels={availableModels}
          defaultModel={defaultModel}
        />
      </div>
    </div>
  );
}
