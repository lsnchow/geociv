/**
 * Grid snapping and vicinity/proximity utilities for Build Mode
 */

// Grid cell size in meters (~200m = good granularity for neighborhood-scale planning)
export const GRID_CELL_METERS = 200;

// Approximate meters per degree at Kingston's latitude (~44.23°N)
// 1 degree latitude ≈ 111,000 meters
// 1 degree longitude ≈ 111,000 * cos(44.23°) ≈ 79,500 meters
const METERS_PER_DEG_LAT = 111000;
const METERS_PER_DEG_LNG = 79500; // at Kingston latitude

// Grid cell size in degrees
export const GRID_CELL_DEG_LAT = GRID_CELL_METERS / METERS_PER_DEG_LAT;
export const GRID_CELL_DEG_LNG = GRID_CELL_METERS / METERS_PER_DEG_LNG;

// Impact decay parameters
const DECAY_SCALE_METERS = 1500; // Distance at which impact halves

// Distance buckets
export type DistanceBucket = 'near' | 'medium' | 'far';

export interface GridPoint {
  lat: number;
  lng: number;
}

export interface ZoneCentroid {
  zone_id: string;
  zone_name: string;
  lat: number;
  lng: number;
}

export interface RegionImpact {
  zone_id: string;
  zone_name: string;
  distance_meters: number;
  distance_bucket: DistanceBucket;
  proximity_weight: number; // 0-1, higher = closer
}

/**
 * Snap a coordinate to the nearest grid point
 */
export function snapToGrid(lat: number, lng: number): GridPoint {
  const snappedLat = Math.round(lat / GRID_CELL_DEG_LAT) * GRID_CELL_DEG_LAT;
  const snappedLng = Math.round(lng / GRID_CELL_DEG_LNG) * GRID_CELL_DEG_LNG;
  return { lat: snappedLat, lng: snappedLng };
}

/**
 * Calculate centroid of a polygon (array of [lng, lat] coordinates)
 */
export function calculateCentroid(coordinates: number[][]): GridPoint {
  if (!coordinates || coordinates.length === 0) {
    return { lat: 0, lng: 0 };
  }
  
  let sumLat = 0;
  let sumLng = 0;
  const n = coordinates.length;
  
  for (const coord of coordinates) {
    sumLng += coord[0];
    sumLat += coord[1];
  }
  
  return {
    lat: sumLat / n,
    lng: sumLng / n,
  };
}

/**
 * Calculate distance between two points in meters (Haversine formula simplified)
 */
export function distanceMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const dLat = (lat2 - lat1) * METERS_PER_DEG_LAT;
  const dLng = (lng2 - lng1) * METERS_PER_DEG_LNG;
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/**
 * Calculate proximity weight using exponential decay
 * Weight = e^(-distance / scale)
 * - At distance 0: weight = 1.0
 * - At distance DECAY_SCALE_METERS: weight ≈ 0.37
 * - At distance 2*DECAY_SCALE_METERS: weight ≈ 0.14
 */
export function getProximityWeight(distanceMeters: number): number {
  return Math.exp(-distanceMeters / DECAY_SCALE_METERS);
}

/**
 * Convert distance to human-readable bucket
 */
export function getDistanceBucket(distanceMeters: number): DistanceBucket {
  if (distanceMeters < 800) return 'near';      // < 800m = near
  if (distanceMeters < 2500) return 'medium';   // 800m - 2.5km = medium
  return 'far';                                  // > 2.5km = far
}

/**
 * Rank all regions by distance from a point, with impact weights
 */
export function rankRegionsByDistance(
  point: GridPoint,
  zoneCentroids: ZoneCentroid[]
): RegionImpact[] {
  const impacts: RegionImpact[] = zoneCentroids.map(zone => {
    const dist = distanceMeters(point.lat, point.lng, zone.lat, zone.lng);
    return {
      zone_id: zone.zone_id,
      zone_name: zone.zone_name,
      distance_meters: Math.round(dist),
      distance_bucket: getDistanceBucket(dist),
      proximity_weight: getProximityWeight(dist),
    };
  });
  
  // Sort by proximity weight (highest first = closest)
  impacts.sort((a, b) => b.proximity_weight - a.proximity_weight);
  
  return impacts;
}

/**
 * Find which zone contains a point (simple point-in-polygon check)
 * Uses ray casting algorithm
 */
export function findContainingZone(
  point: GridPoint,
  zones: Array<{ id: string; name: string; coordinates: number[][] }>
): { id: string; name: string } | null {
  for (const zone of zones) {
    if (pointInPolygon(point, zone.coordinates)) {
      return { id: zone.id, name: zone.name };
    }
  }
  return null;
}

/**
 * Ray casting algorithm for point-in-polygon
 */
function pointInPolygon(point: GridPoint, polygon: number[][]): boolean {
  const { lat, lng } = point;
  let inside = false;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    
    if (intersect) inside = !inside;
  }
  
  return inside;
}

/**
 * Generate grid points within a bounding box for visual overlay
 */
export function generateGridPoints(
  minLat: number, maxLat: number,
  minLng: number, maxLng: number
): GridPoint[] {
  const points: GridPoint[] = [];
  
  // Snap bounds to grid
  const startLat = Math.ceil(minLat / GRID_CELL_DEG_LAT) * GRID_CELL_DEG_LAT;
  const startLng = Math.ceil(minLng / GRID_CELL_DEG_LNG) * GRID_CELL_DEG_LNG;
  
  for (let lat = startLat; lat <= maxLat; lat += GRID_CELL_DEG_LAT) {
    for (let lng = startLng; lng <= maxLng; lng += GRID_CELL_DEG_LNG) {
      points.push({ lat, lng });
    }
  }
  
  return points;
}

/**
 * Get grid cell polygon corners for a given center point
 */
export function getGridCellCorners(center: GridPoint): number[][] {
  const halfLat = GRID_CELL_DEG_LAT / 2;
  const halfLng = GRID_CELL_DEG_LNG / 2;
  
  return [
    [center.lng - halfLng, center.lat - halfLat],
    [center.lng + halfLng, center.lat - halfLat],
    [center.lng + halfLng, center.lat + halfLat],
    [center.lng - halfLng, center.lat + halfLat],
    [center.lng - halfLng, center.lat - halfLat], // Close the polygon
  ];
}
