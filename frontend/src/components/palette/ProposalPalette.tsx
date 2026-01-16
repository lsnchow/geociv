import { DraggableCard } from './DraggableCard';
import { PlacedBuildingsList } from './PlacedBuildingsList';
import { PROPOSAL_CARDS, useCivicStore, createProposalFromCard } from '../../store';
import { Panel, PanelSection } from '../ui';
import type { ProposalCard as ProposalCardType } from '../../types';

export function ProposalPalette() {
  const { 
    setActiveProposal, 
    activeProposal,
    placedItems 
  } = useCivicStore();
  
  // Only show build cards (spatial proposals)
  const buildCards = PROPOSAL_CARDS.filter(c => c.category === 'build');
  
  const handleCardClick = (card: ProposalCardType) => {
    const proposal = createProposalFromCard(card);
    setActiveProposal(proposal);
  };
  
  return (
    <Panel title="Build" className="h-full flex flex-col">
      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto">
        {/* Build cards grid */}
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
        
        {/* Placed buildings list - only show if there are items */}
        {placedItems.length > 0 && (
          <PlacedBuildingsList />
        )}
      </div>
      
      {/* Help text */}
      <PanelSection className="border-t border-civic-border text-center">
        <p className="text-[10px] text-civic-text-secondary">
          Click to select • Drag to map to place
        </p>
      </PanelSection>
    </Panel>
  );
}

