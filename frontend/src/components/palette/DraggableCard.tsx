import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { ProposalCard } from './ProposalCard';
import type { ProposalCard as ProposalCardType } from '../../types';

interface DraggableCardProps {
  card: ProposalCardType;
  isActive?: boolean;
  onClick?: () => void;
}

export function DraggableCard({ card, isActive, onClick }: DraggableCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: card,
  });
  
  const style = transform ? {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  } : undefined;
  
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
    >
      <ProposalCard 
        card={card} 
        isActive={isActive}
        onClick={onClick}
      />
    </div>
  );
}

