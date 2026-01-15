import { useMemo } from 'react';
import { HeatmapLayer as DeckHeatmapLayer } from '@deck.gl/aggregation-layers';
import type { SimulationResult } from '../../types';

interface HeatmapLayerProps {
  result: SimulationResult | null;
  clusters: Array<{
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    population: number;
  }>;
}

// This component returns a deck.gl layer, not a React component
// Use it in MapArena's layers array
export function createHeatmapLayer(
  result: SimulationResult | null,
  clusters: Array<{
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    population: number;
  }>
) {
  if (!result || !clusters.length) return null;
  
  // Create data points with scores
  const data = clusters.map(cluster => {
    const regionResult = result.approval_by_region.find(
      r => r.cluster_id === cluster.id || r.cluster_name === cluster.name
    );
    
    return {
      position: [cluster.longitude, cluster.latitude],
      weight: regionResult ? Math.abs(regionResult.score) * cluster.population / 1000 : 0,
      score: regionResult?.score ?? 0,
    };
  });
  
  return new DeckHeatmapLayer({
    id: 'heatmap',
    data,
    getPosition: (d: { position: number[] }) => d.position as [number, number],
    getWeight: (d: { weight: number }) => d.weight,
    radiusPixels: 100,
    intensity: 1,
    threshold: 0.1,
    colorRange: [
      [239, 68, 68, 0],    // Red (oppose) - transparent
      [239, 68, 68, 100],  // Red
      [113, 113, 122, 100], // Gray (neutral)
      [34, 197, 94, 100],   // Green
      [34, 197, 94, 200],   // Green (support) - more opaque
    ],
  });
}

// React wrapper for use in layer management
export function HeatmapLayer({ result, clusters }: HeatmapLayerProps) {
  // This component doesn't render anything directly - layer is created via createHeatmapLayer
  // The useMemo is here for potential future use
  useMemo(() => createHeatmapLayer(result, clusters), [result, clusters]);
  return null;
}

