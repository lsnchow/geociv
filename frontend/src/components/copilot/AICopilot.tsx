import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { useCivicStore } from '../../store';
import { Button, Badge } from '../ui';
import { SimulationProgress } from './SimulationProgress';
import * as aiApi from '../../lib/ai-api';
import * as api from '../../lib/api';
import type { SimulationResponse } from '../../types/simulation';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  simulationResponse?: SimulationResponse;
  // DM-specific fields
  isDM?: boolean;
  dmFrom?: string;
  dmTo?: string;
}

export function AICopilot() {
  const { 
    scenario, 
    setAgentSimulation, 
    toggleRightPanel, 
    rightPanelOpen, 
    speakingAsAgent, 
    setSpeakingAsAgent,
    targetAgent,
    setTargetAgent,
    updateAgentReaction,
    loadRelationships,
    sessionId,
    agentSimulation,
    buildWorldStateSummary,
    // Progressive simulation
    simulationJob,
    startProgressiveSimulation,
    cancelSimulation,
    updateSimulationJob,
    // Model override
    chatModelOverride,
    setChatModelOverride,
    availableModels,
  } = useCivicStore();
  
  // DM mode: both speaker and target are set (and target is not 'all')
  // Use typeof check for proper type narrowing
  const isTargetAgentObject = targetAgent !== null && typeof targetAgent === 'object';
  const dmModeActive = speakingAsAgent !== null && isTargetAgentObject;
  
  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7242/ingest/36b22d3a-abef-4d8c-b3d9-d3a34145295b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AICopilot:mount',message:'AICopilot scenario state',data:{hasScenario:!!scenario,scenarioId:scenario?.id},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
  }, [scenario]);
  // #endregion
  
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [backboardError, setBackboardError] = useState<string | null>(null);
  const [useProgressiveSimulation, setUseProgressiveSimulation] = useState(true);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Track if simulation is active (progressive mode)
  const isSimulating = simulationJob?.status === 'pending' || simulationJob?.status === 'running';
  
  // Real-time partial results: update map as agents complete
  useEffect(() => {
    if (simulationJob?.partialZones && simulationJob.partialZones.length > 0) {
      // Update the store with partial zone data for live map coloring
      if (agentSimulation) {
        setAgentSimulation({
          ...agentSimulation,
          zones: simulationJob.partialZones,
        });
      }
    }
  }, [simulationJob?.partialZones]);
  
  // Handle simulation completion
  useEffect(() => {
    if (simulationJob?.status === 'complete' && simulationJob.result) {
      // Add assistant message with final result
      const response = simulationJob.result as SimulationResponse;
      
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.assistant_message,
        simulationResponse: response,
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      setAgentSimulation(response);
      
      // Auto-open the right panel if there are reactions
      if (response.reactions.length > 0 && !rightPanelOpen) {
        toggleRightPanel();
      }
      
      // Clear the simulation job
      updateSimulationJob(null);
      setIsProcessing(false);
    } else if (simulationJob?.status === 'error') {
      const errorText = simulationJob.error || 'Unknown error';
      const isClarification = /clarification/i.test(errorText);
      
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: isClarification
          ? `🔍 ${errorText}`
          : `❌ Simulation failed: ${errorText}`,
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      updateSimulationJob(null);
      setIsProcessing(false);
    }
  }, [simulationJob?.status, simulationJob?.result]);
  
  const handleCancelSimulation = useCallback(() => {
    cancelSimulation();
    setIsProcessing(false);
  }, [cancelSimulation]);
  
  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // Keyboard shortcut to open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
        setBackboardError(null);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !scenario || isProcessing) return;
    
    // Block send if target is set but no speaker
    if (targetAgent && isTargetAgentObject && !speakingAsAgent) {
      setBackboardError('Select a speaker first (click an agent card)');
      return;
    }
    
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      // Tag as DM if in DM mode
      isDM: dmModeActive,
      dmFrom: dmModeActive ? speakingAsAgent?.name : undefined,
      dmTo: dmModeActive && isTargetAgentObject ? targetAgent?.name : undefined,
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsProcessing(true);
    setBackboardError(null);
    
    try {
      // ========== DM MODE: Call /v1/ai/dm ==========
      if (dmModeActive && isTargetAgentObject) {
        const dmResponse = await api.sendDM({
          session_id: sessionId,
          from_agent_key: speakingAsAgent!.key,
          to_agent_key: targetAgent.key,
          message: userMessage.content,
          // Pass current proposal title if available for stance context
          proposal_title: agentSimulation?.proposal?.title,
        });
        
        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: dmResponse.reply,
          isDM: true,
          dmFrom: targetAgent.name,
          dmTo: speakingAsAgent!.name,
        };
        
        setMessages(prev => [...prev, assistantMessage]);
        
        // Update target agent's reaction if stance changed
        if (dmResponse.stance_update?.stance_changed && dmResponse.stance_update.new_stance) {
          updateAgentReaction(targetAgent.key, {
            stance: dmResponse.stance_update.new_stance as 'support' | 'oppose' | 'neutral',
            intensity: dmResponse.stance_update.new_intensity ?? undefined,
            quote: `After talking with ${speakingAsAgent!.name}: "${dmResponse.stance_update.reason}"`,
          });
        }
        
        // Refresh relationships
        loadRelationships(sessionId);
        
      } else {
        // ========== NORMAL MODE: Call /v1/ai/chat ==========
        // Build world state context for all chat messages
        const worldState = buildWorldStateSummary();
        
        if (useProgressiveSimulation) {
          // Use progressive simulation with real-time progress
          await startProgressiveSimulation(
            userMessage.content,
            scenario.id,
            {
              worldState,
              speakerMode: speakingAsAgent ? 'agent' : 'user',
              speakerAgentKey: speakingAsAgent?.key,
            }
          );
          // Don't set isProcessing to false here - the effect will handle it
          return;
        }
        
        // Fallback: Direct API call (non-progressive)
        const response: SimulationResponse = await aiApi.chat({
          message: userMessage.content,
          scenario_id: scenario.id,
          thread_id: threadId || undefined,
          auto_simulate: true,
          speaker_mode: speakingAsAgent ? 'agent' : 'user',
          speaker_agent_key: speakingAsAgent?.key,
          world_state: worldState,
        });
        
        // Store thread_id for conversation continuity
        setThreadId(response.thread_id);
        
        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response.assistant_message,
          simulationResponse: response,
        };
        
        setMessages(prev => [...prev, assistantMessage]);
        
        // If we got reactions/zones, update the store
        if (response.reactions.length > 0 || response.zones.length > 0) {
          setAgentSimulation(response);
          
          // Auto-open the right panel if there are reactions
          if (response.reactions.length > 0 && !rightPanelOpen) {
            toggleRightPanel();
          }
        }
      }
      
    } catch (error) {
      if (error instanceof aiApi.BackboardUnavailableError) {
        setBackboardError(error.message);
        const errorMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `⚠️ **Backboard Error**\n\n${error.message}\n\nThis may indicate a service issue or invalid request format.`,
        };
        setMessages(prev => [...prev, errorMessage]);
      } else {
        const errorMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } finally {
      setIsProcessing(false);
    }
  };
  
  const clearConversation = () => {
    setMessages([]);
    setThreadId(null);
    setBackboardError(null);
  };
  
  if (!isOpen) {
    return (
      <button
        onClick={() => {
          setIsOpen(true);
          setBackboardError(null);
          setTimeout(() => inputRef.current?.focus(), 100);
        }}
        className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 bg-civic-surface/90 backdrop-blur border border-civic-border rounded-full shadow-lg hover:bg-civic-elevated transition-colors"
      >
        <span className="text-civic-accent">⌘K</span>
        <span className="text-sm text-civic-text">Ask AI anything...</span>
      </button>
    );
  }
  
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16" onClick={() => setIsOpen(false)}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      
      {/* Command palette */}
      <div 
        className="relative w-full max-w-2xl bg-civic-surface border border-civic-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-civic-border bg-civic-bg/50">
          <div className="flex items-center gap-2">
            <span className="text-civic-accent">⌘K</span>
            <span className="text-sm font-medium text-civic-text">GeoCiv AI</span>
            {threadId && !dmModeActive && (
              <Badge variant="default" size="sm">Thread Active</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={clearConversation}
              className="text-xs text-civic-text-secondary hover:text-civic-text"
            >
              Clear
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="text-civic-text-secondary hover:text-civic-text"
            >
              <span>✕</span>
            </button>
          </div>
        </div>
        
        {/* DM Mode Banner */}
        {dmModeActive && isTargetAgentObject && (
          <div className="px-4 py-2 bg-purple-500/20 border-b border-purple-500/30 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-purple-400 font-medium">DM:</span>
              <span className="text-purple-300">{speakingAsAgent?.avatar} {speakingAsAgent?.name}</span>
              <span className="text-purple-400">→</span>
              <span className="text-purple-300">{targetAgent.name}</span>
            </div>
            <button
              onClick={() => {
                setSpeakingAsAgent(null);
                setTargetAgent(null);
              }}
              className="text-xs text-purple-400 hover:text-purple-200 px-2 py-1 rounded bg-purple-500/20 hover:bg-purple-500/30 transition-colors"
            >
              Exit DM
            </button>
          </div>
        )}
        
        {/* Speaking-as banner (when not in full DM mode) */}
        {speakingAsAgent && !dmModeActive && (
          <div className="px-4 py-2 bg-purple-500/10 border-b border-purple-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-purple-300">{speakingAsAgent.avatar} Speaking as {speakingAsAgent.name}</span>
              {targetAgent === null && (
                <span className="text-purple-400/60 text-xs">• Click an agent to start DM</span>
              )}
            </div>
            <button
              onClick={() => setSpeakingAsAgent(null)}
              className="text-xs text-purple-400 hover:text-purple-200"
            >
              ✕
            </button>
          </div>
        )}
        
        {/* Backboard Error Banner */}
        {backboardError && (
          <div className="px-4 py-2 bg-red-500/20 border-b border-red-500/30">
            <p className="text-xs text-red-400">
              ⚠️ Backboard unavailable: {backboardError}
            </p>
          </div>
        )}
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[200px]">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <p className="text-civic-text-secondary text-sm">
                Describe a proposal and see how 7 stakeholders react.
              </p>
              <p className="text-civic-text-tertiary text-xs mt-2">
                Try: "Double the size of all parks" or "$50 grocery rebate for low income residents"
              </p>
            </div>
          )}
          
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-4 py-3 ${
                  msg.role === 'user'
                    ? msg.isDM 
                      ? 'bg-purple-600 text-white' 
                      : 'bg-civic-accent text-white'
                    : msg.isDM
                      ? 'bg-purple-500/20 text-civic-text border border-purple-500/30'
                      : 'bg-civic-elevated text-civic-text'
                }`}
              >
                {/* DM tag */}
                {msg.isDM && (
                  <div className="flex items-center gap-2 text-[10px] text-purple-400 mb-1">
                    <span className="px-1.5 py-0.5 bg-purple-500/30 rounded font-medium">DM</span>
                    <span>{msg.dmFrom} → {msg.dmTo}</span>
                  </div>
                )}
                <div className="text-sm markdown-content">
                  <ReactMarkdown 
                    components={{
                      // Style markdown elements to match our theme
                      p: ({children}) => <p className="mb-2 last:mb-0">{children}</p>,
                      strong: ({children}) => <strong className="font-semibold text-white">{children}</strong>,
                      em: ({children}) => <em className="italic opacity-80">{children}</em>,
                      ul: ({children}) => <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>,
                      ol: ({children}) => <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>,
                      li: ({children}) => <li className="ml-2">{children}</li>,
                      code: ({children}) => <code className="px-1 py-0.5 bg-black/30 rounded text-xs font-mono">{children}</code>,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
                
                {/* Show simulation summary */}
                {msg.simulationResponse && msg.simulationResponse.reactions.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-civic-border/30 space-y-2">
                    {/* Reaction counts */}
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-green-400">
                        👍 {msg.simulationResponse.reactions.filter(r => r.stance === 'support').length}
                      </span>
                      <span className="text-red-400">
                        👎 {msg.simulationResponse.reactions.filter(r => r.stance === 'oppose').length}
                      </span>
                      <span className="text-yellow-400">
                        🤔 {msg.simulationResponse.reactions.filter(r => r.stance === 'neutral').length}
                      </span>
                    </div>
                    
                    {/* Agent avatars */}
                    <div className="flex items-center gap-1">
                      {msg.simulationResponse.reactions.map(r => (
                        <span 
                          key={r.agent_key}
                          className={`text-lg ${
                            r.stance === 'support' ? 'grayscale-0' :
                            r.stance === 'oppose' ? 'grayscale-0 opacity-60' : 
                            'opacity-50'
                          }`}
                          title={`${r.agent_name}: ${r.stance}`}
                        >
                          {r.avatar}
                        </span>
                      ))}
                    </div>
                    
                    {/* Receipt info */}
                    {msg.simulationResponse.receipt && (
                      <div className="text-[10px] text-civic-text-secondary flex items-center gap-2">
                        <span>⏱ {msg.simulationResponse.receipt.duration_ms}ms</span>
                        <span>•</span>
                        <span className="font-mono">{msg.simulationResponse.receipt.run_hash}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {/* Progressive Simulation Progress */}
          {isSimulating && simulationJob && (
            <div className="flex justify-start">
              <div className="rounded-lg px-4 py-3 bg-civic-elevated text-civic-text w-full max-w-[90%]">
                <SimulationProgress 
                  job={simulationJob} 
                  onCancel={handleCancelSimulation}
                  compact={false}
                />
              </div>
            </div>
          )}
          
          {/* Fallback: Simple spinner for DM mode or non-progressive */}
          {isProcessing && !isSimulating && (
            <div className="flex justify-start">
              <div className={`rounded-lg px-4 py-3 ${dmModeActive ? 'bg-purple-500/20 text-purple-300' : 'bg-civic-elevated text-civic-text'}`}>
                <div className="flex items-center gap-2">
                  <span className="animate-spin">🔄</span>
                  <span>{dmModeActive ? `Waiting for ${isTargetAgentObject ? targetAgent?.name : 'agent'} to respond...` : 'Processing...'}</span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
        
        {/* Input */}
        <form onSubmit={handleSubmit} className="flex items-center border-t border-civic-border p-3 gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={dmModeActive && isTargetAgentObject
              ? `Message ${targetAgent.name} as ${speakingAsAgent?.name}...`
              : speakingAsAgent 
                ? `Speak as ${speakingAsAgent.name}...` 
                : "Describe a proposal or ask a question..."}
            className={`flex-1 px-3 py-2 bg-civic-bg border rounded-lg text-civic-text placeholder-civic-text-secondary focus:outline-none ${dmModeActive ? 'border-purple-500/50 focus:border-purple-500' : 'border-civic-border focus:border-civic-accent'}`}
            disabled={isProcessing}
            autoFocus
          />
          <Button 
            type="submit" 
            loading={isProcessing}
            disabled={!input.trim() || isProcessing || !scenario}
            className={dmModeActive ? 'bg-purple-600 hover:bg-purple-700' : ''}
          >
            {dmModeActive ? 'Send DM' : 'Send'}
          </Button>
        </form>
        
        {/* Footer */}
        <div className="px-4 py-2 bg-civic-bg/50 border-t border-civic-border flex items-center justify-between">
          <div className="text-[10px] text-civic-text-secondary flex items-center gap-2">
            <kbd className="px-1 py-0.5 bg-civic-muted rounded text-[9px]">ESC</kbd> to close
            <span>•</span>
            <button
              onClick={() => setUseProgressiveSimulation(prev => !prev)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${
                useProgressiveSimulation 
                  ? 'bg-civic-accent/20 text-civic-accent' 
                  : 'bg-civic-muted text-civic-text-secondary'
              }`}
              title={useProgressiveSimulation ? 'Progressive mode: shows real-time progress' : 'Standard mode: waits for completion'}
            >
              <span>{useProgressiveSimulation ? '📊' : '⚡'}</span>
              <span>{useProgressiveSimulation ? 'Progressive' : 'Fast'}</span>
            </button>
          </div>
          
          {/* Model Selector */}
          <div className="flex items-center gap-1">
            <ModelSelectorPill
              selectedModel={chatModelOverride}
              onSelect={setChatModelOverride}
              availableModels={availableModels}
            />
          </div>
          
          <div className="text-[10px] text-civic-text-secondary flex items-center gap-2">
            <span>👥 21 Agents</span>
            <span>•</span>
            <span>🗺️ 21 Zones</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Model selector pill component
