import { useCivicStore } from '../../store';

// Agent avatars mapping
const AGENT_AVATARS: Record<string, string> = {
  'Margaret Chen': '🏠',
  'Alex Rivera': '🎓',
  'David Park': '🏪',
  'Jasmine Thompson': '🏘️',
  'Robert Sterling': '🏗️',
  'Sarah Mitchell': '📋',
  'Moderator': '🎤',
};

// Get stance color classes
function getStanceStyle(speakerName: string, reactions: Array<{ agent_name: string; stance: string }>) {
  const reaction = reactions.find(r => r.agent_name === speakerName);
  if (!reaction) return 'bg-civic-muted/20 border-civic-border';
  
  switch (reaction.stance) {
    case 'support':
      return 'bg-green-500/10 border-green-500/30';
    case 'oppose':
      return 'bg-red-500/10 border-red-500/30';
    default:
      return 'bg-yellow-500/10 border-yellow-500/30';
  }
}

export function TownHallTranscript() {
  const { townHall, agentReactions } = useCivicStore();
  
  if (!townHall) {
    return (
      <div className="h-full flex items-center justify-center text-civic-text-secondary">
        <div className="text-center p-6">
          <div className="text-4xl mb-3">🏛️</div>
          <p className="text-sm">No town hall transcript yet.</p>
          <p className="text-xs mt-1 opacity-60">
            Run a simulation to see community debate.
          </p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col">
      {/* Moderator summary */}
      <div className="p-4 border-b border-civic-border bg-civic-muted/20">
        <div className="flex items-start gap-3">
          <span className="text-2xl">🎤</span>
          <div>
            <h3 className="text-sm font-medium text-civic-text mb-1">Moderator Summary</h3>
            <p className="text-xs text-civic-text-secondary leading-relaxed">
              {townHall.moderator_summary}
            </p>
          </div>
        </div>
      </div>
      
      {/* Transcript turns */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {townHall.turns.map((turn, index) => {
          const avatar = AGENT_AVATARS[turn.speaker] || '👤';
          const styleClass = turn.speaker === 'Moderator' 
            ? 'bg-civic-muted/30 border-civic-border'
            : getStanceStyle(turn.speaker, agentReactions);
          
          return (
            <div
              key={index}
              className={`p-3 rounded-lg border ${styleClass} transition-colors`}
            >
              <div className="flex items-start gap-2">
                <span className="text-lg flex-shrink-0">{avatar}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-civic-text">
                    {turn.speaker}
                  </span>
                  <p className="text-xs text-civic-text-secondary mt-0.5 leading-relaxed">
                    {turn.text}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Compromise options */}
      {townHall.compromise_options.length > 0 && (
        <div className="p-4 border-t border-civic-border bg-civic-accent/5">
          <h4 className="text-xs font-medium text-civic-accent mb-2">
            💡 Potential Compromises
          </h4>
          <ul className="space-y-1">
            {townHall.compromise_options.map((option, index) => (
              <li 
                key={index}
                className="text-xs text-civic-text-secondary flex items-start gap-2"
              >
                <span className="text-civic-accent">•</span>
                <span>{option}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

