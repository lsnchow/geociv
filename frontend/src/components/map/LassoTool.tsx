import { useState, useCallback } from 'react';
import { Button } from '../ui';

interface LassoToolProps {
  isActive: boolean;
  onToggle: () => void;
  onComplete: (path: Array<{ lat: number; lng: number }>) => void;
}

export function LassoTool({ isActive, onToggle, onComplete: _onComplete }: LassoToolProps) {
  void _onComplete; // Used by parent component
  return (
    <div className="absolute top-4 right-4 z-10">
      <Button
        variant={isActive ? 'primary' : 'secondary'}
        size="sm"
        onClick={onToggle}
        className="shadow-lg"
      >
        {isActive ? '✓ Done Drawing' : '✏️ Draw Area'}
      </Button>
      {isActive && (
        <div className="mt-2 p-2 bg-civic-surface/90 backdrop-blur rounded text-xs text-civic-text-secondary">
          Click to add points, then click Done
        </div>
      )}
    </div>
  );
}

// Hook for managing lasso state
export function useLassoDrawing() {
  const [isDrawing, setIsDrawing] = useState(false);
  const [path, setPath] = useState<Array<{ lat: number; lng: number }>>([]);
  
  const startDrawing = useCallback(() => {
    setIsDrawing(true);
    setPath([]);
  }, []);
  
  const addPoint = useCallback((lat: number, lng: number) => {
    if (isDrawing) {
      setPath(prev => [...prev, { lat, lng }]);
    }
  }, [isDrawing]);
  
  const finishDrawing = useCallback(() => {
    setIsDrawing(false);
    return path;
  }, [path]);
  
  const cancelDrawing = useCallback(() => {
    setIsDrawing(false);
    setPath([]);
  }, []);
  
  return {
    isDrawing,
    path,
    startDrawing,
    addPoint,
    finishDrawing,
    cancelDrawing,
  };
}

// Convert lasso path to GeoJSON polygon
export function pathToGeoJSON(path: Array<{ lat: number; lng: number }>): {
  type: 'Polygon';
  coordinates: number[][][];
} | null {
  if (path.length < 3) return null;
  
  // Close the polygon
  const closedPath = [...path, path[0]];
  
  return {
    type: 'Polygon',
    coordinates: [closedPath.map(p => [p.lng, p.lat])],
  };
}

// Determine if a lasso shape looks like a corridor (elongated)
export function analyzeShape(path: Array<{ lat: number; lng: number }>): {
  isCorridor: boolean;
  suggestedType: string;
  centerLat: number;
  centerLng: number;
} {
  if (path.length < 3) {
    return {
      isCorridor: false,
      suggestedType: 'area',
      centerLat: path[0]?.lat || 0,
      centerLng: path[0]?.lng || 0,
    };
  }
  
  // Calculate bounding box
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;
  
  for (const p of path) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  
  const latSpan = maxLat - minLat;
  const lngSpan = maxLng - minLng;
  const aspectRatio = Math.max(latSpan, lngSpan) / Math.min(latSpan, lngSpan);
  
  // If aspect ratio > 3, it's probably a corridor
  const isCorridor = aspectRatio > 3;
  
  // Suggest type based on shape
  let suggestedType = 'area';
  if (isCorridor) {
    suggestedType = 'corridor (bike lane or transit?)';
  }
  
  return {
    isCorridor,
    suggestedType,
    centerLat: (minLat + maxLat) / 2,
    centerLng: (minLng + maxLng) / 2,
  };
}

