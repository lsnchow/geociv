import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', children, loading, className = '', disabled, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-civic-accent focus:ring-offset-2 focus:ring-offset-civic-bg disabled:opacity-50 disabled:pointer-events-none';
    
    const variants = {
      primary: 'bg-civic-accent text-white hover:bg-civic-accent-muted',
      secondary: 'bg-civic-elevated text-civic-text border border-civic-border hover:bg-civic-muted',
      ghost: 'text-civic-text-secondary hover:text-civic-text hover:bg-civic-elevated',
      danger: 'bg-civic-oppose text-white hover:bg-civic-oppose-muted',
    };
    
    const sizes = {
      sm: 'text-xs px-2.5 py-1.5 rounded',
      md: 'text-sm px-4 py-2 rounded-md',
      lg: 'text-base px-6 py-3 rounded-lg',
    };
    
    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

