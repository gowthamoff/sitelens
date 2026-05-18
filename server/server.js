require('dotenv').config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const compression = require("compression");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { PORT } = require("./config/env");

const app = express();

// Middlewares

// Basic Security Headers via Helmet
// Helmet protects against XSS, clickjacking, and sniff attacks
app.use(helmet());

// Cross-Origin Resource Sharing
// Configured via ENV to allow domain whitelisting, defaults to * for ease of testing
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || "*",
}));

app.use(compression());
app.use(express.json());

// Tab-fetch limiter — covers individual analysis endpoints (/footfall, /landuse, etc.)
// Old architecture: 1 click = 1 request to /full → 30/min was fine.
// New lazy-loading: each tab switch = 1 request, so a user browsing 6 tabs makes
// 6 requests before seeing results. Raised to 120/min to support normal browsing.
const analysisLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  message: { error: "Too many requests from this IP, please try again after a minute" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Heavy geo limiter — demand-mix-geo runs ST_Intersection on every polygon in the buffer.
// Kept lower (30/min) since one call can do significant PostGIS work.
const geoLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: { error: "Geo requests throttled, please wait a moment." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Geocode rate limiter
const geocodeLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: { error: 'Too many geocode requests, please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Routes
const analysisRouter         = require('./routes/analysis');
const tileRouter             = require('./routes/tiles');
// const ndviRouter          = require('./routes/ndvi');
const geocodeRouter          = require('./routes/geocode');
const competitorRouter       = require('./routes/competitors');
const cannibalizationRouter  = require('./routes/cannibalization');
const demandMixRouter        = require('./routes/demand-mix');

// Extra throttle on the heavy geo endpoint (ST_Intersection per polygon).
// Runs BEFORE the general analysisLimiter so geo requests are counted against both.
app.use('/api/demand-mix-geo', geoLimiter);

app.use('/api/analysis',    analysisLimiter, analysisRouter);
app.use('/api/competitors', analysisLimiter, competitorRouter);
// Both routers are mounted at /api so Express strips only '/api', leaving
// '/cannibalization' and '/demand-mix*' for the router handlers to match.
app.use('/api',             analysisLimiter, cannibalizationRouter);
app.use('/api',             analysisLimiter, demandMixRouter);
app.use('/tiles',            tileRouter);
// app.use('/api/ndvi',      ndviRouter);
app.use('/api/v1/geocode',   geocodeLimiter, geocodeRouter);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Global Error Handler - MUST BE LAST
app.use(require("./middleware/errorHandler"));

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║   OSM Site Analysis Server (Refactored)      ║
║   http://localhost:${PORT}                      ║
║   Tiles:    /tiles/:z/:x/:y.pbf              ║
║   Analysis: /api/analysis/full               ║
╚══════════════════════════════════════════════╝
  `);
});
