const pool = require("./config/db");
const fs = require("fs");
const path = require("path");

async function profileColumns() {
  const cols = [
    'highway', 'waterway', 'railway', 'power', 'aeroway', 
    'barrier', 'man_made', 'landuse', 'leisure', 'natural', 
    'route', 'service', 'surface', 'tunnel', 'access'
  ];

  let docContent = `# 🌍 planet_osm_line: Column Value Analysis\n\n`;
  docContent += `This document provides a breakdown of the most common distinct values found in the \`planet_osm_line\` table (Total segments: ~3.6M).\n\n`;

  for (const col of cols) {
    try {
      const res = await pool.query(`
        SELECT "${col}" as val, COUNT(*) as cnt
        FROM planet_osm_line
        WHERE "${col}" IS NOT NULL
        GROUP BY "${col}"
        ORDER BY cnt DESC
        LIMIT 10;
      `);

      if (res.rows.length === 0) continue;

      docContent += `## 🔹 ${col.toUpperCase()}\n`;
      docContent += `| Value | Count | Description (OSM Standard) |\n`;
      docContent += `| :--- | :--- | :--- |\n`;

      for (const row of res.rows) {
        let desc = getDesc(col, row.val);
        docContent += `| \`${row.val}\` | ${parseInt(row.cnt).toLocaleString()} | ${desc} |\n`;
      }
      docContent += `\n`;
    } catch (e) {
      console.error(`Error profiling ${col}:`, e.message);
    }
  }

  const docsDir = path.join(__dirname, "docs");
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir);
  
  fs.writeFileSync(path.join(docsDir, "planet_osm_line.md"), docContent);
  console.log("Analysis saved to docs/planet_osm_line.md");
  process.exit(0);
}

function getDesc(col, val) {
  const dict = {
    highway: {
      residential: "Local, slow-speed road.",
      unclassified: "Minor connective road.",
      tertiary: "Medium traffic connective road.",
      service: "Access roads for buildings/parking.",
      path: "General purpose trail for hiking/walking.",
      footway: "Dedicated pedestrian paths.",
      track: "Unpaved forest/field roads.",
      secondary: "Regional connective roads.",
      primary: "Main urban/intercity arteries.",
      trunk: "Highest speed urban roads."
    },
    waterway: {
      stream: "Naturally flowing narrow water.",
      canal: "Man-made water channel.",
      river: "Broad natural flowing water.",
      drain: "Artificial drainage ditch.",
      ditch: "Small field irrigation/drain."
    },
    railway: {
       rail: "Main train tracks (broad/standard gauge).",
       subway: "Underground rapid transit.",
       tram: "Light rail or street-level tram."
    },
    service: {
      driveway: "Private entrance road.",
      alley: "Narrow back-access route.",
      parking_aisle: "Internal parking lot road."
    },
    surface: {
      asphalt: "Common paved blacktop.",
      unpaved: "Dirt or gravel road.",
      paved: "General hardened surface.",
      concrete: "Poured reinforced concrete.",
      gravel: "Loose stone surface."
    }
  };
  return (dict[col] && dict[col][val]) || "Standard OSM feature tag.";
}

profileColumns();
