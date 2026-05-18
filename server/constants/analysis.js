/**
 * Centralized constant values for spatial analysis.
 */
module.exports = {
  SRID: 4326,
  DEFAULT_RADIUS_M: 1000,
  MAX_RADIUS_M: 10000,
  
  // Weights for different scoring modules (out of 1.0)
  SCORE_WEIGHTS: {
    proximity: 0.20,
    landuse: 0.15,
    transport: 0.15,
    amenity: 0.20,
    environment: 0.10,
    connectivity: 0.10,
    risk: 0.10
  }
};