interface ModelSelectorPillProps {
  selectedModel: string | null;
  onSelect: (model: string | null) => void;
  availableModels: string[];
}

function ModelSelectorPill({ selectedModel, onSelect, availableModels }: ModelSelectorPillProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const modelDisplayNames: Record<string, { short: string; icon: string; warning?: string }> = {
    'auto': { short: 'Auto', icon: '🤖' },
    'amazon/nova-micro-v1': { short: 'amazon/nova-micro-v1', icon: '🚀' },
    'anthropic/claude-3-haiku': { short: 'anthropic/claude-3-haiku', icon: '🧠' },
    'gemini-2.0-flash-lite-001': { 
      short: 'gemini-2.0-flash-lite', 
      icon: '⚡',
      warning: 'Optimized for speed; may reduce depth'
    },
  };
  
  const currentDisplay = selectedModel 
    ? modelDisplayNames[selectedModel] || { short: selectedModel.split('/').pop(), icon: '🤖' }
    : modelDisplayNames['auto'];
  
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${
          selectedModel 
            ? 'bg-civic-accent/20 text-civic-accent border border-civic-accent/30' 
            : 'bg-civic-muted text-civic-text-secondary hover:bg-civic-elevated'
        }`}
        title={selectedModel ? `Using ${currentDisplay.short} for this message` : 'Using per-agent models (Auto)'}
      >
        <span>{currentDisplay.icon}</span>
        <span>{currentDisplay.short}</span>
        <span className="text-[8px] opacity-60">▼</span>
      </button>
      
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)} 
          />
          
          {/* Dropdown */}
          <div className="absolute bottom-full left-0 mb-1 w-48 bg-civic-surface border border-civic-border rounded-lg shadow-lg z-50 overflow-hidden">
            <div className="p-1">
              {/* Auto option */}
              <button
                onClick={() => { onSelect(null); setIsOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded text-left text-xs transition-colors ${
                  !selectedModel 
                    ? 'bg-civic-accent/10 text-civic-accent' 
                    : 'text-civic-text hover:bg-civic-elevated'
                }`}
              >
                <span>🤖</span>
                <div className="flex-1">
                  <div className="font-medium">Auto</div>
                  <div className="text-[10px] text-civic-text-secondary">Use per-agent settings</div>
                </div>
                {!selectedModel && <span className="text-civic-accent">✓</span>}
              </button>
              
              <div className="h-px bg-civic-border my-1" />
              
              {/* Model options */}
              {availableModels.map(model => {
                const info = modelDisplayNames[model] || { short: model, icon: '🤖' };
                const isSelected = selectedModel === model;
                
                return (
                  <button
                    key={model}
                    onClick={() => { onSelect(model); setIsOpen(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded text-left text-xs transition-colors ${
                      isSelected 
                        ? 'bg-civic-accent/10 text-civic-accent' 
                        : 'text-civic-text hover:bg-civic-elevated'
                    }`}
                  >
                    <span>{info.icon}</span>
                    <div className="flex-1">
                      <div className="font-medium">{info.short}</div>
                      {info.warning && (
                        <div className="text-[10px] text-amber-400">{info.warning}</div>
                      )}
                    </div>
                    {isSelected && <span className="text-civic-accent">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
