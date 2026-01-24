import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/clerk-react';
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

  // Only show Clerk controls when a real publishable key is provided (dev fallback runs without ClerkProvider)
  const clerkEnabled = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) && 
    !import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.includes('your_clerk');
  
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

        {clerkEnabled && (
          <div className="h-10 w-px bg-civic-border" aria-hidden="true" />
        )}

        {clerkEnabled ? (
          <>
            <SignedIn>
              <UserButton
                afterSignOutUrl="/"
                userProfileMode="modal"
                appearance={{
                  elements: {
                    userButtonBox: "flex items-center",
                    userButtonAvatarBox: "w-10 h-10",
                    userButtonPopoverCard: "bg-civic-surface/95 backdrop-blur border border-civic-border shadow-2xl",
                    userButtonPopoverFooter: "hidden", // hide dev watermark footer clipping into layout
                    userButtonPopoverActionButton: "text-civic-text hover:bg-civic-elevated",
                    userButtonPopoverActionButtonIcon: "text-civic-text-secondary",
                    userButtonPopoverActionButtonText: "text-civic-text",
                    userButtonPopoverSectionHeaderText: "text-civic-text-secondary",
                  },
                  variables: {
                    colorBackground: "var(--color-civic-surface)",
                    colorText: "var(--color-civic-text)",
                    colorPrimary: "var(--color-civic-accent)",
                    borderRadius: "12px",
                    shadow: "0 20px 60px rgba(0,0,0,0.35)",
                  },
                }}
              >
                <UserButton.MenuItems>
                  <UserButton.Action label="Manage account" action="manageAccount" />
                  <UserButton.Action label="Sign out" action="signOut" />
                </UserButton.MenuItems>
              </UserButton>
            </SignedIn>
            <SignedOut>
              <SignInButton mode="modal">
                <Button size="sm" variant="outline">
                  Sign in
                </Button>
              </SignInButton>
            </SignedOut>
          </>
        ) : null}
      </div>
    </header>
  );
}
