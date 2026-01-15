import type { SpatialProposal } from '../../types';

interface ProposalMarkerProps {
  position: { lat: number; lng: number };
  proposal: SpatialProposal;
  viewState: { latitude: number; longitude: number; zoom: number };
}

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

export function ProposalMarker({ position, proposal, viewState }: ProposalMarkerProps) {
  // Calculate radius in pixels (approximate)
  const radiusKm = proposal.radius_km || 0.5;
  const metersPerPixel = 156543.03392 * Math.cos(position.lat * Math.PI / 180) / Math.pow(2, viewState.zoom);
  const radiusPixels = (radiusKm * 1000) / metersPerPixel;
  
  const icon = PROPOSAL_ICONS[proposal.spatial_type] || '📍';
  
  // We use CSS to position this as an overlay
  // The actual positioning happens in MapArena using the viewState
  
  return (
    <div 
      className="absolute pointer-events-none"
      style={{
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
      }}
    >
      {/* Radius ring */}
      <div
        className="absolute rounded-full border-2 border-civic-accent bg-civic-accent/10"
        style={{
          width: radiusPixels * 2,
          height: radiusPixels * 2,
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />
      
      {/* Center marker */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative">
          {/* Pulse animation */}
          <div className="absolute inset-0 animate-ping bg-civic-accent/30 rounded-full" />
          
          {/* Icon */}
          <div className="relative bg-civic-elevated border-2 border-civic-accent rounded-full w-10 h-10 flex items-center justify-center shadow-lg">
            <span className="text-lg">{icon}</span>
          </div>
        </div>
      </div>
      
      {/* Label */}
      <div 
        className="absolute left-1/2 -translate-x-1/2 mt-14 bg-civic-elevated border border-civic-border rounded px-2 py-1 text-xs font-medium text-civic-text whitespace-nowrap shadow-lg"
      >
        {proposal.title}
      </div>
    </div>
  );
}

