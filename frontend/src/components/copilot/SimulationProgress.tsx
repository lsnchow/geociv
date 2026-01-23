/**
 * SimulationProgress - Real-time progress display for long-running simulations.
 * 
 * Shows:
 * - Progress bar (0-100%)
 * - Current phase label
 * - Agent completion count
 * - Phase-specific messaging
 * 
 * Transforms perceived latency into visible analytical work.
 */

import type { SimulationJob } from '../../store';
import { cn } from '../../lib/utils';

// Phase display configuration
const PHASE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  initializing: {
    label: 'Initializing',
    icon: '⚙️',
    color: 'text-gray-400',
  },
  interpreting: {
    label: 'Analyzing Proposal',
    icon: '🔍',
    color: 'text-blue-400',
  },
  analyzing_impact: {
    label: 'Evaluating Impact',
    icon: '📊',
    color: 'text-cyan-400',
  },
  agent_reactions: {
    label: 'Stakeholder Reactions',
    icon: '👥',
    color: 'text-amber-400',
  },
  coalition_synthesis: {
    label: 'Coalition Analysis',
    icon: '🤝',
    color: 'text-purple-400',
  },
  generating_townhall: {
    label: 'Town Hall Debate',
    icon: '🏛️',
    color: 'text-indigo-400',
  },
  finalizing: {
    label: 'Preparing Results',
    icon: '✨',
    color: 'text-green-400',
  },
  complete: {
    label: 'Complete',
    icon: '✅',
    color: 'text-green-500',
  },
  error: {
    label: 'Error',
    icon: '❌',
    color: 'text-red-500',
  },
};

interface SimulationProgressProps {
  job: SimulationJob;
  onCancel?: () => void;
  className?: string;
  compact?: boolean;
}

export function SimulationProgress({ job, onCancel, className, compact = false }: SimulationProgressProps) {
  const { status, progress, phase, message, completedAgents, totalAgents, error } = job;
  
  // Don't show if idle
  if (status === 'idle') {
    return null;
  }
  
  const phaseConfig = PHASE_CONFIG[phase] || PHASE_CONFIG.initializing;
  const isRunning = status === 'pending' || status === 'running';
  const isComplete = status === 'complete';
  const isError = status === 'error';
  
  // Calculate progress bar gradient based on phase
  const getProgressGradient = () => {
    if (isError) return 'bg-red-500';
    if (isComplete) return 'bg-green-500';
    if (phase === 'agent_reactions') return 'bg-gradient-to-r from-amber-500 to-orange-500';
    if (phase === 'generating_townhall') return 'bg-gradient-to-r from-indigo-500 to-purple-500';
    return 'bg-gradient-to-r from-blue-500 to-cyan-500';
  };
  
  if (compact) {
    return (
      <div className={cn('flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-800/50', className)}>
        {/* Animated spinner or icon */}
        <div className={cn('text-lg', isRunning && 'animate-pulse')}>
          {phaseConfig.icon}
        </div>
        
        {/* Progress bar (thin) */}
        <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={cn('h-full transition-all duration-500 ease-out', getProgressGradient())}
            style={{ width: `${progress}%` }}
          />
        </div>
        
        {/* Percentage */}
        <span className="text-xs text-gray-400 tabular-nums min-w-[3ch]">
          {Math.round(progress)}%
        </span>
      </div>
    );
  }
  
  return (
    <div className={cn(
      'rounded-xl border overflow-hidden',
      isError ? 'border-red-500/30 bg-red-950/20' : 'border-gray-700/50 bg-gray-900/50',
      className
    )}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn('text-xl', isRunning && 'animate-pulse')}>
              {phaseConfig.icon}
            </span>
            <span className={cn('font-medium', phaseConfig.color)}>
              {phaseConfig.label}
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Agent counter (if in agent phase) */}
            {phase === 'agent_reactions' && totalAgents > 0 && (
              <span className="text-sm text-gray-400">
                <span className="text-amber-400 font-medium">{completedAgents}</span>
                <span className="text-gray-500">/{totalAgents}</span>
                <span className="ml-1 text-gray-500">agents</span>
              </span>
            )}
            
            {/* Percentage */}
            <span className="text-lg font-semibold tabular-nums">
              {Math.round(progress)}%
            </span>
          </div>
        </div>
      </div>
      
      {/* Progress bar */}
      <div className="h-2 bg-gray-800">
        <div
          className={cn(
            'h-full transition-all duration-500 ease-out',
            getProgressGradient(),
            isRunning && 'animate-pulse'
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
      
      {/* Message and actions */}
      <div className="px-4 py-3">
        {isError ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-red-400">{error || 'Simulation failed'}</p>
            {onCancel && (
              <button
                onClick={onCancel}
                className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-800"
              >
                Dismiss
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">{message || 'Processing...'}</p>
            {isRunning && onCancel && (
              <button
                onClick={onCancel}
                className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-800"
              >
                Cancel
              </button>
            )}
          </div>
        )}
      </div>
      
      {/* Phase steps indicator */}
      {isRunning && (
        <div className="px-4 pb-3">
          <div className="flex gap-1">
            {Object.entries(PHASE_CONFIG)
              .filter(([key]) => !['complete', 'error', 'initializing'].includes(key))
              .map(([key, config]) => {
                const phaseOrder = ['interpreting', 'analyzing_impact', 'agent_reactions', 'coalition_synthesis', 'generating_townhall', 'finalizing'];
                const currentIndex = phaseOrder.indexOf(phase);
                const stepIndex = phaseOrder.indexOf(key);
                const isActive = key === phase;
                const isCompleted = stepIndex < currentIndex;
                
                return (
                  <div
                    key={key}
                    className={cn(
                      'flex-1 h-1 rounded-full transition-all duration-300',
                      isCompleted ? 'bg-green-500' : isActive ? getProgressGradient() : 'bg-gray-700'
                    )}
                    title={config.label}
                  />
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

// Minimal inline progress for use in other components
interface SimulationProgressInlineProps {
  job: SimulationJob;
}

export function SimulationProgressInline({ job }: SimulationProgressInlineProps) {
  const { status, progress, phase, completedAgents, totalAgents } = job;
  
  if (status === 'idle' || status === 'complete') {
    return null;
  }
  
  const phaseConfig = PHASE_CONFIG[phase] || PHASE_CONFIG.initializing;
  
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="animate-pulse">{phaseConfig.icon}</span>
      <span className={phaseConfig.color}>{phaseConfig.label}</span>
      {phase === 'agent_reactions' && totalAgents > 0 && (
        <span className="text-gray-500">
          ({completedAgents}/{totalAgents})
        </span>
      )}
      <span className="text-gray-500">{Math.round(progress)}%</span>
    </div>
  );
}
