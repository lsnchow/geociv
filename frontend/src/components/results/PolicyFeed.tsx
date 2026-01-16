/**
 * PolicyFeed - Unified scrollable feed with sticky section headers
 * Policies (persistent) appear first, then general proposals (ephemeral)
 */

import { useState } from 'react';
import { useCivicStore } from '../../store';
import type { AdoptedEvent, ProposalFeedItem } from '../../types/simulation';

// Confirmation modal for force policy
function ForceConfirmModal({ 
  proposal, 
  onConfirm, 
  onCancel 
}: { 
  proposal: ProposalFeedItem; 
  onConfirm: () => void; 
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-civic-surface border border-civic-border rounded-lg p-6 max-w-md mx-4">
        <h3 className="text-lg font-semibold text-civic-text mb-2">Force Policy?</h3>
        <p className="text-sm text-civic-text-secondary mb-4">
          Force adopt "<span className="text-civic-text">{proposal.proposal.title}</span>" as policy?
          This will persist and affect all future simulations.
        </p>
        <div className={`border rounded p-3 mb-4 ${proposal.can_promote ? 'bg-green-500/10 border-green-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
          <p className={`text-xs ${proposal.can_promote ? 'text-green-400' : 'text-amber-400'}`}>
            {proposal.can_promote 
              ? `✓ Current approval: ${proposal.vote_summary.agreement_pct}% (meets 50% threshold)`
              : `⚠️ Current approval: ${proposal.vote_summary.agreement_pct}% (below 50% threshold)`
            }
          </p>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-civic-text-secondary hover:text-civic-text"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-500 text-white rounded"
          >
            Force Adopt
          </button>
        </div>
      </div>
    </div>
  );
}

// Policy card (adopted/forced)
function PolicyCard({ policy }: { policy: AdoptedEvent }) {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div className="bg-civic-elevated rounded-lg p-3 border border-civic-border">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-civic-text truncate">
            {policy.proposal.title}
          </h4>
          <p className="text-xs text-civic-text-secondary line-clamp-2 mt-1">
            {policy.proposal.summary}
          </p>
        </div>
        <span className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded font-medium ${
          policy.outcome === 'adopted' 
            ? 'bg-green-500/20 text-green-400' 
            : 'bg-amber-500/20 text-amber-400'
        }`}>
          {policy.outcome === 'adopted' ? '✓ Adopted' : '⚡ Forced'}
        </span>
      </div>
      
      {/* Vote breakdown */}
      <div className="flex items-center gap-3 mt-3 text-xs">
        <span className="text-green-400">👍 {policy.vote_summary.support}</span>
        <span className="text-red-400">👎 {policy.vote_summary.oppose}</span>
        <span className="text-gray-400">🤔 {policy.vote_summary.neutral}</span>
        <span className="text-civic-text-secondary ml-auto">
          {policy.vote_summary.agreement_pct}% support
        </span>
      </div>
      
      {/* Timestamp */}
      <div className="text-[10px] text-civic-text-secondary mt-2">
        {new Date(policy.timestamp).toLocaleString()}
      </div>
      
      {/* Expandable quotes */}
      {policy.key_quotes.length > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-civic-accent mt-2 hover:underline"
        >
          {expanded ? '▼ Hide quotes' : '▶ Show key quotes'}
        </button>
      )}
      
      {expanded && policy.key_quotes.length > 0 && (
        <div className="mt-2 space-y-1">
          {policy.key_quotes.map((q, i) => (
            <div key={i} className="text-xs bg-civic-bg-tertiary rounded p-2">
              <span className={`font-medium ${
                q.stance === 'support' ? 'text-green-400' : 'text-red-400'
              }`}>
                {q.agent_name}:
              </span>
              <span className="text-civic-text-secondary ml-1">"{q.quote}"</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Proposal card (ephemeral in feed)
function ProposalCard({ 
  item, 
  onPromote, 
  onForce 
}: { 
  item: ProposalFeedItem; 
  onPromote: () => void;
  onForce: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  
  // Stance grid - 7 agents
  const stanceGrid = item.reactions.slice(0, 7).map(r => ({
    name: r.agent_name.split(' ')[0], // First name only
    stance: r.stance,
  }));
  
  return (
    <div className={`bg-civic-elevated rounded-lg p-3 border ${
      item.is_promoted ? 'border-green-500/30 opacity-60' : 'border-civic-border'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              item.source === 'townhall' 
                ? 'bg-purple-500/20 text-purple-400' 
                : item.source === 'placement'
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'bg-gray-500/20 text-gray-400'
            }`}>
              {item.source === 'townhall' ? '🏛️' : item.source === 'placement' ? '📍' : '💬'}
            </span>
            <h4 className="text-sm font-medium text-civic-text truncate">
              {item.proposal.title}
            </h4>
          </div>
          <p className="text-xs text-civic-text-secondary line-clamp-2 mt-1">
            {item.proposal.summary}
          </p>
        </div>
        
        {/* Approval badge */}
        <div className={`flex-shrink-0 text-center px-2 py-1 rounded ${
          item.can_promote 
            ? 'bg-green-500/20 text-green-400' 
            : 'bg-red-500/20 text-red-400'
        }`}>
          <div className="text-lg font-bold">{item.vote_summary.agreement_pct}%</div>
          <div className="text-[10px]">{item.can_promote ? 'PASS' : 'FAIL'}</div>
        </div>
      </div>
      
      {/* Stance grid */}
      <div className="flex items-center gap-1 mt-3">
        {stanceGrid.map((s, i) => (
          <div
            key={i}
            className={`flex-1 text-center py-1 rounded text-[10px] ${
              s.stance === 'support' 
                ? 'bg-green-500/20 text-green-400' 
                : s.stance === 'oppose'
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-gray-500/20 text-gray-400'
            }`}
            title={s.name}
          >
            {s.stance === 'support' ? '👍' : s.stance === 'oppose' ? '👎' : '🤔'}
          </div>
        ))}
      </div>
      
      {/* Actions */}
      <div className="flex items-center justify-between mt-3">
        <span className="text-[10px] text-civic-text-secondary">
          {new Date(item.timestamp).toLocaleTimeString()}
        </span>
        
        {item.is_promoted ? (
          <span className="text-xs text-green-400">✓ Promoted to policy</span>
        ) : (
          <div className="flex items-center gap-2">
            {/* Force policy (admin) - discrete grey link */}
            <button
              onClick={onForce}
              className="text-[10px] text-civic-text-secondary hover:text-amber-400 transition-colors"
              title="Force adopt (admin override)"
            >
              Force policy (admin)
            </button>
            
            {/* Promote to Policy button */}
            <button
              onClick={onPromote}
              disabled={!item.can_promote}
              className={`text-xs px-3 py-1 rounded font-medium transition-colors ${
                item.can_promote
                  ? 'bg-green-600 hover:bg-green-500 text-white'
                  : 'bg-civic-bg-tertiary text-civic-text-secondary cursor-not-allowed'
              }`}
              title={item.can_promote ? 'Promote to persistent policy' : 'Needs ≥50% support'}
            >
              Promote to Policy
            </button>
          </div>
        )}
      </div>
      
      {/* Expandable details */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-[10px] text-civic-accent mt-2 hover:underline"
      >
        {expanded ? '▼ Hide details' : '▶ Show agent details'}
      </button>
      
      {expanded && (
        <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
          {item.reactions.map((r, i) => (
            <div key={i} className="text-xs bg-civic-bg-tertiary rounded p-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-civic-text">{r.agent_name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  r.stance === 'support' 
                    ? 'bg-green-500/20 text-green-400' 
                    : r.stance === 'oppose'
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-gray-500/20 text-gray-400'
                }`}>
                  {r.stance}
                </span>
              </div>
              <p className="text-civic-text-secondary">"{r.quote}"</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PolicyFeed() {
  const { 
    adoptedProposals, 
    proposalFeed, 
    promoteToPolicy, 
    forcePolicy,
    isAdopting,
    adoptionError,
    clearAdoptionError,
  } = useCivicStore();
  
  const [forceConfirm, setForceConfirm] = useState<ProposalFeedItem | null>(null);
  
  const handlePromote = async (proposalId: string) => {
    await promoteToPolicy(proposalId);
  };
  
  const handleForceClick = (item: ProposalFeedItem) => {
    setForceConfirm(item);
  };
  
  const handleForceConfirm = async () => {
    if (forceConfirm) {
      await forcePolicy(forceConfirm.id);
      setForceConfirm(null);
    }
  };
  
  // Split feed into policies (promoted) and proposals (not promoted)
  const recentProposals = proposalFeed.filter(p => !p.is_promoted);
  
  const hasContent = adoptedProposals.length > 0 || recentProposals.length > 0;
  
  if (!hasContent) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-3 opacity-50">📋</div>
        <p className="text-sm text-civic-text-secondary">
          No policies or proposals yet
        </p>
        <p className="text-xs text-civic-text-secondary mt-1">
          Use ⌘K to propose policies or drop buildings on the map
        </p>
      </div>
    );
  }
  
  return (
    <div className="h-full overflow-y-auto">
      {/* Error banner */}
      {adoptionError && (
        <div className="mx-2 mt-2 p-3 bg-red-500/20 border border-red-500/30 rounded-lg flex items-start gap-2">
          <span className="text-red-400">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-red-400 font-medium">Policy adoption failed</p>
            <p className="text-xs text-red-400/80 mt-0.5">{adoptionError}</p>
          </div>
          <button
            onClick={clearAdoptionError}
            className="text-red-400 hover:text-red-300 text-sm"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      
      {/* Force confirm modal */}
      {forceConfirm && (
        <ForceConfirmModal
          proposal={forceConfirm}
          onConfirm={handleForceConfirm}
          onCancel={() => setForceConfirm(null)}
        />
      )}
      
      {/* Policies section (sticky header) */}
      {adoptedProposals.length > 0 && (
        <div>
          <div className="sticky top-0 bg-civic-surface/95 backdrop-blur z-10 px-1 py-2 border-b border-civic-border">
            <h3 className="text-xs font-medium text-civic-text-secondary uppercase tracking-wide flex items-center gap-2">
              <span className="text-green-400">●</span>
              Active Policies ({adoptedProposals.length})
            </h3>
          </div>
          <div className="space-y-2 p-2">
            {adoptedProposals.map(policy => (
              <PolicyCard key={policy.id} policy={policy} />
            ))}
          </div>
        </div>
      )}
      
      {/* Recent proposals section (sticky header) */}
      {recentProposals.length > 0 && (
        <div>
          <div className="sticky top-0 bg-civic-surface/95 backdrop-blur z-10 px-1 py-2 border-b border-civic-border">
            <h3 className="text-xs font-medium text-civic-text-secondary uppercase tracking-wide flex items-center gap-2">
              <span className="text-blue-400">●</span>
              Recent Proposals ({recentProposals.length})
            </h3>
          </div>
          <div className="space-y-2 p-2">
            {recentProposals.map(item => (
              <ProposalCard
                key={item.id}
                item={item}
                onPromote={() => handlePromote(item.id)}
                onForce={() => handleForceClick(item)}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* Loading overlay */}
      {isAdopting && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-40">
          <div className="bg-civic-surface rounded-lg p-4 flex items-center gap-3">
            <span className="animate-spin text-xl">⏳</span>
            <span className="text-sm text-civic-text">Promoting policy...</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default PolicyFeed;
