import { ProposalCard } from './ProposalCard';
import type { ProposalCard as ProposalCardType } from '../../types';
import { useCivicStore } from '../../store';

interface DraggableCardProps {
  card: ProposalCardType;
  isActive?: boolean;
  onClick?: () => void;
}

export function DraggableCard({ card, isActive, onClick }: DraggableCardProps) {
  const { setDraggedCard, setIsDragging } = useCivicStore();
  
  const handleDragStart = (e: React.DragEvent) => {
    // Set data for native HTML5 drag
    e.dataTransfer.setData('application/json', JSON.stringify(card));
    e.dataTransfer.effectAllowed = 'copy';
    
    // Update store state
    setDraggedCard(card);
    setIsDragging(true);
  };
  
  const handleDragEnd = () => {
    // Clean up if drop didn't happen on valid target
    // (handleDrop in MapArena will handle successful drops)
  };
  
  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className="cursor-grab active:cursor-grabbing"
    >
      <ProposalCard 
        card={card} 
        isActive={isActive}
        onClick={onClick}
      />
    </div>
  );
}

