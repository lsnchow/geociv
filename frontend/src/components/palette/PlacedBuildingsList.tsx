/**
 * PlacedBuildingsList - Shows all placed buildings with selection and delete functionality
 * Includes "Simulate All" batch action
 */

import { useState } from 'react';
import { useCivicStore, PROPOSAL_CARDS } from '../../store';
import { PanelSection, Button } from '../ui';

// Get icon for a spatial type from PROPOSAL_CARDS
function getIconForType(spatialType: string): string {
  const card = PROPOSAL_CARDS.find(c => c.subtype === spatialType);
  return card?.icon || '📍';
}

export function PlacedBuildingsList() {
  const {
    placedItems,
    selectedPlacedItemId,
    setSelectedPlacedItemId,
    removePlacedItem,
    simulateAll,
    isSimulating,
  } = useCivicStore();

  const [framingQuestion, setFramingQuestion] = useState('');
  const [showFramingInput, setShowFramingInput] = useState(false);

  if (placedItems.length === 0) {
    return null;
  }

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Don't trigger row selection
    removePlacedItem(id);
  };

  const handleSimulateAll = async () => {
    await simulateAll(framingQuestion || undefined);
    setFramingQuestion('');
    setShowFramingInput(false);
  };

  return (
    <PanelSection className="border-t border-civic-border">
      {/* Header with count */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium text-civic-text-secondary uppercase tracking-wide">
          Placed Buildings
        </h3>
        <span className="text-xs text-civic-text-secondary">
          {placedItems.length}/10
        </span>
      </div>

      {/* List of placed items */}
      <div className="space-y-1">
        {placedItems.map((item) => {
          const isSelected = selectedPlacedItemId === item.id;
          const icon = getIconForType(item.proposal.spatial_type);
          const regionName = item.proposal.containing_zone?.name || 'Unknown region';

          return (
            <div
              key={item.id}
              onClick={() => setSelectedPlacedItemId(isSelected ? null : item.id)}
              className={`
                flex items-center gap-2 p-2 rounded cursor-pointer transition-colors
                ${isSelected 
                  ? 'bg-civic-accent/20 border border-civic-accent' 
                  : 'bg-civic-elevated hover:bg-civic-muted border border-transparent'
                }
              `}
            >
              {/* Emoji icon */}
              <span className="text-lg flex-shrink-0">{icon}</span>

              {/* Label and region */}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-civic-text truncate">
                  {item.proposal.title}
                </div>
                <div className="text-[10px] text-civic-text-secondary truncate">
                  {regionName}
                </div>
              </div>

              {/* Delete button */}
              <button
                onClick={(e) => handleDelete(e, item.id)}
                className="flex-shrink-0 p-1 text-civic-text-secondary hover:text-red-400 hover:bg-red-500/20 rounded transition-colors"
                title="Delete building"
              >
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className="h-4 w-4" 
                  viewBox="0 0 20 20" 
                  fill="currentColor"
                >
                  <path 
                    fillRule="evenodd" 
                    d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" 
                    clipRule="evenodd" 
                  />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {/* Simulate All section */}
      <div className="mt-3 space-y-2">
        {/* Optional framing question input */}
        {showFramingInput ? (
          <div className="space-y-2">
            <input
              type="text"
              value={framingQuestion}
              onChange={(e) => setFramingQuestion(e.target.value)}
              placeholder="Optional: Add a framing question..."
              className="w-full px-2 py-1.5 text-sm bg-civic-elevated border border-civic-border rounded text-civic-text placeholder-civic-text-secondary focus:outline-none focus:border-civic-accent"
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                onClick={handleSimulateAll}
                disabled={isSimulating}
                className="flex-1 text-sm py-1.5"
              >
                {isSimulating ? '⟳ Simulating...' : '▶ Run Batch'}
              </Button>
              <button
                onClick={() => {
                  setShowFramingInput(false);
                  setFramingQuestion('');
                }}
                className="px-2 py-1.5 text-xs text-civic-text-secondary hover:text-civic-text"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <Button
            onClick={() => setShowFramingInput(true)}
            variant="secondary"
            className="w-full text-sm py-2"
          >
            🎯 Simulate All ({placedItems.length} buildings)
          </Button>
        )}
      </div>
    </PanelSection>
  );
}

export default PlacedBuildingsList;

