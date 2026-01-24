import { useMemo, useState } from 'react';
import type { GraphNode, GraphEdge, GraphFilters } from './graphTypes';
import { CALL_STATE_COLORS, EDGE_COLORS, getEdgeOpacity } from './graphTypes';
import { GraphNodeComponent } from './GraphNode';
import { EdgeTooltip } from './EdgeTooltip';

interface ForceGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  filters: GraphFilters;
  width: number;
  height: number;
  onNodeClick: (node: GraphNode) => void;
}

export function ForceGraph({
  nodes,
  edges,
  filters,
  width,
  height,
  onNodeClick,
}: ForceGraphProps) {
  const [hoveredEdge, setHoveredEdge] = useState<GraphEdge | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // Filter edges based on current filters
  const filteredEdges = edges.filter(edge => {
    if (!filters.showDMs && edge.type === 'dm') return false;
    if (!filters.showCalls && edge.type === 'call') return false;
    if (!filters.showHistorical) {
      const opacity = getEdgeOpacity(edge.timestamp);
      if (opacity < 0.5) return false;
    }
    return true;
  });

  // Filter nodes based on filters
  const filteredNodes = filters.showActiveOnly 
    ? nodes.filter(n => n.callState !== 'idle' || n.type === 'townhall' || n.type === 'system')
    : nodes;

  // Deterministic layout (no physics)
  const centerX = width / 2;
  const centerY = height / 2;

  const positions = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>();
    const agents = filteredNodes.filter(n => n.type === 'agent');
    const radius = Math.min(width, height) * 0.32;

    filteredNodes.forEach((node, idx) => {
      if (node.type === 'townhall') {
        pos.set(node.id, { x: centerX, y: centerY });
      } else if (node.type === 'user') {
        pos.set(node.id, { x: centerX, y: 80 });
      } else if (node.type === 'system') {
        pos.set(node.id, { x: centerX, y: height - 80 });
      } else {
        const angle = (idx / Math.max(1, agents.length)) * 2 * Math.PI - Math.PI / 2;
        pos.set(node.id, {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
        });
      }
    });
    return pos;
  }, [filteredNodes, centerX, centerY, width, height]);

  const handleDragStart = () => {};
  const handleDrag = () => {};
  const handleDragEnd = () => {};

  // Edge hover handlers
  const handleEdgeHover = (edge: GraphEdge, event: React.MouseEvent) => {
    setHoveredEdge(edge);
    setTooltipPos({ x: event.clientX, y: event.clientY });
  };

  const handleEdgeLeave = () => {
    setHoveredEdge(null);
    setTooltipPos(null);
  };

  // Get node position
  const getNodePos = (id: string) => {
    return positions.get(id) || { x: width / 2, y: height / 2 };
  };

  // Get edge path
  const getEdgePath = (edge: GraphEdge) => {
    const sourceId = typeof edge.source === 'string' ? edge.source : edge.source.id;
    const targetId = typeof edge.target === 'string' ? edge.target : edge.target.id;
    const source = getNodePos(sourceId);
    const target = getNodePos(targetId);
    return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
  };

  return (
    <div className="relative w-full h-full">
      <svg
        width={width}
        height={height}
        className="bg-slate-950"
      >
        {/* Defs for animations and gradients */}
        <defs>
          {/* Animated dash for active calls */}
          <pattern id="animated-dash" patternUnits="userSpaceOnUse" width="16" height="1">
            <line x1="0" y1="0" x2="8" y2="0" stroke="currentColor" strokeWidth="2">
              <animate
                attributeName="x1"
                from="0"
                to="16"
                dur="0.5s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="x2"
                from="8"
                to="24"
                dur="0.5s"
                repeatCount="indefinite"
              />
            </line>
          </pattern>
          
          {/* Glow filter for running state */}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Edge layer */}
        <g className="edges">
          {filteredEdges.map(edge => {
            const sourceId = typeof edge.source === 'string' ? edge.source : edge.source.id;
            const targetId = typeof edge.target === 'string' ? edge.target : edge.target.id;
            const source = getNodePos(sourceId);
            const target = getNodePos(targetId);
            const opacity = getEdgeOpacity(edge.timestamp);
            const color = edge.type === 'dm' ? EDGE_COLORS.dm.stroke : EDGE_COLORS.call.stroke;
            const isActive = edge.status === 'running' || edge.status === 'pending';
            
            return (
              <g key={edge.id}>
                <line
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke={color}
                  strokeWidth={isActive ? 3 : 2}
                  strokeOpacity={opacity}
                  strokeDasharray={isActive ? '8 4' : undefined}
                  className={isActive ? 'animate-pulse' : ''}
                  onMouseEnter={(e) => handleEdgeHover(edge, e)}
                  onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
                  onMouseLeave={handleEdgeLeave}
                  style={{ cursor: 'pointer' }}
                />
              </g>
            );
          })}
        </g>

        {/* Node layer */}
        <g className="nodes">
          {filteredNodes.map(node => {
            const pos = getNodePos(node.id);
            return (
              <GraphNodeComponent
                key={node.id}
                node={node}
                x={pos.x}
                y={pos.y}
                onClick={() => onNodeClick(node)}
                onDragStart={(e) => handleDragStart(node, e)}
                onDrag={(e, delta) => handleDrag(node, e, delta)}
                onDragEnd={() => handleDragEnd(node)}
              />
            );
          })}
        </g>
      </svg>

      {/* Edge tooltip */}
      {hoveredEdge && tooltipPos && (
        <EdgeTooltip
          edge={hoveredEdge}
          x={tooltipPos.x}
          y={tooltipPos.y}
        />
      )}
    </div>
  );
}
