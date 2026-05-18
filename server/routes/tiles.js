const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { TILE_SERVER_URL } = require("../config/env");

/**
 * GET /tiles/:table/:z/:x/:y.pbf
 * GET /tiles/:z/:x/:y.pbf (fallback)
 * 
 * Supports both internal SQL tile generation and proxying to Martin (TMDV).
 */
const handleTileRequest = async (req, res) => {
  try {
    let { table, z, x, y } = req.params;
    
    // Handle the case where table is omitted (the old way)
    if (!y) {
      y = x;
      x = z;
      z = table;
      table = req.query.layer || "points";
    }

    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Content-Type", "application/x-protobuf");
    res.setHeader("Access-Control-Allow-Origin", "*");

    // 1. If TILE_SERVER_URL is configured (e.g. Martin), proxy the request
    if (TILE_SERVER_URL) {
      try {
        const martinUrl = `${TILE_SERVER_URL}/${table}/${z}/${x}/${y.replace('.pbf', '')}`;
        const response = await fetch(martinUrl);
        
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          return res.send(Buffer.from(buffer));
        } else if (response.status === 204 || response.status === 404) {
          return res.status(204).send();
        }
        console.warn(`[Martin] ${response.status} from ${martinUrl}`);
      } catch (proxyErr) {
        console.error("[Martin Proxy Error]:", proxyErr.message);
        // Fall back to SQL if Martin fails
      }
    }

    // 2. Fallback: Internal SQL generation
    let query;
    const tableId = table.includes('polygon') ? 'polygons' : (table.includes('line') ? 'lines' : 'points');

    if (tableId === "polygons") {
      query = `
        WITH tile AS (
          SELECT
            osm_id, name, landuse, building, leisure, "natural" AS nat,
            ST_AsMVTGeom(way, ST_TileEnvelope($1::int, $2::int, $3::int), 4096, 256, true) AS geom
          FROM planet_osm_polygon
          WHERE way && ST_TileEnvelope($1::int, $2::int, $3::int)
            AND (landuse IS NOT NULL OR building IS NOT NULL OR leisure IS NOT NULL OR "natural" IS NOT NULL)
        )
        SELECT ST_AsMVT(tile, 'osm_polygons', 4096, 'geom') FROM tile;
      `;
    } else if (tableId === "lines") {
      query = `
        WITH tile AS (
          SELECT
            osm_id, name, highway, waterway, railway,
            ST_AsMVTGeom(way, ST_TileEnvelope($1::int, $2::int, $3::int), 4096, 256, true) AS geom
          FROM planet_osm_line
          WHERE way && ST_TileEnvelope($1::int, $2::int, $3::int)
            AND (highway IS NOT NULL OR waterway IS NOT NULL OR railway IS NOT NULL)
        )
        SELECT ST_AsMVT(tile, 'osm_lines', 4096, 'geom') FROM tile;
      `;
    } else {
      query = `
        WITH tile AS (
          SELECT
            osm_id, name, amenity, shop, leisure, tourism, highway,
            ST_AsMVTGeom(way, ST_TileEnvelope($1::int, $2::int, $3::int), 4096, 256, true) AS geom
          FROM planet_osm_point
          WHERE way && ST_TileEnvelope($1::int, $2::int, $3::int)
            AND (amenity IS NOT NULL OR shop IS NOT NULL OR leisure IS NOT NULL OR tourism IS NOT NULL OR highway = 'bus_stop')
        )
        SELECT ST_AsMVT(tile, 'osm_points', 4096, 'geom') FROM tile;
      `;
    }

    const result = await pool.query(query, [z, x, y.replace('.pbf', '')]);
    const tile = result.rows[0][Object.keys(result.rows[0])[0]];

    if (!tile || tile.length === 0) {
      return res.status(204).send();
    }

    res.send(tile);
  } catch (err) {
    console.error("TILE ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
};

router.get("/:table/:z/:x/:y.pbf", handleTileRequest);
router.get("/:z/:x/:y.pbf", handleTileRequest);

module.exports = router;
