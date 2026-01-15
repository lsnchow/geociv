import { useState, useEffect } from 'react';
import { useCivicStore } from '../../store';
import { Panel, PanelSection, Button, Badge } from '../ui';
import type { HistoryEntry } from '../../types';
import type { HistoryAnalysis, HistoryInsight } from '../../types/ai';
import * as aiApi from '../../lib/ai-api';

export function HistoryTimeline() {
  const { 
    history, 
    selectedHistoryId, 
    restoreFromHistory, 
    clearHistory,
    scenario,
  } = useCivicStore();
  
  const [analysis, setAnalysis] = useState<HistoryAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Auto-analyze when history changes
  useEffect(() => {
    if (history.length >= 3 && scenario) {
      analyzeHistory();
    }
  }, [history.length >= 3]);
  
  const analyzeHistory = async () => {
    if (!scenario || history.length < 3) return;
    
    setIsAnalyzing(true);
    try {
      const response = await aiApi.analyzeHistory({
        scenario_id: scenario.id,
        history: history.map(h => ({
          id: h.id,
          proposal: h.proposal,
          result: h.result,
          timestamp: h.timestamp,
        })),
      });
      
      if (response.success && response.analysis) {
        setAnalysis(response.analysis);
      }
    } catch (error) {
      console.error('Failed to analyze history:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };
  
  const findBest = async (criteria: string) => {
    if (!scenario) return;
    
    try {
      const response = await aiApi.findBestRun(
        scenario.id,
        history.map(h => ({
          id: h.id,
          proposal: h.proposal,
          result: h.result,
        })),
        criteria
      );
      
      if (response.success && response.run_id) {
        restoreFromHistory(response.run_id);
      }
    } catch (error) {
      console.error('Failed to find best:', error);
    }
  };
  
  if (history.length === 0) {
    return (
      <Panel title="History" className="h-full">
        <PanelSection>
          <div className="text-center py-8">
            <div className="text-3xl mb-2 opacity-50">📜</div>
            <p className="text-xs text-civic-text-secondary">
              Your simulation history will appear here
            </p>
          </div>
        </PanelSection>
      </Panel>
    );
  }
  
  return (
    <Panel 
      title="History" 
      className="h-full flex flex-col"
      actions={
        <div className="flex gap-1">
          {history.length >= 3 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setShowInsights(!showInsights)}
            >
              {showInsights ? '📜' : '🧠'}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={clearHistory}>
            Clear
          </Button>
        </div>
      }
    >
      {/* AI Insights panel */}
      {showInsights && analysis && (
        <InsightsPanel 
          analysis={analysis} 
          onFindBest={findBest}
          isAnalyzing={isAnalyzing}
          onRefresh={analyzeHistory}
        />
      )}
      
      {/* Search/filter */}
      {!showInsights && history.length > 5 && (
        <PanelSection className="border-b border-civic-border">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search history..."
            className="w-full bg-civic-bg border border-civic-border rounded px-2 py-1 text-xs text-civic-text focus:outline-none focus:border-civic-accent"
          />
        </PanelSection>
      )}
      
      {/* History list */}
      {!showInsights && (
        <div className="flex-1 overflow-y-auto">
          {history
            .filter(entry => 
              !searchQuery || 
              entry.proposal.title.toLowerCase().includes(searchQuery.toLowerCase())
            )
            .map((entry, idx) => (
              <HistoryItem
                key={entry.id}
                entry={entry}
                isSelected={entry.id === selectedHistoryId}
                isLatest={idx === 0}
                isBest={entry.id === analysis?.best_run_id}
                isWorst={entry.id === analysis?.worst_run_id}
                onRestore={() => restoreFromHistory(entry.id)}
              />
            ))}
        </div>
      )}
    </Panel>
  );
}

interface InsightsPanelProps {
  analysis: HistoryAnalysis;
  onFindBest: (criteria: string) => void;
  isAnalyzing: boolean;
  onRefresh: () => void;
}

function InsightsPanel({ analysis, onFindBest, isAnalyzing, onRefresh }: InsightsPanelProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      {/* Summary */}
      <PanelSection className="border-b border-civic-border">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-medium text-civic-text">🧠 AI INSIGHTS</h4>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onRefresh}
            loading={isAnalyzing}
          >
            ↻
          </Button>
        </div>
        <p className="text-xs text-civic-text-secondary">{analysis.summary}</p>
        
        {/* Stats */}
        <div className="flex gap-4 mt-2">
          <div className="text-center">
            <div className="text-lg font-bold text-civic-support">
              {analysis.best_run_approval?.toFixed(0) || '—'}
            </div>
            <div className="text-[10px] text-civic-text-secondary">Best</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-civic-oppose">
              {analysis.worst_run_approval?.toFixed(0) || '—'}
            </div>
            <div className="text-[10px] text-civic-text-secondary">Worst</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-civic-accent">
              {analysis.total_runs}
            </div>
            <div className="text-[10px] text-civic-text-secondary">Runs</div>
          </div>
        </div>
      </PanelSection>
      
      {/* Quick find */}
      <PanelSection className="border-b border-civic-border">
        <h4 className="text-[10px] font-medium text-civic-text-secondary mb-2">FIND BEST</h4>
        <div className="flex flex-wrap gap-1">
          {['approval', 'equity', 'environment', 'affordability'].map(criterion => (
            <button
              key={criterion}
              onClick={() => onFindBest(`best ${criterion}`)}
              className="px-2 py-1 text-[10px] bg-civic-elevated rounded hover:bg-civic-muted/30 text-civic-text"
            >
              {criterion}
            </button>
          ))}
        </div>
      </PanelSection>
      
      {/* Insights */}
      {analysis.insights.length > 0 && (
        <PanelSection className="space-y-2">
          <h4 className="text-[10px] font-medium text-civic-text-secondary">PATTERNS</h4>
          {analysis.insights.slice(0, 5).map(insight => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </PanelSection>
      )}
      
      {/* Playbook */}
      {analysis.playbook_recommendations.length > 0 && (
        <PanelSection className="border-t border-civic-border">
          <h4 className="text-[10px] font-medium text-civic-text-secondary mb-2">PLAYBOOK</h4>
          <ul className="space-y-1">
            {analysis.playbook_recommendations.map((rec, i) => (
              <li key={i} className="text-xs text-civic-text flex gap-2">
                <span className="text-civic-accent">→</span>
                {rec}
              </li>
            ))}
          </ul>
        </PanelSection>
      )}
    </div>
  );
}

interface InsightCardProps {
  insight: HistoryInsight;
}

function InsightCard({ insight }: InsightCardProps) {
  const getTypeIcon = () => {
    switch (insight.pattern_type) {
      case 'lever_effect': return '🎛️';
      case 'archetype_trend': return '👥';
      case 'metric_correlation': return '📊';
      case 'best_practice': return '✨';
      case 'warning': return '⚠️';
      default: return '💡';
    }
  };
  
  const getConfidenceColor = () => {
    if (insight.confidence > 0.7) return 'text-civic-support';
    if (insight.confidence > 0.4) return 'text-civic-neutral';
    return 'text-civic-text-secondary';
  };
  
  return (
    <div className="p-2 bg-civic-elevated rounded">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm">{getTypeIcon()}</span>
        <span className="text-xs font-medium text-civic-text flex-1">
          {insight.title}
        </span>
        <span className={`text-[10px] ${getConfidenceColor()}`}>
          {(insight.confidence * 100).toFixed(0)}%
        </span>
      </div>
      <p className="text-[11px] text-civic-text-secondary">
        {insight.description}
      </p>
      {insight.actionable_advice && (
        <p className="text-[10px] text-civic-accent mt-1">
          💡 {insight.actionable_advice}
        </p>
      )}
    </div>
  );
}

interface HistoryItemProps {
  entry: HistoryEntry;
  isSelected: boolean;
  isLatest: boolean;
  isBest: boolean;
  isWorst: boolean;
  onRestore: () => void;
}

function HistoryItem({ entry, isSelected, isLatest, isBest, isWorst, onRestore }: HistoryItemProps) {
  const time = new Date(entry.timestamp);
  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  const score = entry.result.overall_approval;
  const isPositive = score > 20;
  const isNegative = score < -20;
  
  return (
    <button
      onClick={onRestore}
      className={`w-full text-left px-3 py-2 border-b border-civic-border transition-colors ${
        isSelected 
          ? 'bg-civic-accent/10' 
          : 'hover:bg-civic-elevated'
      }`}
    >
      <div className="flex items-start gap-2">
        {/* Timeline dot */}
        <div className="pt-1">
          <div className={`w-2 h-2 rounded-full ${
            isPositive ? 'bg-civic-support' :
            isNegative ? 'bg-civic-oppose' : 'bg-civic-neutral'
          }`} />
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs font-medium text-civic-text truncate">
              {entry.proposal.title}
            </span>
            {isLatest && (
              <Badge variant="default" size="sm">Latest</Badge>
            )}
            {isBest && (
              <Badge variant="support" size="sm">Best</Badge>
            )}
            {isWorst && (
              <Badge variant="oppose" size="sm">Worst</Badge>
            )}
          </div>
          
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs font-mono ${
              isPositive ? 'text-civic-support' :
              isNegative ? 'text-civic-oppose' : 'text-civic-text-secondary'
            }`}>
              {score > 0 ? '+' : ''}{score.toFixed(0)}
            </span>
            <span className="text-[10px] text-civic-text-secondary">
              {timeStr}
            </span>
          </div>
        </div>
        
        {/* Type indicator */}
        <span className="text-sm">
          {entry.proposal.type === 'spatial' ? '📍' : '📋'}
        </span>
      </div>
    </button>
  );
}
