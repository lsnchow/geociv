/**
 * BuildProposalPanel - Post-drop panel for configuring and simulating build proposals
 * Shows editable name, scale slider, affected regions, and simulate button
 */

import { useState, useEffect, useCallback } from 'react';
import { useCivicStore } from '../../store';
import { BUILD_IMPACT_PROFILES, getImpactSummary } from '../../lib/build-impacts';
import type { SpatialProposal, RegionImpact } from '../../types';
import * as aiApi from '../../lib/ai-api';

interface BuildProposalPanelProps {
  onClose: () => void;
}

// Scale to radius mapping: 1=Small(0.3km), 2=Medium(0.5km), 3=Large(1.0km)
const SCALE_TO_RADIUS: Record<number, number> = { 1: 0.3, 2: 0.5, 3: 1.0 };

export function BuildProposalPanel({ onClose }: BuildProposalPanelProps) {
  const {
    scenario,
    activeProposal,
    updateActiveProposal,
    setAgentSimulation,
    commitPlacement,
    sessionId,
    buildWorldStateSummary,
  } = useCivicStore();
  
  // Cast to SpatialProposal since this panel only shows for spatial proposals
  const proposal = activeProposal as SpatialProposal | null;
  
  const [title, setTitle] = useState(proposal?.title || '');
  const [scale, setScale] = useState(proposal?.scale || 1);
  const [isSimulating, setIsSimulating] = useState(false);
  
  // Sync local state when proposal changes
  useEffect(() => {
    if (proposal) {
      setTitle(proposal.title);
      setScale(proposal.scale || 1);
    }
  }, [proposal?.title, proposal?.scale]);
  
  const profile = proposal ? BUILD_IMPACT_PROFILES[proposal.spatial_type] : null;
  const affectedRegions = proposal?.affected_regions || [];
  const containingZone = proposal?.containing_zone;
  
  // Top 3 most affected regions
  const topRegions = affectedRegions.slice(0, 3);
  
  // Update proposal when title changes (debounced effect)
  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
    updateActiveProposal({ title: newTitle });
  }, [updateActiveProposal]);
  
  // Update proposal when scale changes - this triggers re-render of map layers
  const handleScaleChange = useCallback((newScale: number) => {
    setScale(newScale);
    const newRadiusKm = SCALE_TO_RADIUS[newScale] || 0.5;
    console.log('[BuildProposalPanel] Scale changed:', { newScale, radius_km: newRadiusKm });
    updateActiveProposal({ 
      scale: newScale, 
      radius_km: newRadiusKm 
    });
  }, [updateActiveProposal]);
  
  const handleSimulate = async () => {
    if (!scenario || !proposal || isSimulating) return;
    
    // Commit/confirm the building placement before simulating
    commitPlacement();
    
    setIsSimulating(true);
    try {
      // Create description that includes vicinity context
      const vicinityContext = containingZone 
        ? `Located in ${containingZone.name}. `
        : '';
      const impactSummary = getImpactSummary(proposal.spatial_type, scale);
      
      // Format affected regions for the message
      const regionContext = topRegions.length > 0
        ? `Most affected areas: ${topRegions.map(r => `${r.zone_name} (${r.distance_bucket})`).join(', ')}.`
        : '';
      
      const message = `${title}: ${vicinityContext}${impactSummary} ${regionContext}`;
      
      // Build world state context (existing placements, adopted policies, relationships)
      const worldState = buildWorldStateSummary();
      
      const response = await aiApi.chat({
        message,
        scenario_id: scenario.id,
        session_id: sessionId,
        world_state: worldState,
        // Pass the full proposal with vicinity data
        build_proposal: {
          ...proposal,
          title,
          scale,
          radius_km: SCALE_TO_RADIUS[scale] || 0.5,
        },
      });
      
      setAgentSimulation(response);
      
      // Close the panel after successful simulation
      onClose();
    } catch (error) {
      console.error('Simulation failed:', error);
    } finally {
      setIsSimulating(false);
    }
  };
  
  const handleConfirmPlacement = () => {
    commitPlacement();
    onClose();
  };
  
  const getDistanceBucketLabel = (bucket: RegionImpact['distance_bucket']) => {
    switch (bucket) {
      case 'near': return { label: 'High Impact', color: 'text-red-400 bg-red-500/20' };
      case 'medium': return { label: 'Medium', color: 'text-yellow-400 bg-yellow-500/20' };
      case 'far': return { label: 'Low', color: 'text-green-400 bg-green-500/20' };
    }
  };
  
  if (!proposal) return null;
  
  return (
    <div className="absolute right-4 top-4 w-80 bg-civic-surface/95 backdrop-blur border border-civic-border rounded-lg shadow-xl overflow-hidden z-30">
      {/* Header */}
      <div className="p-3 border-b border-civic-border flex items-center justify-between bg-civic-elevated">
        <div className="flex items-center gap-2">
          <span className="text-xl">{profile?.icon || '🏗️'}</span>
          <span className="font-medium text-civic-text">Build Proposal</span>
        </div>
        <button
          onClick={onClose}
          className="text-civic-text-secondary hover:text-civic-text p-1"
        >
          ✕
        </button>
      </div>
      
      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Editable title */}
        <div>
          <label className="text-xs text-civic-text-secondary block mb-1">Name</label>
          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="w-full px-3 py-2 bg-civic-elevated border border-civic-border rounded text-sm text-civic-text focus:outline-none focus:border-civic-accent"
            placeholder="Enter proposal name"
          />
        </div>
        
        {/* Scale/Radius slider */}
        <div>
          <label className="text-xs text-civic-text-secondary block mb-1">
            Radius: {scale === 1 ? 'Small (0.3km)' : scale === 2 ? 'Medium (0.5km)' : 'Large (1.0km)'}
          </label>
          <input
            type="range"
            min={1}
            max={3}
            step={1}
            value={scale}
            onChange={(e) => handleScaleChange(Number(e.target.value))}
            className="w-full accent-civic-accent"
          />
          <div className="flex justify-between text-[10px] text-civic-text-secondary mt-1">
            <span>0.3km</span>
            <span>0.5km</span>
            <span>1.0km</span>
          </div>
        </div>
        
        {/* Containing zone */}
        {containingZone && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-civic-text-secondary">📍</span>
            <span className="text-civic-text">{containingZone.name}</span>
          </div>
        )}
        
        {/* Impact summary */}
        {profile && (
          <div className="bg-civic-elevated rounded p-3 space-y-2">
            <div className="text-xs text-civic-text-secondary">Expected impacts:</div>
            <div className="flex flex-wrap gap-1">
              {profile.primary_impacts.map((impact, i) => (
                <span
                  key={i}
                  className={`text-[10px] px-2 py-0.5 rounded ${
                    impact.direction === 'positive' 
                      ? 'bg-green-500/20 text-green-400' 
                      : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  {impact.direction === 'positive' ? '↑' : '↓'} {impact.metric}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {/* Affected regions */}
        {topRegions.length > 0 && (
          <div>
            <div className="text-xs text-civic-text-secondary mb-2">Affected Regions</div>
            <div className="space-y-1">
              {topRegions.map((region) => {
                const bucket = getDistanceBucketLabel(region.distance_bucket);
                return (
                  <div 
                    key={region.zone_id}
                    className="flex items-center justify-between bg-civic-elevated rounded px-3 py-2"
                  >
                    <span className="text-sm text-civic-text">{region.zone_name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded ${bucket.color}`}>
                      {bucket.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        {/* Action buttons */}
        <div className="space-y-2">
          {/* Confirm Placement button */}
          <button
            onClick={handleConfirmPlacement}
            className="w-full py-2.5 rounded font-medium text-sm transition-colors bg-green-600 hover:bg-green-700 text-white"
          >
            ✓ Confirm Placement
          </button>
          
          {/* Simulate button */}
          <button
            onClick={handleSimulate}
            disabled={isSimulating || !scenario}
            className={`w-full py-2.5 rounded font-medium text-sm transition-colors ${
              isSimulating
                ? 'bg-civic-muted text-civic-text-secondary cursor-wait'
                : 'bg-civic-accent hover:bg-civic-accent-muted text-white'
            }`}
          >
            {isSimulating ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⟳</span>
                Simulating...
              </span>
            ) : (
              'Simulate Impact'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default BuildProposalPanel;
