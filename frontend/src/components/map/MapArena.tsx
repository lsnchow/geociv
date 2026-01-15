import { useCallback, useMemo, useState, Component, type ReactNode } from 'react';
import { Map } from 'react-map-gl/maplibre';
import DeckGL from '@deck.gl/react';
import { TextLayer, PolygonLayer, GeoJsonLayer } from '@deck.gl/layers';
import type { PickingInfo } from '@deck.gl/core';
import { useCivicStore } from '../../store';
import { ProposalMarker } from './ProposalMarker';
import * as aiApi from '../../lib/ai-api';
import type { ZoneDescription } from '../../types/ai';
import type { ZoneSentiment } from '../../types/simulation';
import kingstonZones from '../../data/kingston-zones.json';
import 'maplibre-gl/dist/maplibre-gl.css';

// ============================================================================
// Map Error Boundary - catches WebGL/deck.gl errors and shows recovery UI
// ============================================================================
interface MapErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class MapErrorBoundary extends Component<{ children: ReactNode; onRetry?: () => void }, MapErrorBoundaryState> {
  constructor(props: { children: ReactNode; onRetry?: () => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): Partial<MapErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const isWebGLError = 
      error.message.toLowerCase().includes('webgl') ||
      error.message.toLowerCase().includes('context') ||
      error.message.toLowerCase().includes('deck') ||
      error.message.toLowerCase().includes('gl_');
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/36b22d3a-abef-4d8c-b3d9-d3a34145295b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MapErrorBoundary:catch',message:'Map caught error',data:{errorMsg:error.message,isWebGLError,stack:errorInfo.componentStack?.slice(0,500)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    console.error('[CivicSim] Map render error:', error);
    console.error('[CivicSim] WebGL related:', isWebGLError);
    console.error('[CivicSim] Stack:', errorInfo.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full bg-civic-bg flex items-center justify-center">
          <div className="text-center p-8 max-w-md bg-civic-surface border border-civic-border rounded-lg">
            <div className="text-4xl mb-4">🗺️</div>
            <h2 className="text-lg font-medium text-civic-text mb-2">Map Render Error</h2>
            <p className="text-sm text-civic-text-secondary mb-4">
              The map failed to render. This may be due to a WebGL context loss or graphics driver issue.
            </p>
            {this.state.error && (
              <p className="text-xs font-mono text-civic-oppose mb-4 break-all bg-civic-elevated p-2 rounded">
                {this.state.error.message}
              </p>
            )}
            <div className="flex gap-2 justify-center">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 bg-civic-accent hover:bg-civic-accent-muted text-white text-sm font-medium rounded transition-colors"
              >
                Retry
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-civic-muted hover:bg-civic-border text-civic-text text-sm font-medium rounded transition-colors"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Kingston, Ontario center
const INITIAL_VIEW_STATE = {
  latitude: 44.2312,
  longitude: -76.4860,
  zoom: 12,
  pitch: 0,
  bearing: 0,
};

// Dark map style (using free CartoDB dark matter)
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

interface ClusterPoint {
  id: string;
  name: string;
  position: [number, number];
  population: number;
  score?: number;
  sentiment?: string;
  polygon?: number[][][];
  aiLabel?: string;
}

interface MapArenaProps {
  // Props removed - lasso no longer used
}

// Helper to get sentiment color with transparency based on consensus
function getSentimentColor(sentiment: ZoneSentiment | undefined, isHovered: boolean, isSelected: boolean): [number, number, number, number] {
  const alpha = isSelected ? 180 : isHovered ? 140 : 100;
  
  if (!sentiment) return [80, 80, 90, 60]; // Default gray
  
  const score = sentiment.score;
  // Green: score > 0.15 (net support)
  // Red: score < -0.15 (net oppose)
  // Yellow: neutral (-0.15 to 0.15)
  if (score > 0.15) return [34, 197, 94, alpha]; // Green for support
  if (score < -0.15) return [239, 68, 68, alpha]; // Red for oppose
  return [251, 191, 36, alpha]; // Yellow for neutral
}

function getSentimentBorderColor(sentiment: ZoneSentiment | undefined, isSelected: boolean): [number, number, number, number] {
  if (isSelected) return [96, 165, 250, 255]; // Blue when selected
  
  if (!sentiment) return [100, 100, 110, 200];
  
  const score = sentiment.score;
  if (score > 0.15) return [34, 197, 94, 255];
  if (score < -0.15) return [239, 68, 68, 255];
  return [251, 191, 36, 255];
}

export function MapArena({}: MapArenaProps) {
  const {
    scenario,
    simulationResult,
    activeProposal,
    proposalPosition,
    isDragging,
    draggedCard,
    setProposalPosition,
    setIsDragging,
    zoneSentiments,
    selectedZoneId,
    setSelectedZoneId,
  } = useCivicStore();
  
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const [hoverInfo, setHoverInfo] = useState<PickingInfo | null>(null);
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);
  const [zoneDescription, setZoneDescription] = useState<ZoneDescription | null>(null);
  const [isLoadingZone, setIsLoadingZone] = useState(false);

  // Convert clusters to map points with scores
  const clusterPoints: ClusterPoint[] = useMemo(() => {
    if (!scenario?.clusters) return [];
    
    return scenario.clusters.map(cluster => {
      const regionResult = simulationResult?.approval_by_region?.find(
        r => r.cluster_id === cluster.id || r.cluster_name === cluster.name
      );
      
      return {
        id: cluster.id,
        name: cluster.name,
        position: [cluster.longitude, cluster.latitude] as [number, number],
        population: cluster.population,
        score: regionResult?.score,
        sentiment: regionResult?.sentiment,
        polygon: cluster.polygon?.coordinates,
        aiLabel: cluster.ai_label,
      };
    });
  }, [scenario, simulationResult]);

  // Polygon layer for zones with real boundaries (legacy - from scenario clusters)
  const polygonLayer = useMemo(() => {
    const polygonClusters = clusterPoints.filter(c => c.polygon);
    if (!polygonClusters.length) return null;
    
    return new PolygonLayer({
      id: 'zone-polygons',
      data: polygonClusters,
      pickable: true,
      stroked: true,
      filled: true,
      wireframe: false,
      lineWidthMinPixels: 2,
      getPolygon: (d: ClusterPoint) => d.polygon![0],
      getElevation: 0,
      getFillColor: (d: ClusterPoint) => {
        if (d.score === undefined) return [50, 50, 55, 100];
        if (d.score > 20) return [34, 197, 94, Math.min(200, 80 + Math.abs(d.score) * 1.2)];
        if (d.score < -20) return [239, 68, 68, Math.min(200, 80 + Math.abs(d.score) * 1.2)];
        return [113, 113, 122, 100];
      },
      getLineColor: (d: ClusterPoint) => {
        const isSelected = d.id === selectedZoneId;
        if (isSelected) return [96, 165, 250, 255];
        if (d.score === undefined) return [63, 63, 70, 255];
        if (d.score > 20) return [34, 197, 94, 255];
        if (d.score < -20) return [239, 68, 68, 255];
        return [113, 113, 122, 255];
      },
      getLineWidth: (d: ClusterPoint) => d.id === selectedZoneId ? 3 : 1,
      updateTriggers: {
        getFillColor: [simulationResult],
        getLineColor: [simulationResult, selectedZoneId],
        getLineWidth: [selectedZoneId],
      },
    });
  }, [clusterPoints, simulationResult, selectedZoneId]);

  // GeoJSON zone layer with sentiment colors (from multi-agent simulation)
  const sentimentZoneLayer = useMemo(() => {
    // Merge zone data with sentiment data
    const features = kingstonZones.features.map(feature => {
      const zoneId = feature.properties.id;
      const sentiment = zoneSentiments.find(z => z.zone_id === zoneId);
      return {
        ...feature,
        properties: {
          ...feature.properties,
          sentiment,
        },
      };
    });

    return new GeoJsonLayer({
      id: 'sentiment-zones',
      // @ts-expect-error - GeoJsonLayer data type is overly strict
      data: { type: 'FeatureCollection', features },
      pickable: true,
      stroked: true,
      filled: true,
      lineWidthMinPixels: 2,
      getFillColor: (d: { properties: { id: string; sentiment?: ZoneSentiment } }) => {
        const props = d.properties;
        const isHovered = props.id === hoveredZoneId;
        const isSelected = props.id === selectedZoneId;
        return getSentimentColor(props.sentiment, isHovered, isSelected);
      },
      getLineColor: (d: { properties: { id: string; sentiment?: ZoneSentiment } }) => {
        const props = d.properties;
        const isSelected = props.id === selectedZoneId;
        return getSentimentBorderColor(props.sentiment, isSelected);
      },
      getLineWidth: (d: { properties: { id: string } }) => {
        const props = d.properties;
        return props.id === selectedZoneId ? 4 : 2;
      },
      onHover: (info: PickingInfo) => {
        if (info.object) {
          const props = (info.object as { properties: { id: string } }).properties;
          setHoveredZoneId(props.id);
        } else {
          setHoveredZoneId(null);
        }
      },
      updateTriggers: {
        getFillColor: [zoneSentiments, hoveredZoneId, selectedZoneId],
        getLineColor: [zoneSentiments, selectedZoneId],
        getLineWidth: [selectedZoneId],
      },
    });
  }, [zoneSentiments, hoveredZoneId, selectedZoneId]);

  // Zone name labels (visible at certain zoom levels)
  const zoneLabelLayer = useMemo(() => {
    // Calculate centroid for each zone polygon
    const labelData = kingstonZones.features.map(feature => {
      const coords = feature.geometry.coordinates[0] as number[][];
      // Simple centroid calculation
      const centroid = coords.reduce(
        (acc, coord) => [acc[0] + coord[0], acc[1] + coord[1]],
        [0, 0]
      );
      const n = coords.length;
      
      const sentiment = zoneSentiments.find(z => z.zone_id === feature.properties.id);
      const scoreText = sentiment 
        ? (sentiment.score > 0 ? '+' : '') + (sentiment.score * 100).toFixed(0) + '%'
        : '';
      
      return {
        id: feature.properties.id,
        name: feature.properties.name,
        position: [centroid[0] / n, centroid[1] / n] as [number, number],
        scoreText,
        sentiment,
      };
    });

    return new TextLayer({
      id: 'zone-labels',
      data: labelData,
      pickable: false,
      getPosition: (d: typeof labelData[0]) => d.position,
      getText: (d: typeof labelData[0]) => {
        // Show name + score at higher zoom, just name at lower zoom
        if (viewState.zoom >= 12.5 && d.scoreText) {
          return `${d.name}\n${d.scoreText}`;
        }
        return d.name;
      },
      getSize: viewState.zoom >= 13 ? 14 : viewState.zoom >= 12 ? 12 : 10,
      getColor: [250, 250, 250, 220],
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'center',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontWeight: 600,
      outlineWidth: 2,
      outlineColor: [0, 0, 0, 180],
      // Only show labels at zoom >= 11
      visible: viewState.zoom >= 11,
      updateTriggers: {
        getText: [zoneSentiments, viewState.zoom],
        getSize: [viewState.zoom],
      },
    });
  }, [zoneSentiments, viewState.zoom]);

  // Fetch zone description
  const fetchZoneDescription = useCallback(async (clusterId: string) => {
    if (!scenario) return;
    
    setIsLoadingZone(true);
    try {
      const response = await aiApi.describeZone({
        scenario_id: scenario.id,
        cluster_id: clusterId,
        current_proposal: activeProposal || undefined,
      });
      
      if (response.success && response.description) {
        setZoneDescription(response.description);
      }
    } catch (error) {
      console.error('Failed to fetch zone description:', error);
    } finally {
      setIsLoadingZone(false);
    }
  }, [scenario, activeProposal]);

  // Handle map click for placing proposals or selecting zones
  const handleMapClick = useCallback((info: PickingInfo) => {
    if (!info.coordinate) return;
    
    const [lng, lat] = info.coordinate;
    
    // If clicking on a sentiment zone (from multi-agent simulation)
    if (info.object && info.layer?.id === 'sentiment-zones') {
      const props = (info.object as { properties: { id: string } }).properties;
      setSelectedZoneId(props.id);
      return;
    }
    
    // If clicking on a cluster, select it
    if (info.object && (info.layer?.id === 'clusters' || info.layer?.id === 'zone-polygons')) {
      const cluster = info.object as ClusterPoint;
      setSelectedZoneId(cluster.id);
      fetchZoneDescription(cluster.id);
      return;
    }
    
    // Deselect zone if clicking elsewhere
    if (selectedZoneId) {
      setSelectedZoneId(null);
      setZoneDescription(null);
    }
    
    // If we have an active spatial proposal or are dragging, set its position
    if (activeProposal?.type === 'spatial' || draggedCard?.type === 'spatial') {
      setProposalPosition({ lat, lng });
    }
  }, [activeProposal, draggedCard, setProposalPosition, selectedZoneId, setSelectedZoneId, fetchZoneDescription]);

  // Handle drag over for drop zone
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  // Handle drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const { latitude, longitude, zoom } = viewState;
    const scale = Math.pow(2, zoom);
    const worldSize = 512 * scale;
    
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    const dx = (x - centerX) / worldSize * 360;
    const dy = (centerY - y) / worldSize * 360;
    
    const lng = longitude + dx;
    const lat = latitude + dy * Math.cos(latitude * Math.PI / 180);
    
    setProposalPosition({ lat, lng });
    setIsDragging(false);
  }, [viewState, setProposalPosition, setIsDragging]);

