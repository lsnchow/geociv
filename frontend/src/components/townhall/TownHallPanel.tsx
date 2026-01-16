import { useState } from 'react';
import type { TownHallTranscript, Speaker, Exchange } from '../../types/ai';
import { Panel, PanelSection, PanelDivider, Button, Badge } from '../ui';

interface TownHallPanelProps {
  transcript: TownHallTranscript;
  onCrossExamine?: (speakerArchetype: string, question: string) => Promise<void>;
  onFlipSpeaker?: (speakerArchetype: string) => Promise<void>;
  onPromoteToPolicy?: () => Promise<void>;
  onForcePolicy?: () => Promise<void>;
  canPromote?: boolean;  // true if approval >= 50%
  isPromoted?: boolean;  // true if already a policy
  isLoading?: boolean;
}

export function TownHallPanel({ 
  transcript, 
  onCrossExamine, 
  onFlipSpeaker,
  onPromoteToPolicy,
  onForcePolicy,
  canPromote = false,
  isPromoted = false,
  isLoading: _isLoading,
}: TownHallPanelProps) {
  void _isLoading; // Available for future loading states
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);
  const [crossExamineQuestion, setCrossExamineQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [showForceConfirm, setShowForceConfirm] = useState(false);
  
  const handleCrossExamine = async () => {
    if (!selectedSpeaker || !crossExamineQuestion.trim() || !onCrossExamine) return;
    
    setIsAsking(true);
    try {
      await onCrossExamine(selectedSpeaker, crossExamineQuestion);
      setCrossExamineQuestion('');
    } finally {
      setIsAsking(false);
    }
  };
  
  const getSpeakerById = (id: string) => transcript.speakers.find(s => s.id === id);
  
  return (
    <Panel title="🏛️ Town Hall" className="h-full flex flex-col">
      {/* Summary */}
      <PanelSection className="border-b border-civic-border">
        <p className="text-sm text-civic-text">{transcript.summary}</p>
        <div className="flex items-center justify-between gap-2 mt-2">
          <Badge variant={
            transcript.vote_prediction.includes('pass') ? 'support' :
            transcript.vote_prediction.includes('fail') ? 'oppose' : 'neutral'
          }>
            {transcript.vote_prediction}
          </Badge>
          
          {/* Promote to Policy actions */}
          {!isPromoted && onPromoteToPolicy && (
            <div className="flex items-center gap-2">
              {/* Discrete admin link */}
              {onForcePolicy && (
                <button
                  onClick={() => setShowForceConfirm(true)}
                  className="text-[10px] text-civic-text-secondary hover:text-amber-400 transition-colors"
                >
                  Force (admin)
                </button>
              )}
              
              {/* Primary promote button */}
              <button
                onClick={onPromoteToPolicy}
                disabled={!canPromote}
                title={canPromote ? 'Promote to persistent policy' : 'Needs ≥50% support'}
                className={`text-xs px-3 py-1 rounded font-medium transition-colors ${
                  canPromote
                    ? 'bg-green-600 hover:bg-green-500 text-white'
                    : 'bg-civic-bg-tertiary text-civic-text-secondary cursor-not-allowed'
                }`}
              >
                Promote to Policy
              </button>
            </div>
          )}
          
          {isPromoted && (
            <span className="text-xs text-green-400">✓ Policy</span>
          )}
        </div>
        
        {/* Force confirmation */}
        {showForceConfirm && (
          <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded">
            <p className="text-xs text-amber-400 mb-2">
              Force adopt this proposal as policy? This will persist and affect future simulations.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowForceConfirm(false)}
                className="text-xs text-civic-text-secondary hover:text-civic-text px-2 py-1"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onForcePolicy?.();
                  setShowForceConfirm(false);
                }}
                className="text-xs bg-amber-600 hover:bg-amber-500 text-white px-3 py-1 rounded"
              >
                Force Adopt
              </button>
            </div>
          </div>
        )}
      </PanelSection>
      
      {/* Speakers */}
      <PanelSection className="border-b border-civic-border">
        <h4 className="text-xs font-medium text-civic-text-secondary mb-2">SPEAKERS</h4>
        <div className="flex flex-wrap gap-2">
          {transcript.speakers.map(speaker => (
            <SpeakerChip
              key={speaker.id}
              speaker={speaker}
              isSelected={selectedSpeaker === speaker.archetype_key}
              onClick={() => setSelectedSpeaker(
                selectedSpeaker === speaker.archetype_key ? null : speaker.archetype_key
              )}
            />
          ))}
        </div>
      </PanelSection>
      
      {/* Transcript */}
      <div className="flex-1 overflow-y-auto">
        <PanelSection className="space-y-3">
          {transcript.exchanges.map((exchange, idx) => {
            const speaker = getSpeakerById(exchange.speaker_id);
            return (
              <ExchangeBubble
                key={idx}
                exchange={exchange}
                speaker={speaker}
              />
            );
          })}
        </PanelSection>
      </div>
      
      {/* Key tensions & consensus */}
      {(transcript.key_tensions.length > 0 || transcript.consensus_points.length > 0) && (
        <>
          <PanelDivider />
          <PanelSection className="border-t border-civic-border">
            {transcript.key_tensions.length > 0 && (
              <div className="mb-2">
                <h5 className="text-[10px] text-civic-oppose font-medium mb-1">KEY TENSIONS</h5>
                <ul className="text-xs text-civic-text-secondary space-y-0.5">
                  {transcript.key_tensions.map((t, i) => (
                    <li key={i}>⚡ {t}</li>
                  ))}
                </ul>
              </div>
            )}
            {transcript.consensus_points.length > 0 && (
              <div>
                <h5 className="text-[10px] text-civic-support font-medium mb-1">CONSENSUS</h5>
                <ul className="text-xs text-civic-text-secondary space-y-0.5">
                  {transcript.consensus_points.map((c, i) => (
                    <li key={i}>✓ {c}</li>
                  ))}
                </ul>
              </div>
            )}
          </PanelSection>
        </>
      )}
      
      {/* Cross-examine / Flip actions */}
      {selectedSpeaker && (
        <PanelSection className="border-t border-civic-border space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={crossExamineQuestion}
              onChange={(e) => setCrossExamineQuestion(e.target.value)}
              placeholder="Ask a question..."
              className="flex-1 bg-civic-bg border border-civic-border rounded px-2 py-1.5 text-xs text-civic-text focus:outline-none focus:border-civic-accent"
              disabled={isAsking}
            />
            <Button
              size="sm"
              onClick={handleCrossExamine}
              disabled={!crossExamineQuestion.trim() || isAsking || !onCrossExamine}
              loading={isAsking}
            >
              Ask
            </Button>
          </div>
          {onFlipSpeaker && (
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => onFlipSpeaker(selectedSpeaker)}
            >
              🔄 How to flip {getSpeakerById(selectedSpeaker)?.name || 'this speaker'}?
            </Button>
          )}
        </PanelSection>
      )}
    </Panel>
  );
}

