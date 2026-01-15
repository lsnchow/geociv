import { useState } from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { ProposalCard } from './ProposalCard';
import { DraggableCard } from './DraggableCard';
import { PROPOSAL_CARDS, useCivicStore, createProposalFromCard } from '../../store';
import { Panel, PanelSection } from '../ui';
import type { ProposalCard as ProposalCardType } from '../../types';

export function ProposalPalette() {
  const { 
    setActiveProposal, 
    setDraggedCard, 
    setIsDragging,
    activeProposal 
  } = useCivicStore();
  
  const [draggedItem, setDraggedItem] = useState<ProposalCardType | null>(null);
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );
  
  // Only show build cards (spatial proposals)
  const buildCards = PROPOSAL_CARDS.filter(c => c.category === 'build');
  
  const handleDragStart = (event: DragStartEvent) => {
    const card = PROPOSAL_CARDS.find(c => c.id === event.active.id);
    if (card) {
      setDraggedItem(card);
      setDraggedCard(card);
      setIsDragging(true);
    }
  };
  
  const handleDragEnd = (event: DragEndEvent) => {
    setDraggedItem(null);
    setIsDragging(false);
    
    // If dropped on map, the map handles creating the proposal
    // If dropped back in palette, do nothing
    if (!event.over) {
      setDraggedCard(null);
    }
  };
  
  const handleCardClick = (card: ProposalCardType) => {
    const proposal = createProposalFromCard(card);
    setActiveProposal(proposal);
  };
  
  return (
    <DndContext 
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <Panel title="Build" className="h-full flex flex-col">
        {/* Scrollable card list */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-3">
            <div className="grid grid-cols-2 gap-2">
              {buildCards.map(card => (
                <DraggableCard 
                  key={card.id} 
                  card={card}
                  isActive={activeProposal?.type === 'spatial' && 
                    activeProposal.spatial_type === card.subtype}
                  onClick={() => handleCardClick(card)}
                />
              ))}
            </div>
          </div>
        </div>
        
        {/* Help text */}
        <PanelSection className="border-t border-civic-border text-center">
          <p className="text-[10px] text-civic-text-secondary">
            Click to select • Drag to map to place
          </p>
        </PanelSection>
      </Panel>
      
      {/* Drag overlay */}
      <DragOverlay>
        {draggedItem && (
          <ProposalCard card={draggedItem} isDragging />
        )}
      </DragOverlay>
    </DndContext>
  );
}

