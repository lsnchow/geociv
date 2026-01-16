import { useState } from 'react';
import type { AIReceipt } from '../../types/ai';
import { Badge } from '../ui';

interface AIFooterProps {
  receipt?: AIReceipt;
  activeFeatures?: string[];
  assumptionsCount?: number;
  runHash?: string;
  onCopyRecipe?: () => void;
}

export function AIFooter({
  receipt,
  activeFeatures = [],
  assumptionsCount = 0,
  runHash,
  onCopyRecipe,
}: AIFooterProps) {
  const [showDetails, setShowDetails] = useState(false);
  
  const features = receipt?.active_features || activeFeatures;
  const assumptions = receipt?.assumptions_count || assumptionsCount;
  const hash = receipt?.run_hash || runHash || generateHash();
  
  return (
    <div className="bg-civic-surface border-t border-civic-border">
      {/* Main footer bar */}
      <div className="flex items-center justify-between px-4 py-2">
        {/* Left: Status badges */}
        <div className="flex items-center gap-3">
          <Badge variant="support" size="sm">AI-DRIVEN</Badge>
        </div>
        
        {/* Center: Active features */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-civic-text-secondary">Active:</span>
          {features.length > 0 ? (
            features.map(f => (
              <FeatureBadge key={f} feature={f} />
            ))
          ) : (
            <span className="text-[10px] text-civic-text-secondary/60">none</span>
          )}
        </div>
        
        {/* Right: Run info */}
        <div className="flex items-center gap-3">
          {assumptions > 0 && (
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs text-civic-text-secondary hover:text-civic-text flex items-center gap-1"
            >
              <span>📋</span>
              <span>Assumptions: {assumptions}</span>
            </button>
          )}
          
          <div className="flex items-center gap-2 text-xs">
            <span className="text-civic-text-secondary">Run:</span>
            <code className="text-civic-accent font-mono text-[10px]">{hash}</code>
          </div>
          
          {onCopyRecipe && (
            <button
              onClick={onCopyRecipe}
              className="text-xs text-civic-accent hover:text-civic-text transition-colors"
            >
              📎 Copy Recipe
            </button>
          )}
        </div>
      </div>
      
      {/* Expandable details */}
      {showDetails && receipt?.assumptions && receipt.assumptions.length > 0 && (
        <div className="border-t border-civic-border px-4 py-3 bg-civic-bg/50">
          <h4 className="text-[10px] text-civic-text-secondary mb-2">ASSUMPTIONS MADE</h4>
          <ul className="space-y-1">
            {receipt.assumptions.map((a, i) => (
              <li key={i} className="text-xs text-civic-text">
                <span className="text-civic-accent">{a.field}</span>
                <span className="text-civic-text-secondary"> = </span>
                <span>{a.value}</span>
                <span className="text-civic-text-secondary/60 ml-2">({a.reason})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface FeatureBadgeProps {
  feature: string;
}

function FeatureBadge({ feature }: FeatureBadgeProps) {
  const getFeatureStyle = () => {
    switch (feature.toLowerCase()) {
      case 'parse':
        return { icon: '📝', label: 'Parse', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
      case 'variants':
        return { icon: '🔮', label: 'Variants', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' };
      case 'townhall':
        return { icon: '🏛️', label: 'Town Hall', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
      case 'seek':
        return { icon: '🎯', label: 'Seek', color: 'bg-green-500/20 text-green-400 border-green-500/30' };
      case 'history':
        return { icon: '📊', label: 'History', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' };
      default:
        return { icon: '✨', label: feature, color: 'bg-civic-muted/30 text-civic-text-secondary border-civic-border' };
    }
  };
  
  const { icon, label, color } = getFeatureStyle();
  
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] ${color}`}>
      <span>{icon}</span>
      <span>{label}</span>
    </span>
  );
}

// Generate a short random hash for display
function generateHash(): string {
  return Math.random().toString(36).substring(2, 8) + Date.now().toString(36).slice(-4);
}

// Compact version for inline use
export function AIFooterCompact({ 
  features = [], 
  assumptions = 0 
}: { 
  features?: string[]; 
  assumptions?: number;
}) {
  return (
    <div className="flex items-center gap-2 text-[10px] text-civic-text-secondary">
      <span className="text-civic-support">AI ✓</span>
      <span>•</span>
      <span>Deterministic ✓</span>
      {features.length > 0 && (
        <>
          <span>•</span>
          <span>{features.join(', ')}</span>
        </>
      )}
      {assumptions > 0 && (
        <>
          <span>•</span>
          <span>{assumptions} assumptions</span>
        </>
      )}
    </div>
  );
}