interface SpeakerChipProps {
  speaker: Speaker;
  isSelected: boolean;
  onClick: () => void;
}

function SpeakerChip({ speaker, isSelected, onClick }: SpeakerChipProps) {
  const stanceColor = speaker.stance === 'support' 
    ? 'border-civic-support' 
    : speaker.stance === 'oppose' 
      ? 'border-civic-oppose' 
      : 'border-civic-neutral';
  
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-full border transition-all ${
        isSelected 
          ? 'bg-civic-accent/20 border-civic-accent' 
          : `bg-civic-elevated ${stanceColor} hover:bg-civic-muted/30`
      }`}
    >
      <span className="text-sm">{speaker.avatar_emoji}</span>
      <span className="text-xs text-civic-text">{speaker.name.split(' ')[0]}</span>
      <span className={`text-[10px] font-mono ${
        speaker.approval_score > 20 ? 'text-civic-support' :
        speaker.approval_score < -20 ? 'text-civic-oppose' : 'text-civic-neutral'
      }`}>
        {speaker.approval_score > 0 ? '+' : ''}{speaker.approval_score.toFixed(0)}
      </span>
    </button>
  );
}

interface ExchangeBubbleProps {
  exchange: Exchange;
  speaker?: Speaker;
}

function ExchangeBubble({ exchange, speaker }: ExchangeBubbleProps) {
  const getTypeIcon = () => {
    switch (exchange.type) {
      case 'statement': return '💬';
      case 'question': return '❓';
      case 'rebuttal': return '⚡';
      case 'interruption': return '✋';
      case 'agreement': return '👍';
      default: return '💬';
    }
  };
  
  const getEmotionStyle = () => {
    switch (exchange.emotion) {
      case 'angry': return 'border-l-civic-oppose';
      case 'supportive': return 'border-l-civic-support';
      case 'concerned': return 'border-l-orange-500';
      case 'hopeful': return 'border-l-cyan-500';
      default: return 'border-l-civic-muted';
    }
  };
  
  return (
    <div className={`pl-3 border-l-2 ${getEmotionStyle()}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm">{speaker?.avatar_emoji || '👤'}</span>
        <span className="text-xs font-medium text-civic-text">
          {speaker?.name || 'Unknown Speaker'}
        </span>
        <span className="text-[10px] text-civic-text-secondary">
          {speaker?.role}
        </span>
        <span className="text-xs">{getTypeIcon()}</span>
      </div>
      <p className="text-sm text-civic-text leading-relaxed">
        {exchange.content}
      </p>
      {exchange.cited_metrics.length > 0 && (
        <div className="flex gap-1 mt-1">
          {exchange.cited_metrics.map(m => (
            <Badge key={m} variant="default" size="sm">
              {m.replace('_', ' ')}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// Loading skeleton
export function TownHallSkeleton() {
  return (
    <Panel title="🏛️ Town Hall" className="h-full">
      <PanelSection>
        <div className="text-center py-8">
          <div className="animate-pulse text-3xl mb-3">🗣️</div>
          <p className="text-sm text-civic-text-secondary">
            Generating town hall...
          </p>
          <p className="text-xs text-civic-text-secondary mt-1">
            Assembling speakers and arguments
          </p>
        </div>
      </PanelSection>
    </Panel>
  );
}

