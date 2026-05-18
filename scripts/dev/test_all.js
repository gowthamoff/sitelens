const { landUseBreakdown, buildingStats } = require("../services/landUseService");
const { transportStats }    = require("../services/transportService");
const { connectivityAnalysis } = require("../services/connectivityService");
const { environmentalScan } = require("../services/environmentService");
const { riskAssessment }    = require("../services/riskService");

const params = { lng: 77.5835, lat: 12.9692, radius: 1000 };

async function runAll() {
  const tests = [
    ["LandUse",      () => landUseBreakdown(params)],
    ["Buildings",    () => buildingStats(params)],
    ["Transport",    () => transportStats(params)],
    ["Connectivity", () => connectivityAnalysis(params)],
    ["Environment",  () => environmentalScan(params)],
    ["Risk",         () => riskAssessment(params)],
  ];

  for (const [name, fn] of tests) {
    try {
      const r = await fn();
      const summary = Array.isArray(r) ? `${r.length} rows` : JSON.stringify(r).slice(0, 120);
      console.log(`✅ ${name}: ${summary}`);
    } catch (e) {
      console.error(`❌ ${name}: ${e.message}`);
    }
  }
  process.exit(0);
}

runAll();
