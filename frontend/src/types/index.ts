// Proposal Types
export type ProposalType = 'spatial' | 'citywide';

export type SpatialProposalType = 
  | 'park'
  | 'upzone'
  | 'transit_line'
  | 'factory'
  | 'housing_development'
  | 'commercial_development'
  | 'bike_lane'
  | 'community_center';

export type CitywideProposalType =
  | 'tax_increase'
  | 'tax_decrease'
  | 'subsidy'
  | 'regulation'
  | 'transit_funding'
  | 'housing_policy'
  | 'environmental_policy';

export interface SpatialProposal {
  type: 'spatial';
  spatial_type: SpatialProposalType;
  title: string;
  description?: string;
  latitude: number;
  longitude: number;
  radius_km?: number;
  scale?: number;
  includes_affordable_housing?: boolean;
  includes_green_space?: boolean;
  includes_transit_access?: boolean;
}

export interface CitywideProposal {
  type: 'citywide';
  citywide_type: CitywideProposalType;
  title: string;
  description?: string;
  amount?: number;
  percentage?: number;
  income_targeted?: boolean;
  target_income_level?: 'low' | 'middle' | 'high' | 'all';
}

export type Proposal = SpatialProposal | CitywideProposal;

// Simulation Results
export interface ArchetypeApproval {
  archetype_key: string;
  archetype_name: string;
  score: number;
  population_pct: number;
  sentiment: string;
  top_driver?: string;
  driver_direction?: string;
}

export interface RegionApproval {
  cluster_id: string;
  cluster_name: string;
  score: number;
  exposure: number;
  population: number;
  sentiment: string;
}

export interface MetricDriver {
  metric_key: string;
  metric_name: string;
  delta: number;
  direction: 'positive' | 'negative' | 'neutral';
  magnitude: 'low' | 'medium' | 'high';
  contribution: number;
  explanation: string;
}

export interface DebugInfo {
  seed: number;
  lambda_decay: number;
  total_population: number;
  cluster_count: number;
  exposure_values: Record<string, number>;
  raw_utility_scores: Record<string, number>;
}

export interface NarrativeResponse {
  summary: string;
  archetype_quotes: Record<string, string>;
  compromise_suggestion?: string;
}

export interface SimulationResult {
  overall_approval: number;
  overall_sentiment: string;
  approval_by_archetype: ArchetypeApproval[];
  approval_by_region: RegionApproval[];
  top_drivers: MetricDriver[];
  metric_deltas: Record<string, number>;
  narrative?: NarrativeResponse;
  debug?: DebugInfo;
}

// GeoJSON Types
export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][]; // [[[lng, lat], ...]]
}

// Scenario Types
export interface Cluster {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  population: number;
  baseline_metrics?: Record<string, number>;
  polygon?: GeoJSONPolygon;  // Optional polygon boundary
  ai_label?: string;          // AI-generated zone label
}

export interface Scenario {
  id: string;
  name: string;
  description?: string;
  seed: number;
  lambda_decay: number;
  baseline_metrics: Record<string, number>;
  clusters: Cluster[];
  created_at: string;
}

export interface ScenarioSummary {
  id: string;
  name: string;
  description?: string;
  cluster_count: number;
  total_population: number;
  created_at: string;
}

// History Entry
export interface HistoryEntry {
  id: string;
  timestamp: string;
  scenario_id: string;
  scenario_name: string;
  proposal: Proposal;
  result: SimulationResult;
}

// Proposal Card (for palette)
export interface ProposalCard {
  id: string;
  type: ProposalType;
  subtype: SpatialProposalType | CitywideProposalType;
  name: string;
  icon: string;
  description: string;
  category: 'build' | 'policy';
}

