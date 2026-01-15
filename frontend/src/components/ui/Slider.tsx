import { useId } from 'react';

interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  className?: string;
}

export function Slider({ 
  label, 
  value, 
  onChange, 
  min = 0, 
  max = 100, 
  step = 1,
  unit = '',
  className = '' 
}: SliderProps) {
  const id = useId();
  
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-xs text-civic-text-secondary">
          {label}
        </label>
        <span className="text-xs font-mono text-civic-text">
          {value}{unit}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-civic-muted rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-3
          [&::-webkit-slider-thumb]:h-3
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-civic-accent
          [&::-webkit-slider-thumb]:cursor-pointer
          [&::-webkit-slider-thumb]:transition-transform
          [&::-webkit-slider-thumb]:hover:scale-110"
      />
    </div>
  );
}

