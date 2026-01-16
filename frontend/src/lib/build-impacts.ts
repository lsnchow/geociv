/**
 * Build Impact Profiles - defines how each build type affects metrics
 * These are "impact hints" - agents can still disagree based on persona
 */

import type { SpatialProposalType } from '../types';

export interface MetricImpact {
  metric: string;
  direction: 'positive' | 'negative';
  magnitude: 'low' | 'medium' | 'high';
  description: string;
}

export interface BuildImpactProfile {
  type: SpatialProposalType;
  name: string;
  icon: string;
  primary_impacts: MetricImpact[];
  potential_concerns: string[];
  typical_supporters: string[];
  typical_opponents: string[];
}

export const BUILD_IMPACT_PROFILES: Record<SpatialProposalType, BuildImpactProfile> = {
  park: {
    type: 'park',
    name: 'Park',
    icon: '🌳',
    primary_impacts: [
      { metric: 'environment', direction: 'positive', magnitude: 'high', description: 'Green space and natural habitat' },
      { metric: 'community', direction: 'positive', magnitude: 'medium', description: 'Recreation and gathering space' },
      { metric: 'property_values', direction: 'positive', magnitude: 'low', description: 'Neighborhood amenity boost' },
    ],
    potential_concerns: ['Land use opportunity cost', 'Maintenance costs', 'Potential displacement of other uses'],
    typical_supporters: ['Families', 'Environmental advocates', 'Health-conscious residents'],
    typical_opponents: ['Those wanting housing/development', 'Fiscal conservatives'],
  },
  
  upzone: {
    type: 'upzone',
    name: 'Upzone',
    icon: '🏗️',
    primary_impacts: [
      { metric: 'housing_supply', direction: 'positive', magnitude: 'high', description: 'Increased development potential' },
      { metric: 'density', direction: 'positive', magnitude: 'high', description: 'More units per area' },
      { metric: 'affordability', direction: 'positive', magnitude: 'medium', description: 'More supply can moderate prices' },
    ],
    potential_concerns: ['Neighborhood character change', 'Infrastructure strain', 'Traffic increase', 'Shadow/view impacts'],
    typical_supporters: ['Housing advocates', 'Developers', 'Renters'],
    typical_opponents: ['Existing homeowners', 'Historic preservation groups'],
  },
  
  housing_development: {
    type: 'housing_development',
    name: 'Housing',
    icon: '🏠',
    primary_impacts: [
      { metric: 'housing_supply', direction: 'positive', magnitude: 'high', description: 'New residential units' },
      { metric: 'affordability', direction: 'positive', magnitude: 'medium', description: 'Long-term supply increase' },
      { metric: 'jobs', direction: 'positive', magnitude: 'low', description: 'Construction employment' },
    ],
    potential_concerns: ['Construction disruption', 'Traffic during build', 'School capacity', 'Parking demand'],
    typical_supporters: ['Housing seekers', 'Young families', 'Economic development'],
    typical_opponents: ['Adjacent property owners', 'Those fearing density'],
  },
  
  transit_line: {
    type: 'transit_line',
    name: 'Transit',
    icon: '🚌',
    primary_impacts: [
      { metric: 'mobility', direction: 'positive', magnitude: 'high', description: 'Better transportation access' },
      { metric: 'accessibility', direction: 'positive', magnitude: 'high', description: 'Connects underserved areas' },
      { metric: 'environment', direction: 'positive', magnitude: 'medium', description: 'Reduces car dependency' },
    ],
    potential_concerns: ['Construction disruption', 'Noise from vehicles', 'Parking removal', 'Cost overruns'],
    typical_supporters: ['Non-drivers', 'Students', 'Environmental advocates', 'Low-income residents'],
    typical_opponents: ['Car-dependent commuters', 'Business owners losing parking'],
  },
  
  bike_lane: {
    type: 'bike_lane',
    name: 'Bike Lane',
    icon: '🚴',
    primary_impacts: [
      { metric: 'mobility', direction: 'positive', magnitude: 'medium', description: 'Safe cycling infrastructure' },
      { metric: 'safety', direction: 'positive', magnitude: 'high', description: 'Protected from traffic' },
      { metric: 'environment', direction: 'positive', magnitude: 'low', description: 'Encourages low-carbon transport' },
    ],
    potential_concerns: ['Road lane reduction', 'Parking removal', 'Winter maintenance', 'Low usage concerns'],
    typical_supporters: ['Cyclists', 'Students', 'Environmental advocates', 'Young professionals'],
    typical_opponents: ['Drivers', 'Businesses dependent on street parking'],
  },
  
  commercial_development: {
    type: 'commercial_development',
    name: 'Commercial',
    icon: '🏪',
    primary_impacts: [
      { metric: 'jobs', direction: 'positive', magnitude: 'high', description: 'Employment opportunities' },
      { metric: 'vibrancy', direction: 'positive', magnitude: 'medium', description: 'Street life and activity' },
      { metric: 'tax_base', direction: 'positive', magnitude: 'medium', description: 'Commercial property taxes' },
    ],
    potential_concerns: ['Traffic increase', 'Competition with existing businesses', 'Noise and activity', 'Parking demand'],
    typical_supporters: ['Job seekers', 'Economic development', 'Municipal finance'],
    typical_opponents: ['Residential neighbors', 'Competing businesses'],
  },
  
  community_center: {
    type: 'community_center',
    name: 'Community Place',
    icon: '🏛️',
    primary_impacts: [
      { metric: 'community', direction: 'positive', magnitude: 'high', description: 'Gathering and program space' },
      { metric: 'safety', direction: 'positive', magnitude: 'medium', description: 'Youth programs, eyes on street' },
      { metric: 'social_services', direction: 'positive', magnitude: 'medium', description: 'Support services access' },
    ],
    potential_concerns: ['Operating costs', 'Traffic from events', 'Parking needs', 'Noise from activities'],
    typical_supporters: ['Families', 'Youth', 'Seniors', 'Community organizers'],
    typical_opponents: ['Fiscal conservatives', 'Adjacent residents'],
  },
  
  factory: {
    type: 'factory',
    name: 'Factory',
    icon: '🏭',
    primary_impacts: [
      { metric: 'jobs', direction: 'positive', magnitude: 'high', description: 'Industrial employment' },
      { metric: 'tax_base', direction: 'positive', magnitude: 'high', description: 'Industrial property taxes' },
      { metric: 'economy', direction: 'positive', magnitude: 'medium', description: 'Local economic activity' },
    ],
    potential_concerns: ['Environmental impact', 'Noise pollution', 'Truck traffic', 'Air quality', 'Property value impacts'],
    typical_supporters: ['Workers', 'Trades unions', 'Economic development'],
    typical_opponents: ['Nearby residents', 'Environmental advocates'],
  },
};

/**
 * Get a human-readable summary of impact for agent context
 */
export function getImpactSummary(type: SpatialProposalType, scale: number = 1): string {
  const profile = BUILD_IMPACT_PROFILES[type];
  if (!profile) return 'Unknown build type';
  
  const scaleLabel = scale <= 1 ? 'small-scale' : scale <= 2 ? 'medium-scale' : 'large-scale';
  
  const positives = profile.primary_impacts
    .filter(i => i.direction === 'positive')
    .map(i => i.description)
    .slice(0, 2)
    .join(', ');
  
  const concerns = profile.potential_concerns.slice(0, 2).join(', ');
  
  return `A ${scaleLabel} ${profile.name.toLowerCase()} that typically brings: ${positives}. Potential concerns: ${concerns}.`;
}
