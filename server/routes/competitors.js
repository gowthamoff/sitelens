const express = require('express');
const router = express.Router();
const { validateSiteParams, asyncHandler } = require('../middleware/validate');
const { success, error } = require('../utils/response');
const { competitorAnalysis, opportunityGaps, competitorContext } = require('../services/competitorService');

// ── Validate business_type query param ──────────────────────────────────────
const VALID_TYPES = ['restaurant','pharmacy','grocery','clinic','hospital','education','fitness','bank','hotel','tea'];

function validateBusinessType(req, res, next) {
  const type = req.query.business_type || 'restaurant';
  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json(error(`Invalid business_type. Use one of: ${VALID_TYPES.join(', ')}`));
  }
  req.businessType = type;
  next();
}

// GET /api/competitors?lng=&lat=&radius=&business_type=
router.get('/', validateSiteParams, validateBusinessType, asyncHandler(async (req, res) => {
  const data = await competitorAnalysis({
    ...req.siteParams,
    business_type: req.businessType,
  });
  res.json(success(data));
}));

// GET /api/competitors/gaps?lng=&lat=&radius=&business_type=
router.get('/gaps', validateSiteParams, validateBusinessType, asyncHandler(async (req, res) => {
  const data = await opportunityGaps({
    ...req.siteParams,
    business_type: req.businessType,
  });
  res.json(success(data));
}));

// GET /api/competitors/context?comp_lng=&comp_lat=&site_lng=&site_lat=
router.get('/context', asyncHandler(async (req, res) => {
  const { comp_lng, comp_lat, site_lng, site_lat } = req.query;
  const parsed = [comp_lng, comp_lat, site_lng, site_lat].map(parseFloat);
  if (parsed.some(isNaN)) {
    return res.status(400).json(error('comp_lng, comp_lat, site_lng, site_lat are all required numeric values'));
  }
  const data = await competitorContext({
    comp_lng: parsed[0], comp_lat: parsed[1],
    site_lng:  parsed[2], site_lat:  parsed[3],
  });
  res.json(success(data));
}));

module.exports = router;