  const layers = useMemo(() => {
    const result = [];
    // Add sentiment zones first (below other layers)
    if (sentimentZoneLayer) result.push(sentimentZoneLayer);
    if (polygonLayer) result.push(polygonLayer);
    // Zone labels on top
    if (zoneLabelLayer) result.push(zoneLabelLayer);
    return result;
  }, [sentimentZoneLayer, polygonLayer, zoneLabelLayer]);

  return (
    <div 
      className="relative w-full h-full"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <MapErrorBoundary>
        <DeckGL
          viewState={viewState}
          onViewStateChange={({ viewState: vs }) => setViewState(vs as typeof viewState)}
          controller={true}
          layers={layers}
          onClick={handleMapClick}
          onHover={setHoverInfo}
          onError={(error) => {
            console.error('[CivicSim] DeckGL/WebGL error:', error);
            // Log additional context for debugging
            console.error('[CivicSim] Active layers:', layers.map(l => l?.id).filter(Boolean));
          }}
          getCursor={({ isDragging: d }) => {
            if (d) return 'grabbing';
            if (isDragging) return 'copy';
            return 'grab';
          }}
        >
          <Map mapStyle={MAP_STYLE} />
        </DeckGL>
      </MapErrorBoundary>
      
      {/* Proposal marker overlay */}
      {proposalPosition && activeProposal?.type === 'spatial' && (
        <ProposalMarker
          position={proposalPosition}
          proposal={activeProposal}
          viewState={viewState}
        />
      )}
      
      {/* Zone sentiment panel (from multi-agent simulation) */}
      {selectedZoneId && zoneSentiments.length > 0 && (() => {
        const zoneSentiment = zoneSentiments.find(z => z.zone_id === selectedZoneId);
        const zoneInfo = kingstonZones.features.find(f => f.properties.id === selectedZoneId);
        if (!zoneSentiment && !zoneInfo) return null;
        
        return (
          <div className="absolute left-4 bottom-4 w-80 bg-civic-surface/95 backdrop-blur border border-civic-border rounded-lg shadow-xl overflow-hidden z-20">
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-civic-text">
                  {zoneSentiment?.zone_name || zoneInfo?.properties.name}
                </h3>
                <button
                  onClick={() => setSelectedZoneId(null)}
                  className="text-civic-text-secondary hover:text-civic-text"
                >
                  ✕
                </button>
              </div>
              
              {zoneInfo && (
                <p className="text-xs text-civic-text-secondary">
                  {zoneInfo.properties.description}
                </p>
              )}
              
              {zoneSentiment && (
                <>
                  {/* Sentiment score */}
                  <div className="flex items-center gap-2">
                    <div className={`text-lg font-bold font-mono ${
                      zoneSentiment.score > 0.2 ? 'text-civic-support' :
                      zoneSentiment.score < -0.2 ? 'text-civic-oppose' : 'text-civic-neutral'
                    }`}>
                      {zoneSentiment.score > 0 ? '+' : ''}{(zoneSentiment.score * 100).toFixed(0)}%
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      zoneSentiment.sentiment === 'support' ? 'bg-green-500/20 text-green-400' :
                      zoneSentiment.sentiment === 'oppose' ? 'bg-red-500/20 text-red-400' : 
                      'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {zoneSentiment.sentiment.toUpperCase()}
                    </span>
                  </div>
                  
                  {/* Support quotes */}
                  {zoneSentiment.top_support_quotes.length > 0 && (
                    <div>
                      <h4 className="text-[10px] text-civic-support mb-1">👍 SUPPORTERS</h4>
                      <div className="space-y-1">
                        {zoneSentiment.top_support_quotes.map((q, i) => (
                          <div key={i} className="text-xs text-civic-text-secondary bg-green-500/10 p-2 rounded">
                            <span className="font-medium text-civic-text">{q.agent_name}:</span> "{q.quote}"
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Oppose quotes */}
                  {zoneSentiment.top_oppose_quotes.length > 0 && (
                    <div>
                      <h4 className="text-[10px] text-civic-oppose mb-1">👎 OPPONENTS</h4>
                      <div className="space-y-1">
                        {zoneSentiment.top_oppose_quotes.map((q, i) => (
                          <div key={i} className="text-xs text-civic-text-secondary bg-red-500/10 p-2 rounded">
                            <span className="font-medium text-civic-text">{q.agent_name}:</span> "{q.quote}"
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })()}
      
      {/* Zone description panel (legacy - for clusters without multi-agent sim) */}
      {selectedZoneId && zoneSentiments.length === 0 && (
        <div className="absolute left-4 bottom-4 w-80 bg-civic-surface/95 backdrop-blur border border-civic-border rounded-lg shadow-xl overflow-hidden z-20">
          {isLoadingZone ? (
            <div className="p-4 text-center">
              <div className="animate-pulse text-xl mb-2">🔍</div>
              <p className="text-xs text-civic-text-secondary">Analyzing zone...</p>
            </div>
          ) : zoneDescription ? (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-civic-text">
                  {zoneDescription.primary_character}
                </h3>
                <button
                  onClick={() => {
                    setSelectedZoneId(null);
                    setZoneDescription(null);
                  }}
                  className="text-civic-text-secondary hover:text-civic-text"
                >
                  ✕
                </button>
              </div>
              
              <p className="text-xs text-civic-text-secondary">
                {zoneDescription.description}
              </p>
              
              {/* Archetype breakdown */}
              <div>
                <h4 className="text-[10px] text-civic-text-secondary mb-1">DEMOGRAPHICS</h4>
                <div className="flex flex-wrap gap-1">
                  {zoneDescription.dominant_archetypes.map(a => (
                    <span key={a} className="px-1.5 py-0.5 bg-civic-muted/30 rounded text-[10px] text-civic-text">
                      {a.replace('_', ' ')}
                    </span>
                  ))}
                </div>
              </div>
              
              {/* Recommendations */}
              {zoneDescription.recommended_proposals.length > 0 && (
                <div>
                  <h4 className="text-[10px] text-civic-support mb-1">✓ RECOMMENDED</h4>
                  <div className="text-xs text-civic-text-secondary">
                    {zoneDescription.recommended_proposals.join(', ')}
                  </div>
                </div>
              )}
              
              {zoneDescription.avoid_proposals.length > 0 && (
                <div>
                  <h4 className="text-[10px] text-civic-oppose mb-1">✗ AVOID</h4>
                  <div className="text-xs text-civic-text-secondary">
                    {zoneDescription.avoid_proposals.join(', ')}
                  </div>
                </div>
              )}
              
              {/* Current score */}
              {zoneDescription.current_score !== undefined && (
                <div className="pt-2 border-t border-civic-border">
                  <div className={`text-sm font-mono ${
                    zoneDescription.current_score > 20 ? 'text-civic-support' :
                    zoneDescription.current_score < -20 ? 'text-civic-oppose' : 'text-civic-neutral'
                  }`}>
                    Score: {zoneDescription.current_score > 0 ? '+' : ''}{zoneDescription.current_score.toFixed(0)}
                  </div>
                  {zoneDescription.score_explanation && (
                    <p className="text-[10px] text-civic-text-secondary mt-1">
                      {zoneDescription.score_explanation}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-4">
              <p className="text-xs text-civic-text-secondary">
                Click a zone to see AI analysis
              </p>
            </div>
          )}
        </div>
      )}
      
      {/* Hover tooltip */}
      {hoverInfo?.object && !selectedZoneId && (
        <div
          className="absolute pointer-events-none bg-civic-elevated border border-civic-border rounded-lg px-3 py-2 text-xs shadow-lg z-50"
          style={{
            left: hoverInfo.x + 10,
            top: hoverInfo.y + 10,
          }}
        >
          <div className="font-medium text-civic-text">
            {(hoverInfo.object as ClusterPoint).aiLabel || (hoverInfo.object as ClusterPoint).name}
          </div>
          <div className="text-civic-text-secondary">
            Pop:{' '}
            {typeof (hoverInfo.object as ClusterPoint).population === 'number'
              ? (hoverInfo.object as ClusterPoint).population.toLocaleString()
              : 'n/a'}
          </div>
          {(hoverInfo.object as ClusterPoint).score !== undefined && (
            <div className={`font-mono ${
              (hoverInfo.object as ClusterPoint).score! > 0 ? 'text-civic-support' : 
              (hoverInfo.object as ClusterPoint).score! < 0 ? 'text-civic-oppose' : 'text-civic-neutral'
            }`}>
              {(hoverInfo.object as ClusterPoint).score! > 0 ? '+' : ''}{(hoverInfo.object as ClusterPoint).score!.toFixed(1)} approval
            </div>
          )}
          <div className="text-civic-text-secondary/60 mt-1 text-[10px]">
            Click for AI analysis
          </div>
        </div>
      )}
      
      {/* Drop zone indicator */}
      {isDragging && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="bg-civic-accent/20 border-2 border-dashed border-civic-accent rounded-xl px-8 py-4">
            <span className="text-civic-accent font-medium">Drop to place proposal</span>
          </div>
        </div>
      )}
      
      {/* City Hall marker for citywide proposals */}
      {activeProposal?.type === 'citywide' && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className="bg-civic-elevated border-2 border-civic-accent rounded-full p-4 shadow-lg">
            <span className="text-2xl">🏛️</span>
          </div>
        </div>
      )}
    </div>
  );
}
