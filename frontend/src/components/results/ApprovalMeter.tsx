interface ApprovalMeterProps {
  score: number;
  sentiment: string;
}

export function ApprovalMeter({ score, sentiment }: ApprovalMeterProps) {
  // Normalize score to 0-100 range for display (assuming -100 to +100 input)
  const normalizedScore = (score + 100) / 2;
  
  const getColor = () => {
    if (score > 20) return 'text-civic-support';
    if (score < -20) return 'text-civic-oppose';
    return 'text-civic-neutral';
  };
  
  const getBgColor = () => {
    if (score > 20) return 'bg-civic-support';
    if (score < -20) return 'bg-civic-oppose';
    return 'bg-civic-neutral';
  };
  
  const getSentimentEmoji = () => {
    switch (sentiment.toLowerCase()) {
      case 'strong support': return '🎉';
      case 'moderate support': return '👍';
      case 'mixed': return '🤷';
      case 'moderate opposition': return '👎';
      case 'strong opposition': return '😤';
      default: return '📊';
    }
  };
  
  return (
    <div className="text-center">
      {/* Score display */}
      <div className="mb-2">
        <span className={`text-4xl font-bold font-mono ${getColor()}`}>
          {score > 0 ? '+' : ''}{score.toFixed(0)}
        </span>
      </div>
      
      {/* Sentiment label */}
      <div className="flex items-center justify-center gap-2 mb-4">
        <span className="text-lg">{getSentimentEmoji()}</span>
        <span className="text-sm text-civic-text-secondary capitalize">
          {sentiment}
        </span>
      </div>
      
      {/* Visual meter */}
      <div className="relative h-2 bg-civic-muted rounded-full overflow-hidden">
        {/* Center marker */}
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-civic-border z-10" />
        
        {/* Fill bar */}
        <div
          className={`absolute top-0 bottom-0 transition-all duration-500 ${getBgColor()}`}
          style={{
            left: score < 0 ? `${normalizedScore}%` : '50%',
            width: `${Math.abs(score) / 2}%`,
          }}
        />
      </div>
      
      {/* Scale labels */}
      <div className="flex justify-between mt-1 text-[10px] text-civic-text-secondary">
        <span>Oppose</span>
        <span>Neutral</span>
        <span>Support</span>
      </div>
    </div>
  );
}

