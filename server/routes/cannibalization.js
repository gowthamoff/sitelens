const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// POST /api/cannibalization
router.post('/cannibalization', async (req, res) => {
  const { newSite, existingOutlets } = req.body;
  if (!newSite?.lat || !newSite?.lng || !Array.isArray(existingOutlets)) {
    return res.status(400).json({ error: 'newSite{lat,lng} and existingOutlets[] required' });
  }
  if (existingOutlets.length === 0) {
    return res.json({ newSite, results: [], verdict: { level: 'safe', msg: 'No existing outlets to compare against.' } });
  }

  const WALK = 500;
  const DELIVERY = 3000;

  try {
    const { rows } = await pool.query(`
      WITH new_pt AS (SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326) AS g),
      outlets AS (
        SELECT * FROM unnest($3::jsonb[]) AS o(data)
      )
      SELECT
        (data->>'id') AS id,
        (data->>'name') AS name,
        ROUND(ST_Distance(
          (SELECT g FROM new_pt)::geography,
          ST_SetSRID(ST_MakePoint((data->>'lng')::float, (data->>'lat')::float), 4326)::geography
        )) AS distance_m,
        ROUND(GREATEST(0,
          ST_Area(ST_Intersection(
            ST_Buffer((SELECT g FROM new_pt)::geography, $4)::geometry,
            ST_Buffer(ST_SetSRID(ST_MakePoint((data->>'lng')::float, (data->>'lat')::float), 4326)::geography, $4)::geometry
          )) / NULLIF(ST_Area(ST_Buffer((SELECT g FROM new_pt)::geography, $4)::geometry), 0) * 100
        )) AS walk_overlap_pct,
        ROUND(GREATEST(0,
          ST_Area(ST_Intersection(
            ST_Buffer((SELECT g FROM new_pt)::geography, $5)::geometry,
            ST_Buffer(ST_SetSRID(ST_MakePoint((data->>'lng')::float, (data->>'lat')::float), 4326)::geography, $5)::geometry
          )) / NULLIF(ST_Area(ST_Buffer((SELECT g FROM new_pt)::geography, $5)::geometry), 0) * 100
        )) AS delivery_overlap_pct
      FROM outlets;
    `, [newSite.lng, newSite.lat, existingOutlets.map(o => JSON.stringify(o)), WALK, DELIVERY]);

    const verdict = buildVerdict(rows);
    res.json({ newSite, results: rows, verdict });
  } catch (err) {
    console.error('[Cannibalization]', err);
    res.status(500).json({ error: 'cannibalization query failed' });
  }
});

function buildVerdict(rows) {
  if (!rows.length) return { level: 'safe', msg: 'No existing outlets to compare against.' };
  const maxDel  = Math.max(...rows.map(r => Number(r.delivery_overlap_pct) || 0));
  const maxWalk = Math.max(...rows.map(r => Number(r.walk_overlap_pct) || 0));
  if (maxWalk > 30) return { level: 'high',   msg: `Walking catchment overlaps existing outlet by ${maxWalk}%. Direct cannibalization risk.` };
  if (maxDel  > 60) return { level: 'medium', msg: `Delivery zone overlaps existing outlet by ${maxDel}%. Expect 25-40% delivery cannibalization.` };
  if (maxDel  > 30) return { level: 'low',    msg: `Delivery zone has ${maxDel}% overlap. Minor revenue impact.` };
  return { level: 'safe', msg: 'No meaningful catchment overlap with existing outlets.' };
}

module.exports = router;
