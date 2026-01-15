import type { ArchetypeApproval } from '../../types';

interface ArchetypeBreakdownProps {
  archetypes: ArchetypeApproval[];
}

const ARCHETYPE_ICONS: Record<string, string> = {
  young_renter: '🎓',
  established_homeowner: '🏡',
  senior_fixed_income: '👵',
  small_business_owner: '🏪',
  environmental_advocate: '🌱',
  transit_dependent: '🚌',
  newcomer_immigrant: '🌍',
  student: '📚',
};

export function ArchetypeBreakdown({ archetypes }: ArchetypeBreakdownProps) {
  // Sort by absolute score (most affected first)
  const sorted = [...archetypes].sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
  
  return (
    <div className="space-y-2">
      {sorted.map(arch => {
        const isPositive = arch.score > 20;
        const isNegative = arch.score < -20;
        
        return (
          <div 
            key={arch.archetype_key}
            className="flex items-center gap-2"
          >
            {/* Icon */}
            <span className="text-sm w-6 text-center">
              {ARCHETYPE_ICONS[arch.archetype_key] || '👤'}
            </span>
            
            {/* Name and bar */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-civic-text truncate">
                  {arch.archetype_name}
                </span>
                <span className={`text-xs font-mono ${
                  isPositive ? 'text-civic-support' : 
                  isNegative ? 'text-civic-oppose' : 'text-civic-neutral'
                }`}>
                  {arch.score > 0 ? '+' : ''}{arch.score.toFixed(0)}
                </span>
              </div>
              
              {/* Progress bar */}
              <div className="h-1.5 bg-civic-muted rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    isPositive ? 'bg-civic-support' : 
                    isNegative ? 'bg-civic-oppose' : 'bg-civic-neutral'
                  }`}
                  style={{
                    width: `${Math.min(100, Math.abs(arch.score))}%`,
                    marginLeft: arch.score < 0 ? 'auto' : 0,
                  }}
                />
              </div>
            </div>
            
            {/* Population % */}
            <span className="text-[10px] text-civic-text-secondary w-8 text-right">
              {(arch.population_pct * 100).toFixed(0)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

