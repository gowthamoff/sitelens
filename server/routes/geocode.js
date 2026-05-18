const express = require('express');
const router = express.Router();
const pool = require('../config/db');

/**
 * GET /api/v1/geocode?q=Anna+Nagar&limit=5
 * Forward geocode: text → coordinates using pg_trgm fuzzy matching
 *
 * GET /api/v1/geocode/reverse?lat=13.085&lng=80.218
 * Reverse geocode: coordinates → nearest named place
 */

// Forward geocode
router.get('/', async (req, res, next) => {
  try {
    const { q, limit = 6 } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return res.status(400).json({ error: 'Query parameter `q` must be at least 2 characters.' });
    }

    const searchTerm = q.trim();

    // Optimized Top-N Search: Fetch top 100 via GiST index distance (<->), then re-rank by category boost
    const result = await pool.query(
      `SELECT * FROM (
         SELECT
           name,
           place_type,
           category,
           ST_Y(geom) AS lat,
           ST_X(geom) AS lng,
           similarity(name, $1) AS sim
         FROM geocode_places
         WHERE name % $1
         ORDER BY name <-> $1
         LIMIT 100
       ) AS candidates
       ORDER BY (sim *
         CASE category
           WHEN 'area' THEN 3.0
           WHEN 'road' THEN 2.0
           ELSE 1.0
         END
       ) DESC
       LIMIT $2`,
      [searchTerm, parseInt(limit, 10)]
    );

    res.json(result.rows);
  } catch (err) {
    // Gracefully handle missing materialized view
    if (err.message && err.message.includes('does not exist')) {
      return res.status(503).json({
        error: 'Geocode index not ready. Run the migration at docs/geocode_migration.sql first.',
      });
    }
    next(err);
  }
});

// Reverse geocode
router.get('/reverse', async (req, res, next) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'Both `lat` and `lng` query parameters are required.' });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({ error: 'lat and lng must be valid numbers.' });
    }

    const result = await pool.query(
      `SELECT
         name, place_type, category,
         ST_Distance(geog, ST_MakePoint($1, $2)::geography) AS distance_m
       FROM geocode_places
       ORDER BY geog <-> ST_MakePoint($1, $2)::geography
       LIMIT 1`,
      [longitude, latitude]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No places found near these coordinates.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    if (err.message && err.message.includes('does not exist')) {
      return res.status(503).json({
        error: 'Geocode index not ready. Run the migration at docs/geocode_migration.sql first.',
      });
    }
    next(err);
  }
});

module.exports = router;
