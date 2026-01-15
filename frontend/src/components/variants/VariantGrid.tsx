import { useState } from 'react';
import type { VariantBundle, RankedVariant } from '../../types/ai';
import { Panel, PanelSection, Button, Badge } from '../ui';

interface VariantGridProps {
  bundle: VariantBundle;
  onSelectVariant: (variant: RankedVariant) => void;
  isLoading?: boolean;
}

export function VariantGrid({ bundle, onSelectVariant, isLoading: _isLoading }: VariantGridProps) {
  void _isLoading; // Available for future loading states
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'support' | 'equity' | 'environment' | 'feasibility'>('support');
  
  // Collect all variants
  const allVariants = [
    bundle.base,
    ...bundle.alternates,
    ...bundle.compromises,
    bundle.spicy,
  ];
  
  // Sort by selected criterion
  const sortedVariants = [...allVariants].sort((a, b) => {
    switch (sortBy) {
      case 'support': return b.support_score - a.support_score;
      case 'equity': return b.equity_score - a.equity_score;
      case 'environment': return b.environment_score - a.environment_score;
      case 'feasibility': return b.feasibility_score - a.feasibility_score;
      default: return 0;
    }
  });
  
  const handleSelect = (variant: RankedVariant) => {
    setSelectedId(variant.id);
    onSelectVariant(variant);
  };
  
  return (
    <Panel title="AI Variants" className="h-full flex flex-col">
      {/* Sort controls */}
      <PanelSection className="border-b border-civic-border">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-civic-text-secondary">Sort by:</span>
          {(['support', 'equity', 'environment', 'feasibility'] as const).map(criterion => (
            <button
              key={criterion}
              onClick={() => setSortBy(criterion)}
              className={`px-2 py-1 rounded transition-colors ${
                sortBy === criterion
                  ? 'bg-civic-accent text-white'
                  : 'text-civic-text-secondary hover:text-civic-text'
              }`}
            >
              {criterion.charAt(0).toUpperCase() + criterion.slice(1)}
            </button>
          ))}
        </div>
      </PanelSection>
      
      {/* Summary */}
      <PanelSection className="border-b border-civic-border">
        <p className="text-xs text-civic-text-secondary">{bundle.analysis_summary}</p>
        {bundle.recommendation_reason && (
          <p className="text-xs text-civic-accent mt-1">
            💡 {bundle.recommendation_reason}
          </p>
        )}
      </PanelSection>
      
      {/* Variant cards */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {sortedVariants.map((variant, idx) => (
          <VariantCard
            key={variant.id}
            variant={variant}
            rank={idx + 1}
            isSelected={selectedId === variant.id}
            isRecommended={variant.id === bundle.recommended_variant_id}
            onClick={() => handleSelect(variant)}
          />
        ))}
      </div>
      
      {/* Apply button */}
      {selectedId && (
        <PanelSection className="border-t border-civic-border">
          <Button 
            className="w-full" 
            onClick={() => {
              const variant = allVariants.find(v => v.id === selectedId);
              if (variant) onSelectVariant(variant);
            }}
          >
            Apply Selected Variant
          </Button>
        </PanelSection>
      )}
    </Panel>
  );
}

interface VariantCardProps {
  variant: RankedVariant;
  rank: number;
  isSelected: boolean;
  isRecommended: boolean;
  onClick: () => void;
}

function VariantCard({ variant, rank, isSelected, isRecommended, onClick }: VariantCardProps) {
  const getTypeColor = () => {
    switch (variant.variant_type) {
      case 'base': return 'border-civic-text-secondary';
      case 'alternate': return 'border-civic-accent';
      case 'compromise': return 'border-civic-support';
      case 'spicy': return 'border-orange-500';
      default: return 'border-civic-border';
    }
  };
  
  const getTypeLabel = () => {
    switch (variant.variant_type) {
      case 'base': return '📋 Base';
      case 'alternate': return '🔄 Alternate';
      case 'compromise': return '🤝 Compromise';
      case 'spicy': return '🌶️ Bold';
      default: return '';
    }
  };
  
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
        isSelected 
          ? 'bg-civic-accent/10 border-civic-accent' 
          : `bg-civic-elevated hover:bg-civic-muted/30 ${getTypeColor()}`
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-civic-text-secondary">#{rank}</span>
            <span className="text-sm font-medium text-civic-text truncate">
              {variant.name}
            </span>
            {isRecommended && (
              <Badge variant="support" size="sm">Recommended</Badge>
            )}
          </div>
          
          <div className="text-[10px] text-civic-text-secondary mt-1">
            {getTypeLabel()}
          </div>
          
          {variant.changes_from_base.length > 0 && (
            <div className="text-[10px] text-civic-text-secondary mt-1 truncate">
              {variant.changes_from_base.slice(0, 2).join(', ')}
            </div>
          )}
        </div>
        
        {/* Score */}
        <div className="text-right">
          <div className={`text-lg font-bold font-mono ${
            variant.overall_approval > 20 ? 'text-civic-support' :
            variant.overall_approval < -20 ? 'text-civic-oppose' : 'text-civic-neutral'
          }`}>
            {variant.overall_approval > 0 ? '+' : ''}{variant.overall_approval.toFixed(0)}
          </div>
          <div className="text-[10px] text-civic-text-secondary">
            approval
          </div>
        </div>
      </div>
      
      {/* Score bars */}
      <div className="mt-2 grid grid-cols-4 gap-1">
        <ScoreBar label="Support" value={variant.support_score} color="blue" />
        <ScoreBar label="Equity" value={variant.equity_score} color="purple" />
        <ScoreBar label="Env" value={variant.environment_score} color="green" />
        <ScoreBar label="Feasible" value={variant.feasibility_score} color="yellow" />
      </div>
    </button>
  );
}

interface ScoreBarProps {
  label: string;
  value: number;
  color: 'blue' | 'purple' | 'green' | 'yellow';
}

function ScoreBar({ label, value, color }: ScoreBarProps) {
  const colorClasses = {
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
  };
  
  return (
    <div>
      <div className="text-[8px] text-civic-text-secondary mb-0.5">{label}</div>
      <div className="h-1 bg-civic-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${colorClasses[color]} transition-all`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

// Loading skeleton
export function VariantGridSkeleton() {
  return (
    <Panel title="AI Variants" className="h-full">
      <PanelSection>
        <div className="text-center py-8">
          <div className="animate-pulse text-3xl mb-3">🔮</div>
          <p className="text-sm text-civic-text-secondary">
            Generating variants...
          </p>
          <p className="text-xs text-civic-text-secondary mt-1">
            Running simulations on 7 proposals
          </p>
        </div>
      </PanelSection>
    </Panel>
  );
}

