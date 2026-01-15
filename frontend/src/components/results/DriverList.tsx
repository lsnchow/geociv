import type { MetricDriver } from '../../types';
import { Badge } from '../ui';

interface DriverListProps {
  drivers: MetricDriver[];
}

const METRIC_ICONS: Record<string, string> = {
  affordability: '💰',
  housing_supply: '🏠',
  mobility: '🚌',
  environmental_quality: '🌿',
  economic_vitality: '📈',
  safety: '🛡️',
  equity: '⚖️',
  governance_trust: '🏛️',
};

export function DriverList({ drivers }: DriverListProps) {
  if (!drivers.length) {
    return (
      <p className="text-xs text-civic-text-secondary text-center py-2">
        No significant drivers
      </p>
    );
  }
  
  return (
    <div className="space-y-2">
      {drivers.map((driver) => (
        <div 
          key={driver.metric_key}
          className="flex items-start gap-2 p-2 rounded bg-civic-bg"
        >
          {/* Icon */}
          <span className="text-sm">
            {METRIC_ICONS[driver.metric_key] || '📊'}
          </span>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-civic-text truncate">
                {driver.metric_name}
              </span>
              <Badge 
                variant={driver.direction === 'positive' ? 'support' : driver.direction === 'negative' ? 'oppose' : 'neutral'}
                size="sm"
              >
                {driver.direction === 'positive' ? '↑' : driver.direction === 'negative' ? '↓' : '•'} 
                {Math.abs(driver.delta).toFixed(1)}
              </Badge>
            </div>
            <p className="text-[10px] text-civic-text-secondary mt-0.5 leading-tight">
              {driver.explanation}
            </p>
          </div>
          
          {/* Contribution */}
          <div className={`text-xs font-mono ${
            driver.contribution > 0 ? 'text-civic-support' : 
            driver.contribution < 0 ? 'text-civic-oppose' : 'text-civic-neutral'
          }`}>
            {driver.contribution > 0 ? '+' : ''}{driver.contribution.toFixed(0)}
          </div>
        </div>
      ))}
    </div>
  );
}

