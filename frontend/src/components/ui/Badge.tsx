import type { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'support' | 'oppose' | 'neutral';
  size?: 'sm' | 'md';
  className?: string;
}

export function Badge({ children, variant = 'default', size = 'sm', className = '' }: BadgeProps) {
  const variants = {
    default: 'bg-civic-elevated text-civic-text-secondary border-civic-border',
    support: 'bg-civic-support-muted/20 text-civic-support border-civic-support-muted',
    oppose: 'bg-civic-oppose-muted/20 text-civic-oppose border-civic-oppose-muted',
    neutral: 'bg-civic-muted/20 text-civic-neutral border-civic-muted',
  };
  
  const sizes = {
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-xs px-2 py-1',
  };
  
  return (
    <span className={`inline-flex items-center rounded border font-medium ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </span>
  );
}

