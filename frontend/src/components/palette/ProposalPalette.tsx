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
  const [filter, setFilter] = useState<'all' | 'build' | 'policy'>('all');
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );
  
  const filteredCards = PROPOSAL_CARDS.filter(card => 
    filter === 'all' || card.category === filter
  );
  
  const buildCards = filteredCards.filter(c => c.category === 'build');
  const policyCards = filteredCards.filter(c => c.category === 'policy');
  
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
      <Panel title="Proposals" className="h-full flex flex-col">
        {/* Filter tabs */}
        <PanelSection className="border-b border-civic-border pb-3">
          <div className="flex gap-1 bg-civic-bg rounded-md p-0.5">
            {(['all', 'build', 'policy'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 text-xs py-1.5 px-3 rounded transition-colors ${
                  filter === f 
                    ? 'bg-civic-elevated text-civic-text' 
                    : 'text-civic-text-secondary hover:text-civic-text'
                }`}
              >
                {f === 'all' ? 'All' : f === 'build' ? '🏗️ Build' : '📋 Policy'}
              </button>
            ))}
          </div>
        </PanelSection>
        
        {/* Scrollable card list */}
        <div className="flex-1 overflow-y-auto">
          {/* Build section */}
          {(filter === 'all' || filter === 'build') && buildCards.length > 0 && (
            <div className="p-3">
              {filter === 'all' && (
                <h4 className="text-[10px] uppercase tracking-wider text-civic-text-secondary mb-2">
                  Build
                </h4>
              )}
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
          )}
          
          {/* Policy section */}
          {(filter === 'all' || filter === 'policy') && policyCards.length > 0 && (
            <div className="p-3 pt-0">
              {filter === 'all' && (
                <h4 className="text-[10px] uppercase tracking-wider text-civic-text-secondary mb-2 mt-3">
                  Policy
                </h4>
              )}
              <div className="grid grid-cols-2 gap-2">
                {policyCards.map(card => (
                  <DraggableCard 
                    key={card.id} 
                    card={card}
                    isActive={activeProposal?.type === 'citywide' && 
                      activeProposal.citywide_type === card.subtype}
                    onClick={() => handleCardClick(card)}
                  />
                ))}
              </div>
            </div>
          )}
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

