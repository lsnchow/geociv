import { useState, useRef, useEffect } from 'react';
import { useCivicStore, createProposalFromCard, PROPOSAL_CARDS } from '../../store';
import { sendChatMessage } from '../../lib/api';
import { Button } from '../ui';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export function QuickChat() {
  const { 
    scenario, 
    setActiveProposal, 
    showChat, 
    toggleChat 
  } = useCivicStore();
  
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content: 'Hi! Describe a proposal and I\'ll help you simulate its impact. Try "Build a park downtown" or "Increase property tax by 5%".',
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    
    try {
      const response = await sendChatMessage({
        content: input.trim(),
        scenario_id: scenario?.id,
        auto_simulate: true,
      });
      
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.message,
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
      // If a proposal was parsed, set it as active
      if (response.proposal_parsed && response.proposal) {
        setActiveProposal(response.proposal);
      }
    } catch (error) {
      // Fallback: try to parse locally
      const parsed = tryLocalParse(input.trim());
      
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: parsed 
          ? `I've created a "${parsed.title}" proposal for you. Click on the map to place it or adjust the settings.`
          : "I couldn't understand that proposal. Try something like 'Build affordable housing near downtown' or 'Increase transit funding by $50M'.",
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
      if (parsed) {
        setActiveProposal(parsed);
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  if (!showChat) {
    return (
      <button
        onClick={toggleChat}
        className="fixed bottom-6 right-6 bg-civic-accent hover:bg-civic-accent-muted text-white rounded-full p-4 shadow-lg transition-colors z-50"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </button>
    );
  }
  
  return (
    <div className="fixed bottom-6 right-6 w-96 bg-civic-surface border border-civic-border rounded-xl shadow-2xl flex flex-col z-50 max-h-[500px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-civic-border">
        <h3 className="text-sm font-medium text-civic-text">Quick Chat</h3>
        <button
          onClick={toggleChat}
          className="text-civic-text-secondary hover:text-civic-text"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-civic-accent text-white'
                  : 'bg-civic-elevated text-civic-text'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-civic-elevated text-civic-text rounded-lg px-3 py-2 text-sm">
              <span className="animate-pulse">Thinking...</span>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-civic-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe a proposal..."
            className="flex-1 bg-civic-bg border border-civic-border rounded-lg px-3 py-2 text-sm text-civic-text focus:outline-none focus:border-civic-accent"
            disabled={isLoading}
          />
          <Button type="submit" disabled={isLoading || !input.trim()}>
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}

// Simple local parsing fallback
function tryLocalParse(input: string) {
  const lower = input.toLowerCase();
  
  // Match spatial proposals
  for (const card of PROPOSAL_CARDS.filter(c => c.type === 'spatial')) {
    if (lower.includes(card.name.toLowerCase()) || lower.includes(card.subtype.replace('_', ' '))) {
      return createProposalFromCard(card);
    }
  }
  
  // Match citywide proposals
  for (const card of PROPOSAL_CARDS.filter(c => c.type === 'citywide')) {
    if (lower.includes(card.name.toLowerCase()) || lower.includes(card.subtype.replace('_', ' '))) {
      return createProposalFromCard(card);
    }
  }
  
  // Keyword matching
  if (lower.includes('park') || lower.includes('green')) {
    return createProposalFromCard(PROPOSAL_CARDS.find(c => c.id === 'park')!);
  }
  if (lower.includes('housing') || lower.includes('apartment')) {
    return createProposalFromCard(PROPOSAL_CARDS.find(c => c.id === 'housing')!);
  }
  if (lower.includes('transit') || lower.includes('bus') || lower.includes('rail')) {
    return createProposalFromCard(PROPOSAL_CARDS.find(c => c.id === 'transit')!);
  }
  if (lower.includes('tax') && (lower.includes('increase') || lower.includes('raise'))) {
    return createProposalFromCard(PROPOSAL_CARDS.find(c => c.id === 'tax_up')!);
  }
  if (lower.includes('tax') && (lower.includes('cut') || lower.includes('decrease') || lower.includes('lower'))) {
    return createProposalFromCard(PROPOSAL_CARDS.find(c => c.id === 'tax_down')!);
  }
  
  return null;
}

