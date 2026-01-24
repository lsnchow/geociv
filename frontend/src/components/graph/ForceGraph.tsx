import { useEffect, useRef, useCallback, useState } from 'react';
import * as d3 from 'd3-force';
import { select } from 'd3-selection';
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
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphEdge> | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<GraphEdge | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [nodePositions, setNodePositions] = useState<Map<string, { x: number; y: number }>>(new Map());

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

  // Initialize force simulation
  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    // Create node map for quick lookup
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    
    // Assign initial positions based on node type
    const centerX = width / 2;
    const centerY = height / 2;
    
    nodes.forEach((node, i) => {
      if (node.x === undefined) {
        if (node.type === 'townhall') {
          node.x = centerX;
          node.y = centerY;
        } else if (node.type === 'user') {
          node.x = centerX;
          node.y = 60;
        } else if (node.type === 'system') {
          node.x = centerX;
          node.y = height - 60;
        } else {
          // Arrange agents in a circle around center
          const agentNodes = nodes.filter(n => n.type === 'agent');
          const agentIndex = agentNodes.findIndex(n => n.id === node.id);
          const angle = (agentIndex / agentNodes.length) * 2 * Math.PI - Math.PI / 2;
          const radius = Math.min(width, height) * 0.35;
          node.x = centerX + Math.cos(angle) * radius;
          node.y = centerY + Math.sin(angle) * radius;
        }
      }
    });

    // Create resolved edges with node references
    const resolvedEdges = filteredEdges.map(edge => ({
      ...edge,
      source: nodeMap.get(typeof edge.source === 'string' ? edge.source : edge.source.id) || edge.source,
      target: nodeMap.get(typeof edge.target === 'string' ? edge.target : edge.target.id) || edge.target,
    }));

    // Create simulation
    const simulation = d3.forceSimulation<GraphNode, GraphEdge>(nodes)
      .force('center', d3.forceCenter(centerX, centerY).strength(0.05))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('collide', d3.forceCollide<GraphNode>().radius(45).strength(0.8))
      .force('link', d3.forceLink<GraphNode, GraphEdge>(resolvedEdges)
        .id(d => d.id)
        .distance(120)
        .strength(0.3))
      .alphaDecay(0.02)
      .on('tick', () => {
        // Update positions on each tick
        const newPositions = new Map<string, { x: number; y: number }>();
        nodes.forEach(node => {
          // Constrain to viewport
          node.x = Math.max(40, Math.min(width - 40, node.x || centerX));
          node.y = Math.max(40, Math.min(height - 40, node.y || centerY));
          newPositions.set(node.id, { x: node.x, y: node.y });
        });
        setNodePositions(new Map(newPositions));
      });

    simulationRef.current = simulation;

    return () => {
      simulation.stop();
    };
  }, [nodes, filteredEdges, width, height]);

  // Handle node drag
  const handleDragStart = useCallback((node: GraphNode, event: React.MouseEvent) => {
    if (!simulationRef.current) return;
    simulationRef.current.alphaTarget(0.3).restart();
    node.fx = node.x;
    node.fy = node.y;
  }, []);

  const handleDrag = useCallback((node: GraphNode, event: React.MouseEvent, delta: { dx: number; dy: number }) => {
    node.fx = (node.x || 0) + delta.dx;
    node.fy = (node.y || 0) + delta.dy;
  }, []);

  const handleDragEnd = useCallback((node: GraphNode) => {
    if (!simulationRef.current) return;
    simulationRef.current.alphaTarget(0);
    // Release fixed position gently
    node.fx = null;
    node.fy = null;
  }, []);

  // Edge hover handlers
  const handleEdgeHover = useCallback((edge: GraphEdge, event: React.MouseEvent) => {
    setHoveredEdge(edge);
    setTooltipPos({ x: event.clientX, y: event.clientY });
  }, []);

  const handleEdgeLeave = useCallback(() => {
    setHoveredEdge(null);
    setTooltipPos(null);
  }, []);

  // Get node position
  const getNodePos = (id: string) => {
    return nodePositions.get(id) || { x: width / 2, y: height / 2 };
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
        ref={svgRef}
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
