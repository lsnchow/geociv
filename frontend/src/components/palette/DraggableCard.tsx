import { ProposalCard } from './ProposalCard';
import { useCivicStore } from '../../store';
import type { ProposalCard as ProposalCardType } from '../../types';

interface DraggableCardProps {
  card: ProposalCardType;
  isActive?: boolean;
  onClick?: () => void;
}

export function DraggableCard({ card, isActive, onClick }: DraggableCardProps) {
  const { setDraggedCard, setIsDragging } = useCivicStore();
  const enableDndDebug = import.meta.env.DEV;

  const handleNativeDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    const payload = JSON.stringify({ cardId: card.id });
    event.dataTransfer.setData('text/plain', payload);
    event.dataTransfer.effectAllowed = 'copy';
    setDraggedCard(card);
    setIsDragging(true);
    if (enableDndDebug) {
      console.log('dragstart payload', payload, event.dataTransfer.types);
    }
  };

  const handleNativeDragEnd = () => {
    setIsDragging(false);
    setDraggedCard(null);
    if (enableDndDebug) {
      console.log('dragend');
    }
  };

  return (
    <div
      draggable
      onDragStart={handleNativeDragStart}
      onDragEnd={handleNativeDragEnd}
    >
      <ProposalCard 
        card={card} 
        isActive={isActive}
        onClick={onClick}
      />
    </div>
  );
}

