const { error } = require("../utils/response");

/**
 * Validates lat, lng, and radius.
 * Attaches sanitised params to req.siteParams.
 */
function validateSiteParams(req, res, next) {
  const { lat, lng, radius } = req.query;

  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  const radNum = parseInt(radius) || 1000;

  if (isNaN(latNum) || isNaN(lngNum)) {
    return res.status(400).json(error("Invalid geo-coordinates. Provide numeric lat and lng."));
  }

  if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
    return res.status(400).json(error("Coordinates out of terrestrial bounds."));
  }

  req.siteParams = {
    lat: latNum,
    lng: lngNum,
    radius: Math.min(Math.max(radNum, 100), 10000) // 100m to 10km bounds
  };

  next();
}

/**
 * Wraps async route handlers to catch errors and pass them to next().
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { validateSiteParams, asyncHandler };
