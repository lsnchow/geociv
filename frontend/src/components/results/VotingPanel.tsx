import { useMemo } from 'react';
import type { AgentReaction, InterpretedProposal } from '../../types/simulation';

interface VotingPanelProps {
  reactions: AgentReaction[];
  proposal: InterpretedProposal;
  onAdopt: () => void;
  onForceForward: () => void;
  isAdopting?: boolean;
}

export function VotingPanel({ 
  reactions, 
  proposal: _proposal, // Keep for future use (e.g., showing proposal title)
  onAdopt, 
  onForceForward,
  isAdopting = false 
}: VotingPanelProps) {
  // Calculate vote tally using abstention-neutral voting
  const voteTally = useMemo(() => {
    const support = reactions.filter(r => r.stance === 'support').length;
    const oppose = reactions.filter(r => r.stance === 'oppose').length;
    const neutral = reactions.filter(r => r.stance === 'neutral').length;
    
    // Abstention-neutral: neutrals don't count in denominator
    const totalVotes = support + oppose;
    const agreementPct = totalVotes > 0 
      ? Math.round((support / totalVotes) * 100) 
      : 0;
    
    return { support, oppose, neutral, totalVotes, agreementPct };
  }, [reactions]);

  // Determine pass/fail
  const isPassing = voteTally.agreementPct >= 50;
  const isInsufficientSignal = voteTally.totalVotes === 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-civic-text-secondary uppercase tracking-wide">
          Consensus Gate
        </h4>
        {!isInsufficientSignal && (
          <span className={`text-xs font-bold px-2 py-1 rounded ${
            isPassing 
              ? 'bg-green-500/20 text-green-400' 
              : 'bg-red-500/20 text-red-400'
          }`}>
            {isPassing ? '✓ PASS' : '✗ FAIL'}
          </span>
        )}
        {isInsufficientSignal && (
          <span className="text-xs font-bold px-2 py-1 rounded bg-yellow-500/20 text-yellow-400">
            ⚠ INSUFFICIENT SIGNAL
          </span>
        )}
      </div>

      {/* Vote Tally */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-green-500/10 rounded-lg p-2">
          <div className="text-2xl font-bold text-green-400">{voteTally.support}</div>
          <div className="text-xs text-civic-text-secondary">Support</div>
        </div>
        <div className="bg-red-500/10 rounded-lg p-2">
          <div className="text-2xl font-bold text-red-400">{voteTally.oppose}</div>
          <div className="text-xs text-civic-text-secondary">Oppose</div>
        </div>
        <div className="bg-gray-500/10 rounded-lg p-2">
          <div className="text-2xl font-bold text-gray-400">{voteTally.neutral}</div>
          <div className="text-xs text-civic-text-secondary">Neutral</div>
        </div>
      </div>

      {/* Agreement Bar */}
      {!isInsufficientSignal && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-civic-text-secondary">
            <span>Agreement</span>
            <span>{voteTally.agreementPct}% (threshold: 50%)</span>
          </div>
          <div className="h-2 bg-civic-bg-tertiary rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ${
                isPassing ? 'bg-green-500' : 'bg-red-500'
              }`}
              style={{ width: `${voteTally.agreementPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Insufficient Signal Message */}
      {isInsufficientSignal && (
        <div className="text-sm text-yellow-400/80 bg-yellow-500/10 rounded-lg p-3">
          <p className="font-medium mb-1">No clear votes recorded</p>
          <p className="text-xs text-civic-text-secondary">
            All agents are neutral. Consider clarifying the proposal or use admin override.
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-2 pt-2">
        {/* Primary action: Promote to Policy */}
        <button
          onClick={onAdopt}
          disabled={!isPassing || isAdopting}
          title={isPassing ? 'Promote to persistent policy' : 'Needs ≥50% support'}
          className={`w-full py-2.5 px-4 rounded-lg font-medium text-sm transition-all ${
            isPassing && !isAdopting
              ? 'bg-green-600 hover:bg-green-500 text-white cursor-pointer'
              : 'bg-civic-bg-tertiary text-civic-text-secondary cursor-not-allowed opacity-50'
          }`}
        >
          {isAdopting ? '⏳ Promoting...' : '✓ Promote to Policy'}
        </button>
        
        {/* Discrete admin override link */}
        <div className="text-center">
          <button
            onClick={onForceForward}
            disabled={isAdopting}
            className={`text-xs transition-colors ${
              isAdopting
                ? 'text-civic-text-secondary/50 cursor-not-allowed'
                : 'text-civic-text-secondary hover:text-amber-400'
            }`}
          >
            Force policy (admin)
          </button>
        </div>
      </div>

      {/* Helper text */}
      <p className="text-xs text-civic-text-secondary text-center mt-2">
        {isPassing 
          ? 'Proposal meets consensus threshold (≥50%) and can be promoted.'
          : isInsufficientSignal
            ? 'Use admin override to proceed without consensus.'
            : `Proposal needs ≥50% support to pass (currently ${voteTally.agreementPct}%).`
        }
      </p>
    </div>
  );
}
