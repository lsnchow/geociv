import { useCivicStore } from '../../store';

// Stance icons and colors
const STANCE_CONFIG = {
  support: { icon: '👍', bgClass: 'bg-green-500/20', textClass: 'text-green-400', borderClass: 'border-green-500/30' },
  oppose: { icon: '👎', bgClass: 'bg-red-500/20', textClass: 'text-red-400', borderClass: 'border-red-500/30' },
  neutral: { icon: '🤔', bgClass: 'bg-yellow-500/20', textClass: 'text-yellow-400', borderClass: 'border-yellow-500/30' },
};

export function AgentReactions() {
  const { agentReactions, agentSimulation } = useCivicStore();
  
  if (agentReactions.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-civic-text-secondary">
        <div className="text-center p-6">
          <div className="text-4xl mb-3">👥</div>
          <p className="text-sm">No agent reactions yet.</p>
          <p className="text-xs mt-1 opacity-60">
            Propose something to see how stakeholders react.
          </p>
        </div>
      </div>
    );
  }
  
  // Count stances
  const supportCount = agentReactions.filter(r => r.stance === 'support').length;
  const opposeCount = agentReactions.filter(r => r.stance === 'oppose').length;
  const neutralCount = agentReactions.length - supportCount - opposeCount;
  
  return (
    <div className="h-full flex flex-col">
      {/* Summary header */}
      {agentSimulation?.proposal && (
        <div className="p-4 border-b border-civic-border">
          <h3 className="text-sm font-medium text-civic-text mb-1">
            {agentSimulation.proposal.title}
          </h3>
          <p className="text-xs text-civic-text-secondary mb-2">
            {agentSimulation.proposal.summary}
          </p>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-green-400">👍 {supportCount}</span>
            <span className="text-red-400">👎 {opposeCount}</span>
            <span className="text-yellow-400">🤔 {neutralCount}</span>
          </div>
        </div>
      )}
      
      {/* Agent reactions list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {agentReactions.map((reaction) => {
          const config = STANCE_CONFIG[reaction.stance];
          
          return (
            <div
              key={reaction.agent_key}
              className={`p-3 rounded-lg border ${config.borderClass} ${config.bgClass}`}
            >
              {/* Header */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{reaction.avatar}</span>
                <div className="flex-1">
                  <span className="text-sm font-medium text-civic-text">
                    {reaction.agent_name}
                  </span>
                </div>
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${config.bgClass} ${config.textClass}`}>
                  <span>{config.icon}</span>
                  <span className="uppercase font-medium">{reaction.stance}</span>
                </div>
              </div>
              
              {/* Quote */}
              {reaction.quote && (
                <blockquote className="text-xs text-civic-text italic mb-2 pl-2 border-l-2 border-civic-border">
                  "{reaction.quote}"
                </blockquote>
              )}
              
              {/* Concerns */}
              {reaction.concerns.length > 0 && (
                <div className="mb-2">
                  <span className="text-[10px] text-civic-text-secondary uppercase">Concerns:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {reaction.concerns.map((concern, i) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 bg-civic-muted/30 rounded text-civic-text-secondary">
                        {concern}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Support reasons */}
              {reaction.support_reasons.length > 0 && (
                <div className="mb-2">
                  <span className="text-[10px] text-civic-text-secondary uppercase">Why:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {reaction.support_reasons.map((reason, i) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 bg-green-500/10 rounded text-green-400">
                        {reason}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {/* What would change mind */}
              {reaction.what_would_change_my_mind.length > 0 && (
                <div>
                  <span className="text-[10px] text-civic-text-secondary uppercase">Would change mind if:</span>
                  <ul className="mt-1 space-y-0.5">
                    {reaction.what_would_change_my_mind.map((item, i) => (
                      <li key={i} className="text-[10px] text-civic-text-secondary flex items-start gap-1">
                        <span className="text-civic-accent">→</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Proposed amendments */}
              {reaction.proposed_amendments.length > 0 && (
                <div className="mt-2 pt-2 border-t border-civic-border/50">
                  <span className="text-[10px] text-civic-accent uppercase">Proposed amendments:</span>
                  <ul className="mt-1 space-y-0.5">
                    {reaction.proposed_amendments.map((amendment, i) => (
                      <li key={i} className="text-[10px] text-civic-text-secondary flex items-start gap-1">
                        <span className="text-civic-accent">+</span>
                        <span>{amendment}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Receipt */}
      {agentSimulation?.receipt && (
        <div className="p-2 border-t border-civic-border bg-civic-muted/10 text-[10px] text-civic-text-secondary">
          <span>⏱ {agentSimulation.receipt.duration_ms}ms</span>
          <span className="mx-2">•</span>
          <span>👥 {agentSimulation.receipt.agent_count} agents</span>
          <span className="mx-2">•</span>
          <span className="font-mono">{agentSimulation.receipt.run_hash}</span>
        </div>
      )}
    </div>
  );
}

