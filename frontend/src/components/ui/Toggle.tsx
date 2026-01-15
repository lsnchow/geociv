interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}

export function Toggle({ label, checked, onChange, className = '' }: ToggleProps) {
  return (
    <label className={`flex items-center justify-between cursor-pointer ${className}`}>
      <span className="text-xs text-civic-text-secondary">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`
          relative inline-flex h-5 w-9 items-center rounded-full transition-colors
          ${checked ? 'bg-civic-accent' : 'bg-civic-muted'}
        `}
      >
        <span
          className={`
            inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform
            ${checked ? 'translate-x-4.5' : 'translate-x-1'}
          `}
          style={{ transform: checked ? 'translateX(18px)' : 'translateX(4px)' }}
        />
      </button>
    </label>
  );
}

