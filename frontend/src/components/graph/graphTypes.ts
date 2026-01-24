/**
 * Types for the force-directed Agent Node Graph
 */

// Node types in the graph
export type GraphNodeType = 'agent' | 'townhall' | 'user' | 'system';

// Call states for nodes
export type CallState = 'idle' | 'pending' | 'running' | 'done' | 'error';

// Stance values
export type Stance = 'support' | 'oppose' | 'neutral';

// Edge types
export type EdgeType = 'dm' | 'call';

// Edge status
export type EdgeStatus = 'pending' | 'running' | 'complete' | 'error';

/**
 * Graph node representing an agent or special node
 */
export interface GraphNode {
  id: string;
  type: GraphNodeType;
  name: string;
  avatar: string;
  role: string;
  model: string | null;
  archetypeStatus: 'default' | 'edited';
  callState: CallState;
  stance: Stance | null;
  
  // D3 force simulation properties (added by d3-force)
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;  // Fixed x position (when dragging)
  fy?: number | null;  // Fixed y position (when dragging)
}

/**
 * Graph edge representing a DM or API call
 */
export interface GraphEdge {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  type: EdgeType;
  lastMessage: string | null;
  stanceBefore: Stance | null;
  stanceAfter: Stance | null;
  timestamp: string | null;
  status: EdgeStatus;
  score: number;
}

/**
 * Filter settings for the graph
 */
export interface GraphFilters {
  showDMs: boolean;
  showCalls: boolean;
  showHistorical: boolean;
  showActiveOnly: boolean;
}

/**
 * Graph data from API
 */
export interface GraphData {
  sessionId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Active call info for polling
 */
export interface ActiveCall {
  agentKey: string;
  status: CallState;
  startedAt: string | null;
  completedAt: string | null;
}

/**
 * Provider colors for model chips
 */
export const PROVIDER_COLORS: Record<string, { bg: string; text: string; border: string; stroke: string }> = {
  'amazon/nova-micro-v1': { 
    bg: 'bg-orange-500/20', 
    text: 'text-orange-400', 
    border: 'border-orange-500/50',
    stroke: '#f97316',  // orange-500
  },
  'anthropic/claude-3-haiku': { 
    bg: 'bg-amber-500/20', 
    text: 'text-amber-400', 
    border: 'border-amber-500/50',
    stroke: '#f59e0b',  // amber-500
  },
  'gemini-2.0-flash-lite-001': { 
    bg: 'bg-blue-500/20', 
    text: 'text-blue-400', 
    border: 'border-blue-500/50',
    stroke: '#3b82f6',  // blue-500
  },
  default: { 
    bg: 'bg-gray-500/20', 
    text: 'text-gray-400', 
    border: 'border-gray-500/50',
    stroke: '#6b7280',  // gray-500
  },
};

/**
 * Node state colors for call states
 */
export const CALL_STATE_COLORS: Record<CallState, { stroke: string; fill: string; animation?: string }> = {
  idle: { stroke: '#475569', fill: '#1e293b' },  // slate-600, slate-800
  pending: { stroke: '#f59e0b', fill: '#1e293b', animation: 'pulse-slow' },  // amber-500
  running: { stroke: '#3b82f6', fill: '#1e293b', animation: 'pulse-fast' },  // blue-500
  done: { stroke: '#22c55e', fill: '#1e293b', animation: 'fade-to-idle' },  // green-500
  error: { stroke: '#ef4444', fill: '#1e293b' },  // red-500
};

/**
 * Edge colors by type
 */
export const EDGE_COLORS: Record<EdgeType, { stroke: string; activeStroke: string }> = {
  dm: { stroke: '#a855f7', activeStroke: '#c084fc' },  // purple-500, purple-400
  call: { stroke: '#14b8a6', activeStroke: '#2dd4bf' },  // teal-500, teal-400
};

/**
 * Get edge opacity based on age
 */
export function getEdgeOpacity(timestamp: string | null): number {
  if (!timestamp) return 0.5;
  
  const ageMinutes = (Date.now() - new Date(timestamp).getTime()) / 60000;
  if (ageMinutes < 1) return 1.0;
  if (ageMinutes < 5) return 0.8;  // "Recent" threshold
  if (ageMinutes < 30) return 0.5;
  return 0.3;
}

/**
 * Get relative time string
 */
export function getRelativeTime(timestamp: string | null): string {
  if (!timestamp) return '';
  
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Get model short name
 */
export function getModelShortName(model: string | null | undefined): string {
  if (!model) return 'Nova';
  if (model.includes('nova')) return 'Nova';
  if (model.includes('claude') || model.includes('haiku')) return 'Haiku';
  if (model.includes('gemini')) return 'Gemini';
  return 'Default';
}

/**
 * Default agents for node data
 */
export const DEFAULT_AGENTS: Record<string, { name: string; avatar: string; role: string }> = {
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
