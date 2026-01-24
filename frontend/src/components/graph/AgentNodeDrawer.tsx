import { useState, useEffect } from 'react';
import { useCivicStore } from '../../store';
import { Button, Badge } from '../ui';

interface AgentData {
  key: string;
  name: string;
  avatar: string;
  role: string;
  model: string | null;
  archetypeOverride: string | null;
  isEdited: boolean;
}

interface AgentNodeDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  agentKey: string | null;
  agentData: AgentData | null | undefined;
  availableModels: string[];
  defaultModel: string;
}

// Model display names and descriptions
const MODEL_INFO: Record<string, { name: string; description: string; icon: string }> = {
  'amazon/nova-micro-v1': { 
    name: 'Nova Micro', 
    description: 'Fast, cost-effective (default)',
    icon: '🚀',
  },
  'anthropic/claude-3-haiku': { 
    name: 'Claude Haiku', 
    description: 'Deep reasoning',
    icon: '🧠',
  },
  'gemini-2.0-flash-lite-001': { 
    name: 'Gemini Flash', 
    description: 'Speed optimized (may reduce depth)',
    icon: '⚡',
  },
};

export function AgentNodeDrawer({
  isOpen,
  onClose,
  agentKey,
  agentData,
  availableModels,
  defaultModel,
}: AgentNodeDrawerProps) {
  const { updateAgentOverride, resetAgentOverride } = useCivicStore();

  const [selectedModel, setSelectedModel] = useState<string>(defaultModel);
  const [archetypeText, setArchetypeText] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [showArchetypeEditor, setShowArchetypeEditor] = useState(false);

  // Sync state when agentData changes
  useEffect(() => {
    if (agentData) {
      setSelectedModel(agentData.model || defaultModel);
      setArchetypeText(agentData.archetypeOverride || '');
      setShowArchetypeEditor(!!agentData.archetypeOverride);
    }
  }, [agentData, defaultModel]);

  const handleSaveModel = async () => {
    if (!agentKey) return;
    
    setIsSaving(true);
    try {
      // Only send model if different from default
      const modelToSave = selectedModel === defaultModel ? null : selectedModel;
      await updateAgentOverride(agentKey, { model: modelToSave });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveArchetype = async () => {
    if (!agentKey) return;
    
    setIsSaving(true);
    try {
      await updateAgentOverride(agentKey, { 
        archetype_override: archetypeText.trim() || null 
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!agentKey) return;
    
    setIsSaving(true);
    try {
      await resetAgentOverride(agentKey);
      setSelectedModel(defaultModel);
      setArchetypeText('');
      setShowArchetypeEditor(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !agentData) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex justify-end"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />
      
      {/* Drawer */}
      <div 
        className="relative w-80 bg-civic-surface border-l border-civic-border h-full overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-civic-surface border-b border-civic-border p-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{agentData.avatar}</span>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-civic-text truncate">{agentData.name}</h3>
              <p className="text-xs text-civic-text-secondary">{agentData.role}</p>
            </div>
            <button 
              onClick={onClose}
              className="text-civic-text-secondary hover:text-civic-text"
            >
              ✕
            </button>
          </div>
          
          {agentData.isEdited && (
            <div className="mt-2">
              <Badge variant="default" size="sm">Customized</Badge>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-4 space-y-6">
          {/* Model Selection */}
          <section>
            <h4 className="text-xs font-medium text-civic-text-secondary mb-3">
              LLM MODEL
            </h4>
            <div className="space-y-2">
              {availableModels.map(model => {
                const info = MODEL_INFO[model] || { 
                  name: model.split('/').pop() || model, 
                  description: '', 
                  icon: '🤖' 
                };
                const isSelected = selectedModel === model;
                const isDefault = model === defaultModel;
                
                return (
                  <button
                    key={model}
                    onClick={() => setSelectedModel(model)}
                    className={`
                      w-full p-3 rounded border text-left transition-all
                      ${isSelected 
                        ? 'bg-civic-accent/10 border-civic-accent' 
                        : 'bg-civic-elevated border-civic-border hover:border-civic-muted'
                      }
                    `}
                  >
                    <div className="flex items-center gap-2">
                      <span>{info.icon}</span>
                      <span className="font-medium text-civic-text">{info.name}</span>
                      {isDefault && (
                        <Badge variant="neutral" size="sm">Default</Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-civic-text-secondary mt-1">
                      {info.description}
                    </p>
                    {model.includes('gemini') && (
                      <p className="text-[10px] text-amber-400 mt-1">
                        Warning: May reduce response depth
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
            
            <div className="mt-3">
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveModel}
                loading={isSaving}
                className="w-full"
              >
                Save Model
              </Button>
            </div>
          </section>

          {/* Archetype Editor */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-medium text-civic-text-secondary">
                ARCHETYPE / PERSONA
              </h4>
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
              <div className="space-y-3">
                <textarea
                  value={archetypeText}
                  onChange={e => setArchetypeText(e.target.value)}
                  placeholder="Enter custom persona text... (leave empty for default)"
                  className="w-full h-32 p-2 text-xs bg-civic-bg border border-civic-border rounded 
                    text-civic-text placeholder:text-civic-text-secondary
                    focus:outline-none focus:border-civic-accent resize-none"
                />
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSaveArchetype}
                    loading={isSaving}
                    className="flex-1"
                  >
                    Save Archetype
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setArchetypeText(agentData.archetypeOverride || '');
                      setShowArchetypeEditor(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-civic-elevated rounded border border-civic-border">
                <p className="text-[10px] text-civic-text-secondary">
                  {agentData.archetypeOverride 
                    ? `Custom: "${agentData.archetypeOverride.slice(0, 100)}..."`
                    : 'Using default persona from agent definitions'
                  }
                </p>
              </div>
            )}
          </section>

          {/* Reset Button */}
          {agentData.isEdited && (
            <section className="pt-4 border-t border-civic-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                loading={isSaving}
                className="w-full text-red-400 hover:bg-red-500/10"
              >
                Reset to Defaults
              </Button>
              <p className="text-[10px] text-civic-text-secondary text-center mt-2">
                This will reset model and archetype to defaults
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
