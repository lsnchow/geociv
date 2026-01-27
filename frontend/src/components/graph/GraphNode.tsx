import { useState, useCallback, useRef } from 'react';
import type { GraphNode, CallState } from './graphTypes';
import { CALL_STATE_COLORS } from './graphTypes';

interface GraphNodeComponentProps {
  node: GraphNode;
  x: number;
  y: number;
  onClick: () => void;
  onDragStart: (e: React.MouseEvent) => void;
  onDrag: (e: React.MouseEvent, delta: { dx: number; dy: number }) => void;
  onDragEnd: () => void;
}

export function GraphNodeComponent({
  node,
  x,
  y,
  onClick,
  onDragStart,
  onDrag,
  onDragEnd,
}: GraphNodeComponentProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const stateColors = CALL_STATE_COLORS[node.callState];
  
  // Node radius based on type
  const radius = node.type === 'townhall' ? 35 : node.type === 'system' ? 30 : 28;
  
  // Handle mouse events for dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    lastPos.current = { x: e.clientX, y: e.clientY };
    onDragStart(e);
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (lastPos.current) {
        const dx = moveEvent.clientX - lastPos.current.x;
        const dy = moveEvent.clientY - lastPos.current.y;
        lastPos.current = { x: moveEvent.clientX, y: moveEvent.clientY };
        onDrag(moveEvent as unknown as React.MouseEvent, { dx, dy });
      }
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
      lastPos.current = null;
      onDragEnd();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [onDragStart, onDrag, onDragEnd]);

  // Get animation class based on call state
  const getAnimationClass = (state: CallState): string => {
    switch (state) {
      case 'pending':
        return 'animate-pulse-slow';
      case 'running':
        return 'animate-pulse';
      case 'done':
        return 'animate-fade-out';
      default:
        return '';
    }
  };

  return (
    <g
      transform={`translate(${x}, ${y})`}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => {
        if (!isDragging) {
          e.stopPropagation();
          onClick();
        }
      }}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      {/* Outer glow for running state */}
      {node.callState === 'running' && (
        <circle
          r={radius + 8}
          fill="none"
          stroke={stateColors.stroke}
          strokeWidth={2}
          opacity={0.3}
          className="animate-ping"
        />
      )}
      
      {/* Main circle with state border */}
      <circle
        r={radius}
        fill={stateColors.fill}
        stroke={stateColors.stroke}
        strokeWidth={node.callState === 'idle' ? 2 : 3}
        className={getAnimationClass(node.callState)}
      />
      
      {/* Avatar emoji */}
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={node.type === 'townhall' ? 24 : 20}
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {node.avatar}
      </text>
      
      {/* Node label (shown on hover) */}
      {isHovered && (
        <g>
          <rect
            x={-60}
            y={radius + 6}
            width={120}
            height={22}
            rx={4}
            fill="rgba(15, 23, 42, 0.95)"
            stroke="rgba(71, 85, 105, 0.5)"
            strokeWidth={1}
          />
          <text
            y={radius + 18}
            textAnchor="middle"
            fill="#e2e8f0"
            fontSize={11}
            fontWeight={500}
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            {node.name}
          </text>
        </g>
      )}
      
      {/* Provider chip removed per request */}
      
      {/* Edited badge (if archetype is modified) */}
      {node.archetypeStatus === 'edited' && (
        <g transform={`translate(${radius - 4}, ${-radius + 4})`}>
          <circle r={8} fill="#f59e0b" />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fill="#000"
            fontSize={10}
            fontWeight={700}
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            ✎
          </text>
        </g>
      )}
      
      {/* Stance indicator (if stance is set) */}
      {node.stance && (
        <g transform={`translate(${-radius + 4}, ${-radius + 4})`}>
          <circle
            r={8}
            fill={
              node.stance === 'support' ? '#22c55e' :
              node.stance === 'oppose' ? '#ef4444' :
              '#6b7280'
            }
          />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fill="#fff"
            fontSize={8}
            fontWeight={700}
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            {node.stance === 'support' ? '✓' : node.stance === 'oppose' ? '✗' : '?'}
          </text>
        </g>
      )}
    </g>
  );
}
