import { useCallback, useMemo, useState, Component, type ReactNode } from 'react';
import { Map } from 'react-map-gl/maplibre';
import DeckGL from '@deck.gl/react';
import { TextLayer, PolygonLayer, GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
import type { PickingInfo } from '@deck.gl/core';
import { useCivicStore, createProposalFromCard } from '../../store';
// ProposalMarker removed - using deck.gl placedMarkerLayer instead
import { BuildProposalPanel } from './BuildProposalPanel';
import * as aiApi from '../../lib/ai-api';
import type { ZoneDescription } from '../../types/ai';
import type { ZoneSentiment, AgentReaction } from '../../types/simulation';
import type { SpatialProposal, RegionImpact } from '../../types';
import { 
  snapToGrid, 
  calculateCentroid, 
  rankRegionsByDistance, 
  findContainingZone,
  getGridCellCorners,
  type ZoneCentroid 
} from '../../lib/grid-utils';
import kingstonZones from '../../data/kingston-zones.json';
import 'maplibre-gl/dist/maplibre-gl.css';

// Default agent avatars by region (agent_key == region_id)
const DEFAULT_AGENTS: Record<string, { avatar: string; name: string; role: string }> = {
  north_end: { avatar: '👨‍👩‍👧‍👦', name: 'Patricia Lawson', role: 'North End Parent' },
  university: { avatar: '🎓', name: 'Jordan Okafor', role: "Queen's Student Rep" },
  west_kingston: { avatar: '🏡', name: 'Helen Drummond', role: 'West End Homeowner' },
  downtown: { avatar: '☕', name: 'Marcus Chen', role: 'Downtown Business Owner' },
  industrial: { avatar: '🏭', name: 'Dave Kowalski', role: 'Trades & Jobs Advocate' },
  waterfront_west: { avatar: '🌊', name: 'Priya Sharma', role: 'Waterfront Housing Renter' },
  sydenham: { avatar: '✊', name: 'Keisha Williams', role: 'Sydenham Organizer' },
};

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
    setActiveProposal,
    setProposalPosition,
    setIsDragging,
    setDraggedCard,
    placedItems,
    commitPlacement,
    removePlacedItem,
    selectedPlacedItemId,
    setSelectedPlacedItemId,
    zoneSentiments,
    selectedZoneId,
    setSelectedZoneId,
    agentSimulation,
    setTargetAgent,
    setSpeakingAsAgent,
  } = useCivicStore();
  
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const [hoverInfo, setHoverInfo] = useState<PickingInfo | null>(null);
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);
  const [_zoneDescription, setZoneDescription] = useState<ZoneDescription | null>(null);
  const [_isLoadingZone, setIsLoadingZone] = useState(false);
  // Suppress unused variable warnings - these are used by setters
  void _zoneDescription; void _isLoadingZone;
  
  // Build mode state - ghost marker during drag
  const [dragGhostPosition, setDragGhostPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [highlightedZoneId, setHighlightedZoneId] = useState<string | null>(null);
  const [showBuildPanel, setShowBuildPanel] = useState(false);

  // Precompute zone centroids for proximity calculations
  const zoneCentroids: ZoneCentroid[] = useMemo(() => {
    return kingstonZones.features.map(feature => {
      const coords = feature.geometry.coordinates[0] as number[][];
      const centroid = calculateCentroid(coords);
      return {
        zone_id: feature.properties.id,
        zone_name: feature.properties.name,
        lat: centroid.lat,
        lng: centroid.lng,
      };
    });
  }, []);
  
  // Zone polygons for containment check
  const zonePolygons = useMemo(() => {
    return kingstonZones.features.map(feature => ({
      id: feature.properties.id,
      name: feature.properties.name,
      coordinates: feature.geometry.coordinates[0] as number[][],
    }));
  }, []);

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
        const isDragTarget = props.id === highlightedZoneId;
        // During drag, highlight the target zone
        if (isDragTarget) return [139, 92, 246, 100]; // Purple highlight
        return getSentimentColor(props.sentiment, isHovered, isSelected);
      },
      getLineColor: (d: { properties: { id: string; sentiment?: ZoneSentiment } }) => {
        const props = d.properties;
        const isSelected = props.id === selectedZoneId;
        const isDragTarget = props.id === highlightedZoneId;
        // During drag, highlight the target zone border
        if (isDragTarget) return [139, 92, 246, 255]; // Purple border
        return getSentimentBorderColor(props.sentiment, isSelected);
      },
      getLineWidth: (d: { properties: { id: string } }) => {
        const props = d.properties;
        const isDragTarget = props.id === highlightedZoneId;
        if (isDragTarget) return 4;
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
        getFillColor: [zoneSentiments, hoveredZoneId, selectedZoneId, highlightedZoneId],
        getLineColor: [zoneSentiments, selectedZoneId, highlightedZoneId],
        getLineWidth: [selectedZoneId, highlightedZoneId],
      },
    });
  }, [zoneSentiments, hoveredZoneId, selectedZoneId, highlightedZoneId]);

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
      
      // Find the regional agent for this zone (agent_key == zone_id)
      // Use simulation data if available, otherwise fall back to defaults
      const simAgent = agentSimulation?.reactions.find(r => r.agent_key === feature.properties.id);
      const defaultAgent = DEFAULT_AGENTS[feature.properties.id];
      const avatar = simAgent?.avatar || defaultAgent?.avatar || '';
      
      return {
        id: feature.properties.id,
        name: feature.properties.name,
        position: [centroid[0] / n, centroid[1] / n] as [number, number],
        scoreText,
        sentiment,
        avatar,
      };
    });

    return new TextLayer({
      id: 'zone-labels',
      data: labelData,
      pickable: false,
      getPosition: (d: typeof labelData[0]) => d.position,
      getText: (d: typeof labelData[0]) => {
        // Show avatar + name + score at higher zoom, just name at lower zoom
        if (viewState.zoom >= 12.5) {
          const parts = [];
          if (d.avatar) parts.push(d.avatar);
          parts.push(d.name);
          if (d.scoreText) parts.push(d.scoreText);
          return parts.join('\n');
        }
        // At medium zoom, show avatar + name
        if (d.avatar && viewState.zoom >= 11.5) {
          return `${d.avatar}\n${d.name}`;
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
        getText: [zoneSentiments, agentSimulation, viewState.zoom],
        getSize: [viewState.zoom],
      },
    });
  }, [zoneSentiments, agentSimulation, viewState.zoom]);

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
    
    // B3: If clicking on a committed/placed item, select it for deletion
    if (info.object && info.layer?.id === 'committed-items-icon') {
      const item = info.object as { id: string };
      setSelectedPlacedItemId(item.id);
      return;
    }
    
    // If clicking on a sentiment zone (from multi-agent simulation)
    if (info.object && info.layer?.id === 'sentiment-zones') {
      const props = (info.object as { properties: { id: string } }).properties;
      setSelectedZoneId(props.id);
      setSelectedPlacedItemId(null); // Clear placed item selection
      return;
    }
    
    // If clicking on a cluster, select it
    if (info.object && (info.layer?.id === 'clusters' || info.layer?.id === 'zone-polygons')) {
      const cluster = info.object as ClusterPoint;
      setSelectedZoneId(cluster.id);
      fetchZoneDescription(cluster.id);
      setSelectedPlacedItemId(null); // Clear placed item selection
      return;
    }
    
    // Deselect zone and placed item if clicking elsewhere
    if (selectedZoneId) {
      setSelectedZoneId(null);
      setZoneDescription(null);
    }
    if (selectedPlacedItemId) {
      setSelectedPlacedItemId(null);
    }
    
    // If we have an active spatial proposal or are dragging, set its position
    if (activeProposal?.type === 'spatial' || draggedCard?.type === 'spatial') {
      setProposalPosition({ lat, lng });
    }
  }, [activeProposal, draggedCard, setProposalPosition, selectedZoneId, setSelectedZoneId, fetchZoneDescription, selectedPlacedItemId]);

  // Handle drag over for drop zone - update ghost marker position
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent duplicate handling
    e.dataTransfer.dropEffect = 'copy';
    
    // DEBUG: Count dragover events
    console.count('DRAGOVER');
    
    // Check if we have a spatial card (from store or dataTransfer types)
    const hasSpatialCard = draggedCard?.type === 'spatial' || 
      e.dataTransfer.types.includes('application/json');
    
    if (!hasSpatialCard) {
      console.log('[DRAGOVER] No spatial card, skipping');
      return;
    }
    
    // Use the container rect (same element DeckGL uses)
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
    
    const rawLng = longitude + dx;
    const rawLat = latitude + dy * Math.cos(latitude * Math.PI / 180);
    
    // Snap to grid
    const snapped = snapToGrid(rawLat, rawLng);
    
    // DEBUG: Log every 20th dragover to avoid spam
    if (Math.random() < 0.05) {
      console.log('[DRAGOVER] rect:', { l: rect.left.toFixed(0), t: rect.top.toFixed(0), w: rect.width.toFixed(0), h: rect.height.toFixed(0) });
      console.log('[DRAGOVER] x,y:', x.toFixed(0), y.toFixed(0), '-> lng,lat:', rawLng.toFixed(5), rawLat.toFixed(5));
      console.log('[DRAGOVER] viewState:', { lng: longitude.toFixed(5), lat: latitude.toFixed(5), zoom: zoom.toFixed(2) });
      console.log('[DRAGOVER] setDragGhostPosition:', snapped);
    }
    
    setDragGhostPosition(snapped);
    
    // Highlight containing zone
    const containingZone = findContainingZone(snapped, zonePolygons);
    setHighlightedZoneId(containingZone?.id || null);
  }, [viewState, draggedCard, zonePolygons]);

  // Handle drop - use ghost position (computed in dragOver) as the ONLY source of coordinates
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('[DROP] ========== DROP EVENT ==========');
    console.log('[DROP] dragGhostPosition:', dragGhostPosition);
    
    try {
      // B2: Hard cap at 10 placed items
      if (placedItems.length >= 10) {
        alert('Maximum 10 items allowed. Delete an item to place more.');
        console.warn('[DROP] Max items reached (10) - aborting');
        return;
      }
      
      // Auto-commit any existing placement before creating a new one
      // This prevents items from being "overwritten"
      if (activeProposal && proposalPosition) {
        console.log('[DROP] Auto-committing existing placement before new drop');
        commitPlacement();
      }
      
      // STRICT: Abort if ghost position is null (no fallback to center)
      if (!dragGhostPosition) {
        console.warn('[DROP] No ghost position - aborting (no center fallback)');
        return;
      }
      
      // Get card from store or dataTransfer
      let card = draggedCard;
      if (!card) {
        try {
          const data = e.dataTransfer.getData('application/json');
          if (data) card = JSON.parse(data);
        } catch (err) {
          console.error('[DROP] Error parsing dataTransfer:', err);
        }
      }
      
      if (!card) {
        console.warn('[DROP] No card data - aborting');
        return;
      }
      
      // Use the ghost position directly - it was already computed in dragOver
      const dropPosition = { lat: dragGhostPosition.lat, lng: dragGhostPosition.lng };
      
      console.log('[DROP] Using ghost position:', dropPosition);
      
      // Calculate affected regions by proximity
      const affectedRegions: RegionImpact[] = rankRegionsByDistance(dropPosition, zoneCentroids);
      
      // Find containing zone
      const containingZone = findContainingZone(dropPosition, zonePolygons);
      
      // Create proposal from card with position and vicinity data
      const proposal = createProposalFromCard(card, dropPosition) as SpatialProposal;
      proposal.affected_regions = affectedRegions;
      proposal.containing_zone = containingZone || undefined;
      
      // Set active proposal and position
      setActiveProposal(proposal);
      setProposalPosition(dropPosition);
      
      console.log('[DROP] Proposal created:', { title: proposal.title, lat: dropPosition.lat, lng: dropPosition.lng });
      
      // Show build panel for configuration
      setShowBuildPanel(true);
      
    } catch (err) {
      console.error('[DROP] Error in drop handler:', err);
    } finally {
      // GUARANTEED CLEANUP: Always clear drag state
      console.log('[DROP] Clearing drag state (finally block)');
      setDragGhostPosition(null);
      setHighlightedZoneId(null);
      setIsDragging(false);
      setDraggedCard(null);
    }
  }, [dragGhostPosition, draggedCard, zoneCentroids, zonePolygons, setActiveProposal, setProposalPosition, setIsDragging, setDraggedCard, placedItems, activeProposal, proposalPosition, commitPlacement]);

  // Handle drag leave - clear ghost marker only when truly leaving
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.stopPropagation(); // Prevent duplicate handling
    
    // Only clear if the cursor is truly leaving the map container
    // (not just transitioning between internal child elements)
    const relatedTarget = e.relatedTarget as Node | null;
    const currentTarget = e.currentTarget as Node;
    
    // If relatedTarget is null or outside currentTarget, we're truly leaving
    if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
      setDragGhostPosition(null);
      setHighlightedZoneId(null);
    }
  }, []);

  // Grid cell highlight layer (shows during drag)
  const gridHighlightLayer = useMemo(() => {
    if (!dragGhostPosition) return null;
    
    const cellCorners = getGridCellCorners(dragGhostPosition);
    
    return new PolygonLayer({
      id: 'grid-highlight',
      data: [{ polygon: cellCorners }],
      pickable: false,
      stroked: true,
      filled: true,
      lineWidthMinPixels: 2,
      getPolygon: (d: { polygon: number[][] }) => d.polygon,
      getFillColor: [96, 165, 250, 40], // Blue with low opacity
      getLineColor: [96, 165, 250, 200], // Blue border
      getLineWidth: 2,
    });
  }, [dragGhostPosition]);

  // Ghost marker layer (shows during drag as scatterplot for performance)
  const ghostMarkerLayer = useMemo(() => {
    if (!dragGhostPosition || !draggedCard) return null;
    
    return new ScatterplotLayer({
      id: 'ghost-marker',
      data: [{ position: [dragGhostPosition.lng, dragGhostPosition.lat] }],
      pickable: false,
      opacity: 0.7,
      stroked: true,
      filled: true,
      radiusMinPixels: 20,
      radiusMaxPixels: 40,
      lineWidthMinPixels: 2,
      getPosition: (d: { position: [number, number] }) => d.position,
      getFillColor: [139, 92, 246, 180], // Purple
      getLineColor: [255, 255, 255, 255],
      getRadius: 200, // meters
    });
  }, [dragGhostPosition, draggedCard]);
  
  // Proposal type to icon mapping
  const PROPOSAL_ICONS: Record<string, string> = {
    park: '🌳',
    upzone: '🏗️',
    housing_development: '🏠',
    transit_line: '🚌',
    bike_lane: '🚴',
    commercial_development: '🏪',
    community_center: '🏛️',
    factory: '🏭',
  };
  
  // B1: Zoom-responsive icon size - larger icons when zoomed in
  const iconSize = useMemo(() => {
    const z = viewState.zoom;
    if (z < 12) return 18;
    if (z < 14) return 24;
    if (z < 16) return 32;
    return 40;
  }, [viewState.zoom]);
  
  // Placed marker halo layer - world-space radius (scales with zoom like real geography)
  const placedMarkerHaloLayer = useMemo(() => {
    if (!proposalPosition || !activeProposal || activeProposal.type !== 'spatial') return null;
    
    // Convert radius_km to meters for world-space rendering
    const radiusKm = activeProposal.radius_km || 0.5;
    const radiusMeters = radiusKm * 1000;
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/36b22d3a-abef-4d8c-b3d9-d3a34145295b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MapArena:placedMarkerHaloLayer',message:'Creating halo with radius',data:{radiusKm,radiusMeters,scale:activeProposal.scale},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'radius'})}).catch(()=>{});
    // #endregion
    
    return new ScatterplotLayer({
      id: 'placed-marker-halo',
      data: [{ position: [proposalPosition.lng, proposalPosition.lat] }],
      pickable: false,
      opacity: 0.6,
      stroked: true,
      filled: true,
      radiusMinPixels: 10,  // Minimum visible size when zoomed out
      radiusMaxPixels: 500, // Max size when zoomed in
      lineWidthMinPixels: 2,
      getPosition: (d: { position: [number, number] }) => d.position,
      getFillColor: [59, 130, 246, 80], // Blue with transparency
      getLineColor: [59, 130, 246, 200], // Blue border
      getRadius: radiusMeters, // World-space radius in meters
    });
  }, [proposalPosition, activeProposal]);
  
  // Placed marker icon layer - emoji at position (zoom-responsive)
  const placedMarkerIconLayer = useMemo(() => {
    if (!proposalPosition || !activeProposal || activeProposal.type !== 'spatial') return null;
    
    const spatialType = activeProposal.spatial_type;
    const iconFromMap = PROPOSAL_ICONS[spatialType];
    const icon = iconFromMap || '📍';
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/36b22d3a-abef-4d8c-b3d9-d3a34145295b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MapArena:placedMarkerIconLayer',message:'Active proposal icon',data:{spatialType,iconFromMap:iconFromMap||'UNDEFINED',finalIcon:icon,iconLength:icon?.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1-H4'})}).catch(()=>{});
    // #endregion
    
    // Collect all unique emoji characters for the font atlas
    const allEmojis = Object.values(PROPOSAL_ICONS).join('') + '📍';
    
    return new TextLayer({
      id: 'placed-marker-icon',
      data: [{ position: [proposalPosition.lng, proposalPosition.lat], icon }],
      pickable: false,
      getPosition: (d: { position: [number, number] }) => d.position,
      getText: (d: { icon: string }) => d.icon,
      getSize: iconSize, // B1: Zoom-responsive
      getColor: [255, 255, 255, 255],
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'center',
      // Include emoji-capable fonts for WebGL rendering
      fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Android Emoji", sans-serif',
      // Tell deck.gl which characters to include in font atlas
      characterSet: allEmojis,
      // Add background for better visibility
      background: true,
      backgroundPadding: [4, 4],
      getBackgroundColor: [30, 30, 35, 220],
      getBorderColor: [59, 130, 246, 255],
      getBorderWidth: 2,
    });
  }, [proposalPosition, activeProposal, iconSize]);
  
  // Layer for all committed/placed items (persistent)
  const committedItemsHaloLayer = useMemo(() => {
    // DEBUG: Log placedItems state
    console.log('[PLACED_ITEMS] Halo layer rebuild - count:', placedItems.length, placedItems.map(i => ({ id: i.id, type: i.proposal.spatial_type })));
    
    if (placedItems.length === 0) return null;
    
    const data = placedItems.map(item => ({
      id: item.id,
      position: [item.position.lng, item.position.lat] as [number, number],
      radius: (item.proposal.radius_km || 0.5) * 1000,
      isSelected: item.id === selectedPlacedItemId,
    }));
    
    return new ScatterplotLayer({
      id: 'committed-items-halo',
      data,
      pickable: false,
      opacity: 0.5,
      stroked: true,
      filled: true,
      radiusMinPixels: 10,
      radiusMaxPixels: 500,
      lineWidthMinPixels: 2,
      getPosition: (d: { position: [number, number] }) => d.position,
      // Highlight selected item with blue, others green
      getFillColor: (d: { isSelected: boolean }) => d.isSelected ? [59, 130, 246, 120] : [34, 197, 94, 80],
      getLineColor: (d: { isSelected: boolean }) => d.isSelected ? [59, 130, 246, 255] : [34, 197, 94, 200],
      getLineWidth: (d: { isSelected: boolean }) => d.isSelected ? 3 : 1,
      getRadius: (d: { radius: number }) => d.radius,
      updateTriggers: {
        getFillColor: [selectedPlacedItemId],
        getLineColor: [selectedPlacedItemId],
        getLineWidth: [selectedPlacedItemId],
      },
    });
  }, [placedItems, selectedPlacedItemId]);
  
  const committedItemsIconLayer = useMemo(() => {
    // DEBUG: Log icon layer data
    console.log('[PLACED_ITEMS] Icon layer rebuild - count:', placedItems.length);
    
    if (placedItems.length === 0) return null;
    
    const data = placedItems.map(item => {
      const spatialType = item.proposal.spatial_type;
      const iconFromMap = PROPOSAL_ICONS[spatialType];
      const icon = iconFromMap || '📍';
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/36b22d3a-abef-4d8c-b3d9-d3a34145295b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MapArena:committedItemsIconLayer:map',message:'Building icon data',data:{itemId:item.id,spatialType,iconFromMap:iconFromMap||'UNDEFINED',finalIcon:icon,iconLength:icon?.length,iconCharCode:icon?.charCodeAt(0),availableKeys:Object.keys(PROPOSAL_ICONS)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1-H3'})}).catch(()=>{});
      // #endregion
      
      console.log('[PLACED_ITEMS] Item:', item.id, 'type:', spatialType, 'iconFromMap:', iconFromMap, 'finalIcon:', icon);
      return {
        id: item.id,
        position: [item.position.lng, item.position.lat] as [number, number],
        icon,
      };
    });
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/36b22d3a-abef-4d8c-b3d9-d3a34145295b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MapArena:committedItemsIconLayer:final',message:'Final layer data',data:{dataLength:data.length,firstItem:data[0],allIcons:data.map(d=>d.icon)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2-H5'})}).catch(()=>{});
    // #endregion
    
    // Collect all unique emoji characters for the font atlas
    const allEmojis = Object.values(PROPOSAL_ICONS).join('') + '📍';
    
    return new TextLayer({
      id: 'committed-items-icon',
      data,
      pickable: true, // B3: Make clickable for deletion
      getPosition: (d: { position: [number, number] }) => d.position,
      getText: (d: { icon: string }) => d.icon,
      getSize: iconSize, // B1: Zoom-responsive
      getColor: [255, 255, 255, 255],
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'center',
      // Include emoji-capable fonts for WebGL rendering
      fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Android Emoji", sans-serif',
      // Tell deck.gl which characters to include in font atlas
      characterSet: allEmojis,
      background: true,
      backgroundPadding: [4, 4],
      getBackgroundColor: [34, 60, 34, 220], // Dark green bg
      getBorderColor: [34, 197, 94, 255],
      getBorderWidth: 2,
    });
  }, [placedItems, iconSize]);

  const layers = useMemo(() => {
    const result = [];
    // Add sentiment zones first (below other layers)
    if (sentimentZoneLayer) result.push(sentimentZoneLayer);
    if (polygonLayer) result.push(polygonLayer);
    // Grid highlight during drag
    if (gridHighlightLayer) result.push(gridHighlightLayer);
    // Ghost marker during drag
    if (ghostMarkerLayer) result.push(ghostMarkerLayer);
    // Committed/placed items (persistent, green)
    if (committedItemsHaloLayer) result.push(committedItemsHaloLayer);
    if (committedItemsIconLayer) result.push(committedItemsIconLayer);
    // Current placement being edited (blue)
    if (placedMarkerHaloLayer) result.push(placedMarkerHaloLayer);
    
    // DEBUG: Log layer composition
    console.log('[LAYERS] Active layers:', result.map(l => l.id), 'hasCommittedHalo:', !!committedItemsHaloLayer, 'hasCommittedIcon:', !!committedItemsIconLayer);
    if (placedMarkerIconLayer) result.push(placedMarkerIconLayer);
    // Zone labels on top
    if (zoneLabelLayer) result.push(zoneLabelLayer);
    return result;
  }, [sentimentZoneLayer, polygonLayer, gridHighlightLayer, ghostMarkerLayer, committedItemsHaloLayer, committedItemsIconLayer, placedMarkerHaloLayer, placedMarkerIconLayer, zoneLabelLayer]);

  return (
    <div 
      className="relative w-full h-full"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={handleDragLeave}
    >
      <MapErrorBoundary>
        <DeckGL
          viewState={viewState}
          onViewStateChange={({ viewState: vs }) => {
            // Freeze map navigation during drag (P0-4)
            if (!isDragging) {
              setViewState(vs as typeof viewState);
            }
          }}
          controller={!isDragging} // Disable controller during drag
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
      
      {/* Proposal marker is now rendered via deck.gl placedMarkerLayer for pixel-perfect alignment */}
      
      {/* Build Proposal Panel - shows after dropping a build item */}
      {showBuildPanel && activeProposal?.type === 'spatial' && (
        <BuildProposalPanel
          onClose={() => setShowBuildPanel(false)}
        />
      )}
      
      {/* B3: Delete placed item overlay */}
      {selectedPlacedItemId && (() => {
        const item = placedItems.find(i => i.id === selectedPlacedItemId);
        if (!item) return null;
        return (
          <div className="absolute bottom-4 right-4 bg-civic-surface/95 backdrop-blur border border-civic-border rounded-lg shadow-xl p-4 z-30">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{PROPOSAL_ICONS[item.proposal.spatial_type] || '📍'}</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-civic-text">{item.proposal.title}</p>
                <p className="text-xs text-civic-text-secondary">
                  {item.proposal.scale === 1 ? 'Small' : item.proposal.scale === 2 ? 'Medium' : 'Large'} impact
                </p>
              </div>
              <button
                onClick={() => {
                  removePlacedItem(selectedPlacedItemId);
                  setSelectedPlacedItemId(null);
                }}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded transition-colors"
              >
                Delete
              </button>
              <button
                onClick={() => setSelectedPlacedItemId(null)}
                className="px-3 py-1.5 bg-civic-muted hover:bg-civic-border text-civic-text text-sm font-medium rounded transition-colors"
              >
                Cancel
              </button>
            </div>
            <p className="text-xs text-civic-text-secondary mt-2">
              {placedItems.length}/10 items placed
            </p>
          </div>
        );
      })()}
      
      {/* Zone panel - shows regional agent info (with or without simulation) */}
      {selectedZoneId && (() => {
        const zoneSentiment = zoneSentiments.find(z => z.zone_id === selectedZoneId);
        const zoneInfo = kingstonZones.features.find(f => f.properties.id === selectedZoneId);
        // Find the regional agent for this zone (agent_key == zone_id)
        // Use simulation data if available, otherwise fall back to defaults
        const regionalAgent: AgentReaction | undefined = agentSimulation?.reactions.find(
          r => r.agent_key === selectedZoneId
        );
        const defaultAgent = DEFAULT_AGENTS[selectedZoneId];
        if (!zoneSentiment && !zoneInfo && !defaultAgent) return null;
        
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
              
              {/* Regional Representative Card - show simulation agent or default */}
              {(regionalAgent || defaultAgent) && (
                <div className="bg-civic-elevated rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{regionalAgent?.avatar || defaultAgent?.avatar}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-civic-text truncate">
                        {regionalAgent?.agent_name || defaultAgent?.name}
                      </div>
                      <div className="text-[10px] text-civic-text-secondary truncate">
                        {regionalAgent?.role || defaultAgent?.role}
                      </div>
                    </div>
                    {regionalAgent && (
                      <div className={`text-lg font-bold font-mono ${
                        regionalAgent.stance === 'support' ? 'text-civic-support' :
                        regionalAgent.stance === 'oppose' ? 'text-civic-oppose' : 'text-civic-neutral'
                      }`}>
                        {regionalAgent.stance === 'support' ? '+' : regionalAgent.stance === 'oppose' ? '-' : ''}
                        {(regionalAgent.intensity * 100).toFixed(0)}%
                      </div>
                    )}
                  </div>
                  
                  {/* Bio - only from simulation data */}
                  {regionalAgent?.bio && (
                    <p className="text-[10px] text-civic-text-secondary line-clamp-2">
                      {regionalAgent.bio}
                    </p>
                  )}
                  
                  {/* Tags - only from simulation data */}
                  {regionalAgent?.tags && regionalAgent.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {regionalAgent.tags.slice(0, 4).map(tag => (
                        <span key={tag} className="px-1.5 py-0.5 bg-civic-muted/30 rounded text-[9px] text-civic-text-secondary">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  
                  {/* Quote - only from simulation data */}
                  {regionalAgent?.quote && (
                    <div className={`text-xs p-2 rounded ${
                      regionalAgent.stance === 'support' ? 'bg-green-500/10 text-green-300' :
                      regionalAgent.stance === 'oppose' ? 'bg-red-500/10 text-red-300' : 
                      'bg-yellow-500/10 text-yellow-300'
                    }`}>
                      "{regionalAgent.quote}"
                    </div>
                  )}
                  
                  {/* Action buttons */}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => {
                        const agentKey = regionalAgent?.agent_key || selectedZoneId;
                        const agentName = regionalAgent?.agent_name || defaultAgent?.name || selectedZoneId;
                        if (agentKey && agentName) {
                          setTargetAgent({ key: agentKey, name: agentName });
                        }
                        setSelectedZoneId(null);
                      }}
                      className="flex-1 px-2 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-xs rounded transition-colors"
                    >
                      💬 DM
                    </button>
                    <button
                      onClick={() => {
                        const agentKey = regionalAgent?.agent_key || selectedZoneId;
                        const agentName = regionalAgent?.agent_name || defaultAgent?.name || selectedZoneId;
                        const agentAvatar = regionalAgent?.avatar || defaultAgent?.avatar || '🎭';
                        if (agentKey && agentName) {
                          setSpeakingAsAgent({ key: agentKey, name: agentName, avatar: agentAvatar });
                        }
                        setSelectedZoneId(null);
                      }}
                      className="flex-1 px-2 py-1.5 bg-civic-muted hover:bg-civic-border text-civic-text text-xs rounded transition-colors"
                    >
                      🎭 Speak As
                    </button>
                  </div>
                </div>
              )}
              
              {/* If no agent found, show zone sentiment */}
              {!regionalAgent && zoneSentiment && (
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
      {isDragging && !dragGhostPosition && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="bg-civic-accent/20 border-2 border-dashed border-civic-accent rounded-xl px-8 py-4">
            <span className="text-civic-accent font-medium">Drop to place {draggedCard?.name || 'build'}</span>
          </div>
        </div>
      )}
      
      {/* Ghost position indicator during drag */}
      {isDragging && dragGhostPosition && draggedCard && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none z-30">
          <div className="bg-purple-600/90 backdrop-blur border border-purple-400 rounded-lg px-4 py-2 shadow-lg flex items-center gap-3">
            <span className="text-lg">{draggedCard.icon}</span>
            <div>
              <div className="text-sm font-medium text-white">{draggedCard.name}</div>
              {highlightedZoneId && (
                <div className="text-xs text-purple-200">
                  Drop in: {zoneCentroids.find(z => z.zone_id === highlightedZoneId)?.zone_name || highlightedZoneId}
                </div>
              )}
            </div>
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
