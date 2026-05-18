const express = require("express");
const router = express.Router();
const { validateSiteParams, asyncHandler } = require("../middleware/validate");
const { success } = require("../utils/response");

const { proximitySummary, nearestNeighbours } = require("../services/proximityService");
const { landUseBreakdown, buildingStats } = require("../services/landUseService");
const { transportStats } = require("../services/transportService");
const { amenityScore } = require("../services/amenityService");
const { environmentalScan } = require("../services/environmentService");
const { connectivityAnalysis } = require("../services/connectivityService");
const { riskAssessment } = require("../services/riskService");
const { footfallAnalysis } = require("../services/footfallService");

// ────────────────────────────────────────────────────
// Analysis Endpoints (All use asyncHandler + success())
// ────────────────────────────────────────────────────

router.get("/proximity", validateSiteParams, asyncHandler(async (req, res) => {
  const data = await proximitySummary(req.siteParams);
  res.json(success(data));
}));

router.get("/footfall", validateSiteParams, asyncHandler(async (req, res) => {
  const data = await footfallAnalysis(req.siteParams);
  res.json(success(data));
}));

router.get("/neighbours", validateSiteParams, asyncHandler(async (req, res) => {
  const data = await nearestNeighbours(req.siteParams);
  res.json(success(data));
}));

router.get("/landuse", validateSiteParams, asyncHandler(async (req, res) => {
  const [breakdown, buildings] = await Promise.all([
    landUseBreakdown(req.siteParams),
    buildingStats(req.siteParams),
  ]);
  res.json(success({ breakdown, buildings }));
}));

router.get("/transport", validateSiteParams, asyncHandler(async (req, res) => {
  const data = await transportStats(req.siteParams);
  res.json(success(data));
}));

router.get("/amenity-score", validateSiteParams, asyncHandler(async (req, res) => {
  const data = await amenityScore(req.siteParams);
  res.json(success(data));
}));

router.get("/environment", validateSiteParams, asyncHandler(async (req, res) => {
  const data = await environmentalScan(req.siteParams);
  res.json(success(data));
}));

router.get("/connectivity", validateSiteParams, asyncHandler(async (req, res) => {
  const data = await connectivityAnalysis(req.siteParams);
  res.json(success(data));
}));

router.get("/risk", validateSiteParams, asyncHandler(async (req, res) => {
  const data = await riskAssessment(req.siteParams);
  res.json(success(data));
}));

router.get("/full", validateSiteParams, asyncHandler(async (req, res) => {
  const [
    proximity, neighbours, landuse, buildings,
    transport, amenity, environment, connectivity, risk, footfall
  ] = await Promise.all([
    proximitySummary(req.siteParams),
    nearestNeighbours(req.siteParams),
    landUseBreakdown(req.siteParams),
    buildingStats(req.siteParams),
    transportStats(req.siteParams),
    amenityScore(req.siteParams),
    environmentalScan(req.siteParams),
    connectivityAnalysis(req.siteParams),
    riskAssessment(req.siteParams),
    footfallAnalysis(req.siteParams),
  ]);

  res.json(success({
    params: req.siteParams,
    data: {
      proximity,
      neighbours,
      landuse: { breakdown: landuse, buildings },
      transport,
      amenity,
      environment,
      connectivity,
      risk,
      footfall,
    },
  }));
}));

module.exports = router;
