"""Exposure calculation for spatial proposals."""

import math
from dataclasses import dataclass
from typing import Optional


@dataclass
class Location:
    """A geographic location."""

    latitude: float
    longitude: float


def haversine_distance(loc1: Location, loc2: Location) -> float:
    """
    Calculate the great-circle distance between two points in kilometers.
    
    Uses the Haversine formula for accuracy.
    """
    R = 6371.0  # Earth's radius in kilometers
    
    lat1_rad = math.radians(loc1.latitude)
    lat2_rad = math.radians(loc2.latitude)
    delta_lat = math.radians(loc2.latitude - loc1.latitude)
    delta_lon = math.radians(loc2.longitude - loc1.longitude)
    
    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c


class ExposureCalculator:
    """
    Calculates exposure/impact based on distance decay.
    
    Uses exponential decay: E = exp(-d / λ) where:
    - d is the distance in kilometers
    - λ is the decay parameter (higher = wider impact)
    """

    def __init__(self, lambda_decay: float = 1.0):
        """
        Initialize calculator.
        
        Args:
            lambda_decay: Decay parameter in km. 
                         1.0 = ~37% exposure at 1km
                         0.5 = very local (37% at 0.5km)
                         2.0 = wider impact (37% at 2km)
        """
        self.lambda_decay = lambda_decay

    def calculate_exposure(
        self,
        proposal_location: Location,
        target_location: Location,
        min_exposure: float = 0.05,
    ) -> float:
        """
        Calculate exposure of a target location to a proposal.
        
        Args:
            proposal_location: Location of the proposal
            target_location: Location to calculate exposure for
            min_exposure: Minimum exposure floor (prevents zero exposure)
            
        Returns:
            Exposure value between min_exposure and 1.0
        """
        distance = haversine_distance(proposal_location, target_location)
        exposure = math.exp(-distance / self.lambda_decay)
        return max(exposure, min_exposure)

    def calculate_exposures(
        self,
        proposal_location: Location,
        target_locations: list[tuple[str, Location]],
        normalize: bool = True,
    ) -> dict[str, float]:
        """
        Calculate exposures for multiple target locations.
        
        Args:
            proposal_location: Location of the proposal
            target_locations: List of (name, location) tuples
            normalize: Whether to normalize exposures to sum to 1
            
        Returns:
            Dictionary of name to exposure value
        """
        exposures = {}
        for name, location in target_locations:
            exposures[name] = self.calculate_exposure(proposal_location, location)
        
        if normalize and exposures:
            total = sum(exposures.values())
            exposures = {k: v / total for k, v in exposures.items()}
        
        return exposures

    def calculate_citywide_exposure(
        self,
        archetype_key: str,
        income_level: str = "middle",
        is_renter: bool = False,
        is_business_owner: bool = False,
        citywide_type: Optional[str] = None,
    ) -> float:
        """
        Calculate exposure for citywide (non-spatial) proposals.
        
        Citywide proposals affect everyone but with varying intensity
        based on socioeconomic attributes.
        
        Args:
            archetype_key: Key of the archetype
            income_level: Income level (low, middle, high)
            is_renter: Whether the archetype is a renter
            is_business_owner: Whether the archetype owns a business
            citywide_type: Type of citywide proposal
            
        Returns:
            Exposure multiplier (typically 0.5 to 1.5)
        """
        base_exposure = 1.0
        
        if citywide_type:
            # Income-based adjustments
            if citywide_type in ("tax_increase", "tax_decrease"):
                if income_level == "high":
                    base_exposure = 1.3  # Feels tax changes more (absolute terms)
                elif income_level == "low":
                    base_exposure = 1.2  # Feels it more (relative terms)
            
            elif citywide_type == "subsidy":
                if income_level == "low":
                    base_exposure = 1.5  # Benefits most from subsidies
                elif income_level == "high":
                    base_exposure = 0.5  # Least affected
            
            elif citywide_type in ("regulation", "environmental_policy"):
                if is_business_owner:
                    base_exposure = 1.4  # Business owners feel regulations more
            
            elif citywide_type == "transit_funding":
                # Those who rely on transit benefit more
                if income_level == "low" or is_renter:
                    base_exposure = 1.3
            
            elif citywide_type == "housing_policy":
                if is_renter:
                    base_exposure = 1.3
                elif income_level == "low":
                    base_exposure = 1.2
        
        return base_exposure


# Lambda presets for different proposal types
LAMBDA_PRESETS: dict[str, float] = {
    "park": 0.5,  # Very local impact
    "upzone": 1.0,  # Moderate local impact
    "transit_line": 2.0,  # Wider impact along corridor
    "factory": 1.5,  # Moderate-wide impact (noise, traffic)
    "housing_development": 0.8,  # Fairly local
    "commercial_development": 1.0,  # Moderate
    "bike_lane": 0.7,  # Local
    "community_center": 0.6,  # Local
}


def get_lambda_for_proposal(proposal_type: str, custom_lambda: Optional[float] = None) -> float:
    """
    Get the appropriate lambda decay for a proposal type.
    
    Args:
        proposal_type: Type of proposal
        custom_lambda: Optional override value
        
    Returns:
        Lambda decay value in km
    """
    if custom_lambda is not None:
        return custom_lambda
    return LAMBDA_PRESETS.get(proposal_type, 1.0)

