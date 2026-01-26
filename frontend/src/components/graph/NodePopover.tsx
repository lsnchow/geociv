import { useState, useEffect, useRef, useCallback } from 'react';
import { useCivicStore } from '../../store';
import { Button, Badge } from '../ui';
import type { GraphNode } from './graphTypes';

interface NodePopoverProps {
  node: GraphNode | null;
  anchorX: number;
  anchorY: number;
  onClose: () => void;
  availableModels: string[];
  defaultModel: string;
}

// Model display names
const MODEL_INFO: Record<string, { name: string; icon: string }> = {
  'amazon/nova-micro-v1': { name: 'Nova', icon: '🚀' },
  'anthropic/claude-3-haiku': { name: 'Haiku', icon: '🧠' },
  'gemini-2.0-flash-lite-001': { name: 'Gemini', icon: '⚡' },
};

export function NodePopover({
  node,
  anchorX,
  anchorY,
  onClose,
  availableModels,
  defaultModel,
}: NodePopoverProps) {
  const { agentOverrides, updateAgentOverride, resetAgentOverride } = useCivicStore();
  const popoverRef = useRef<HTMLDivElement>(null);

  const [selectedModel, setSelectedModel] = useState<string>(defaultModel);
  const [archetypeText, setArchetypeText] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [showArchetypeEditor, setShowArchetypeEditor] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Get current override for this agent
  const currentOverride = node ? agentOverrides[node.id] : null;
  const isEdited = currentOverride?.model !== null || currentOverride?.archetype_override !== null;

  // Sync state when node changes
  useEffect(() => {
    if (node && currentOverride) {
      setSelectedModel(currentOverride.model || defaultModel);
      setArchetypeText(currentOverride.archetype_override || '');
    } else {
      setSelectedModel(defaultModel);
      setArchetypeText('');
    }
    setSaveStatus('idle');
    setShowArchetypeEditor(false);
  }, [node?.id, currentOverride, defaultModel]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Debounced save
  const saveTimeout = useRef<number | null>(null);
  
  const debouncedSave = useCallback(async (
    agentKey: string, 
    updates: { model?: string | null; archetype_override?: string | null }
  ) => {
    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current);
    }
    
    setSaveStatus('saving');
    saveTimeout.current = setTimeout(async () => {
      try {
        await updateAgentOverride(agentKey, updates);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 1500);
      } catch {
        setSaveStatus('error');
      }
    }, 300);
  }, [updateAgentOverride]);

  const handleModelChange = async (model: string) => {
    if (!node) return;
    setSelectedModel(model);
    const modelToSave = model === defaultModel ? null : model;
    await debouncedSave(node.id, { model: modelToSave });
  };

  const handleSaveArchetype = async () => {
    if (!node) return;
    setIsSaving(true);
    try {
      await updateAgentOverride(node.id, { 
        archetype_override: archetypeText.trim() || null 
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 1500);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!node) return;
    setIsSaving(true);
    try {
      await resetAgentOverride(node.id);
      setSelectedModel(defaultModel);
      setArchetypeText('');
      setShowArchetypeEditor(false);
      setSaveStatus('saved');
    } finally {
      setIsSaving(false);
    }
  };

  if (!node) return null;

  // Calculate position (avoid going off screen)
  const popoverWidth = 280;
  const popoverHeight = 320;
  const padding = 16;
  
  let left = anchorX + 50;  // Offset from node
  let top = anchorY - 40;
  
  // Adjust if would go off right edge
  if (left + popoverWidth > window.innerWidth - padding) {
    left = anchorX - popoverWidth - 50;
  }
  
  // Adjust if would go off bottom
  if (top + popoverHeight > window.innerHeight - padding) {
    top = window.innerHeight - popoverHeight - padding;
  }
  
  // Adjust if would go off top
  if (top < padding) {
    top = padding;
  }

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 bg-civic-surface border border-civic-border rounded-lg shadow-xl overflow-hidden"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${popoverWidth}px`,
        maxHeight: `${popoverHeight}px`,
      }}
    >
      {/* Header */}
      <div className="bg-civic-elevated border-b border-civic-border p-3 flex items-center gap-2">
        <span className="text-2xl">{node.avatar}</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-civic-text text-sm truncate">{node.name}</h3>
          <p className="text-[10px] text-civic-text-secondary">{node.role}</p>
        </div>
        {isEdited && <Badge variant="default" size="sm">Edited</Badge>}
        <button 
          onClick={onClose}
          className="text-civic-text-secondary hover:text-civic-text text-lg"
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div className="p-3 space-y-4 overflow-y-auto max-h-60">
        {/* Model Selection */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium text-civic-text-secondary uppercase">Model</span>
            {saveStatus === 'saving' && (
              <span className="text-[10px] text-amber-400">Saving...</span>
            )}
            {saveStatus === 'saved' && (
              <span className="text-[10px] text-green-400">✓ Saved</span>
            )}
          </div>
          <div className="flex gap-1.5">
            {availableModels.map(model => {
              const info = MODEL_INFO[model] || { name: model.split('/').pop(), icon: '🤖' };
              const isSelected = selectedModel === model;
              
              return (
                <button
                  key={model}
                  onClick={() => handleModelChange(model)}
                  className={`
                    flex-1 py-1.5 px-2 rounded text-xs font-medium transition-all
                    ${isSelected 
                      ? 'bg-civic-accent text-white' 
                      : 'bg-civic-elevated text-civic-text-secondary hover:bg-civic-muted'
                    }
                  `}
                >
                  {info.icon} {info.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Archetype */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium text-civic-text-secondary uppercase">Archetype</span>
            {!showArchetypeEditor && (
              <button
                onClick={() => setShowArchetypeEditor(true)}
                className="text-[10px] text-civic-accent hover:underline"
              >
                Edit
              </button>
            )}
          </div>
          
          {showArchetypeEditor ? (
            <div className="space-y-2">
              <textarea
                value={archetypeText}
                onChange={e => setArchetypeText(e.target.value)}
                placeholder="Custom persona..."
                className="w-full h-20 p-2 text-[11px] bg-civic-bg border border-civic-border rounded 
                  text-civic-text placeholder:text-civic-text-secondary
                  focus:outline-none focus:border-civic-accent resize-none"
              />
              <div className="flex gap-1">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveArchetype}
                  loading={isSaving}
                  className="flex-1 text-[10px] py-1"
                >
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowArchetypeEditor(false)}
                  className="text-[10px] py-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-2 bg-civic-elevated rounded text-[10px] text-civic-text-secondary">
              {currentOverride?.archetype_override 
                ? `"${currentOverride.archetype_override.slice(0, 60)}..."`
                : 'Default persona'
              }
            </div>
          )}
        </div>

        {/* Reset */}
        {isEdited && (
          <button
            onClick={handleReset}
            disabled={isSaving}
            className="w-full py-1.5 text-[10px] text-red-400 hover:bg-red-500/10 rounded transition-colors"
          >
            Reset to Defaults
          </button>
        )}
      </div>
    </div>
  );
}
