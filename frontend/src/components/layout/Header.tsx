import { useCivicStore } from '../../store';
import { Button, Badge } from '../ui';
import kingstonZones from '../../data/kingston-zones.json';

export function Header() {
  const { 
    scenario, 
    loadingScenario, 
    seedKingston,
    toggleLeftPanel,
    toggleRightPanel,
    leftPanelOpen,
    rightPanelOpen,
    autoSimulate,
    setAutoSimulate,
  } = useCivicStore();

  const regionCount = Math.max(scenario?.clusters?.length ?? 0, kingstonZones.features.length);
  
  return (
    <header className="h-14 bg-civic-surface border-b border-civic-border flex items-center justify-between px-4 shrink-0">
      {/* Left section */}
      <div className="flex items-center gap-4">
        <button
          onClick={toggleLeftPanel}
          className={`p-2 rounded hover:bg-civic-elevated transition-colors ${
            leftPanelOpen ? 'text-civic-text' : 'text-civic-text-secondary'
          }`}
          title={leftPanelOpen ? 'Hide proposals' : 'Show proposals'}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
          </svg>
        </button>
        
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-civic-text">GeoCiv AI</h1>
        </div>
      </div>
            
      {/* Right section - Scenario + controls */}
      <div className="flex items-center gap-4 ml-auto">
        {scenario ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-civic-text-secondary">Scenario:</span>
            <span className="text-sm font-medium text-civic-text">{scenario.name}</span>
            <Badge variant="support">{regionCount} regions</Badge>
          </div>
        ) : (
          <Button 
            onClick={seedKingston} 
            loading={loadingScenario}
            size="sm"
          >
            Load Kingston Demo
          </Button>
        )}
        
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs text-civic-text-secondary">Auto-simulate</span>
          <button
            onClick={() => setAutoSimulate(!autoSimulate)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              autoSimulate ? 'bg-civic-accent' : 'bg-civic-muted'
            }`}
          >
            <span
              className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
              style={{ transform: autoSimulate ? 'translateX(18px)' : 'translateX(4px)' }}
            />
          </button>
        </label>
        
        <button
          onClick={toggleRightPanel}
          className={`p-2 rounded hover:bg-civic-elevated transition-colors ${
            rightPanelOpen ? 'text-civic-text' : 'text-civic-text-secondary'
          }`}
          title={rightPanelOpen ? 'Hide results' : 'Show results'}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </button>
      </div>
    </header>
  );
}
