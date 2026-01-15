import type { ProposalCard as ProposalCardType } from '../../types';

interface ProposalCardProps {
  card: ProposalCardType;
  isDragging?: boolean;
  isActive?: boolean;
  onClick?: () => void;
}

export function ProposalCard({ card, isDragging, isActive, onClick }: ProposalCardProps) {
  return (
    <div
      onClick={onClick}
      className={`
        p-2.5 rounded-lg border cursor-pointer transition-all select-none
        ${isDragging 
          ? 'bg-civic-elevated border-civic-accent shadow-lg shadow-civic-accent/20 scale-105 rotate-2' 
          : isActive
            ? 'bg-civic-accent/10 border-civic-accent'
            : 'bg-civic-elevated border-civic-border hover:border-civic-muted hover:bg-civic-muted/30'
        }
      `}
    >
      <div className="flex items-start gap-2">
        <span className="text-lg leading-none">{card.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-civic-text truncate">
            {card.name}
          </div>
          <div className="text-[10px] text-civic-text-secondary truncate">
            {card.description}
          </div>
        </div>
      </div>
    </div>
  );
}

