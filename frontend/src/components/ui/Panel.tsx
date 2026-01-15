import type { ReactNode } from 'react';

interface PanelProps {
  children: ReactNode;
  className?: string;
  title?: string;
  actions?: ReactNode;
}

export function Panel({ children, className = '', title, actions }: PanelProps) {
  return (
    <div className={`bg-civic-surface border border-civic-border rounded-lg ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-civic-border">
          {title && <h3 className="text-sm font-medium text-civic-text">{title}</h3>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function PanelSection({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`px-4 py-3 ${className}`}>
      {children}
    </div>
  );
}

export function PanelDivider() {
  return <div className="border-t border-civic-border" />;
}

