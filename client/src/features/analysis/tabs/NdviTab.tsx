import { useAnalysis } from '../../../context/AnalysisContext';
import { SectionTitle } from '../../../components/ui/Basic';
import { StatStrip, StatTile } from '../../../components/ui/Stats';
import { Loader2, Satellite, Zap, CloudOff, CheckCircle2, Leaf } from 'lucide-react';

// ─── Colour map for each vegetation class ────────────────────────────────────
const CLASS_COLORS: Record<string, string> = {
  dense_vegetation:    '#00a86b',
  moderate_vegetation: '#7ee787',
  sparse_vegetation:   '#ffa657',
  barren_or_built:     '#e3b341',
  water_or_shadow:     '#4fc3f7',
};

const CLASS_LABELS: Record<string, string> = {
  dense_vegetation:    'Dense Vegetation',
  moderate_vegetation: 'Moderate Vegetation',
  sparse_vegetation:   'Sparse Vegetation',
  barren_or_built:     'Barren / Built-up',
  water_or_shadow:     'Water / Shadow',
};

// ─── Health badge colour ──────────────────────────────────────────────────────
function healthColor(label: string): string {
  if (label.toLowerCase().includes('dense'))    return '#00a86b';
  if (label.toLowerCase().includes('moderate')) return '#7ee787';
  if (label.toLowerCase().includes('sparse'))   return '#ffa657';
  if (label.toLowerCase().includes('barren'))   return '#e3b341';
  return '#4fc3f7'; // water/shadow
}

// ─── Horizontal bar for one vegetation class ─────────────────────────────────
function BreakdownBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ fontSize: '12px', fontWeight: 700, color }}>{pct.toFixed(1)}%</span>
      </div>
      <div style={{
        height: '6px', borderRadius: '4px',
        background: 'var(--border)', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${pct}%`, maxWidth: '100%',
          background: color, borderRadius: '4px',
          transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
        }} />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function NdviTab() {
  const {
    ndviData, ndviLoading, ndviError,
    runNdviAnalysis,
    analysisType, drawnPolygon,
  } = useAnalysis();

  const canScan = analysisType === 'polygon' && !!drawnPolygon;

  // ── Call-to-action when no polygon drawn ──
  if (!canScan && !ndviData) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{
          width: '56px', height: '56px', borderRadius: '18px',
          background: 'rgba(79,156,249,0.1)', border: '1px solid rgba(79,156,249,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <Satellite size={28} color="var(--accent)" />
        </div>
        <p style={{ color: 'var(--text)', fontWeight: 700, fontSize: '15px', marginBottom: '8px' }}>
          Satellite Vegetation Analysis
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.6 }}>
          Switch to <strong style={{ color: 'var(--accent)' }}>Polygon mode</strong> and draw
          your site boundary on the map, then scan for NDVI data.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* ── Scan Button ── */}
      <div style={{ marginBottom: '16px' }}>
        <button
          id="ndvi-scan-btn"
          onClick={runNdviAnalysis}
          disabled={ndviLoading || !canScan}
          style={{
            width: '100%', height: '44px', borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.1)',
            cursor: ndviLoading || !canScan ? 'not-allowed' : 'pointer',
            background: canScan && !ndviLoading
              ? 'linear-gradient(135deg, #00a86b, #007a4d)'
              : 'rgba(255,255,255,0.05)',
            color: canScan && !ndviLoading ? '#fff' : 'var(--text-dim)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            fontSize: '12px', fontWeight: 700, letterSpacing: '0.6px',
            transition: 'all 0.25s ease',
            boxShadow: canScan && !ndviLoading ? '0 4px 15px rgba(0,168,107,0.35)' : 'none',
          }}
        >
          {ndviLoading
            ? <><Loader2 size={16} className="icon-spin" /> SCANNING SATELLITE DATA...</>
            : <><Satellite size={16} /> {ndviData ? 'RE-SCAN VEGETATION' : 'ANALYSE VEGETATION'}</>
          }
        </button>

        {/* Timing hint */}
        {!ndviData && !ndviLoading && canScan && (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', marginTop: '8px' }}>
            First scan takes 10–30s (queries Sentinel-2 satellite)
          </p>
        )}
      </div>

      {/* ── Error State ── */}
      {ndviError && (
        <div style={{
          padding: '12px 16px', borderRadius: '10px', marginBottom: '16px',
          background: 'rgba(255,123,114,0.1)', border: '1px solid rgba(255,123,114,0.25)',
          display: 'flex', alignItems: 'flex-start', gap: '10px',
        }}>
          <CloudOff size={16} color="#ff7b72" style={{ flexShrink: 0, marginTop: '2px' }} />
          <span style={{ fontSize: '13px', color: '#ff7b72' }}>{ndviError}</span>
        </div>
      )}

      {/* ── Results (only shown after a successful scan) ── */}
      {ndviData && (
        <>
          {/* Cache badge */}
          {ndviData.cached && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: 'rgba(0,168,107,0.12)', border: '1px solid rgba(0,168,107,0.25)',
              borderRadius: '20px', padding: '4px 12px', marginBottom: '16px',
              fontSize: '11px', fontWeight: 700, color: '#00a86b',
            }}>
              <Zap size={12} fill="#00a86b" /> Cached result — instant
            </div>
          )}
          {!ndviData.cached && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: 'rgba(79,156,249,0.1)', border: '1px solid rgba(79,156,249,0.2)',
              borderRadius: '20px', padding: '4px 12px', marginBottom: '16px',
              fontSize: '11px', fontWeight: 700, color: 'var(--accent)',
            }}>
              <CheckCircle2 size={12} /> Live satellite data
            </div>
          )}

          {/* Health Label banner */}
          <div style={{
            padding: '14px 18px', borderRadius: '12px', marginBottom: '20px',
            background: `rgba(${healthColor(ndviData.health_label)
              .replace('#','')
              .match(/.{2}/g)!
              .map(x=>parseInt(x,16))
              .join(',')}, 0.1)`,
            border: `1px solid ${healthColor(ndviData.health_label)}40`,
            display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            <Leaf size={24} color={healthColor(ndviData.health_label)} />
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                VEGETATION HEALTH
              </div>
              <div style={{
                fontSize: '16px', fontWeight: 800,
                color: healthColor(ndviData.health_label),
              }}>
                {ndviData.health_label}
              </div>
            </div>
          </div>

          {/* NDVI score strip */}
          <StatStrip>
            <StatTile
              value={ndviData.mean_ndvi.toFixed(3)}
              label="Mean NDVI"
              color={healthColor(ndviData.health_label)}
            />
            <StatTile
              value={ndviData.min_ndvi.toFixed(3)}
              label="Min NDVI"
              color="var(--text-muted)"
            />
            <StatTile
              value={ndviData.max_ndvi.toFixed(3)}
              label="Max NDVI"
              color="#7ee787"
            />
          </StatStrip>

          {/* Vegetation breakdown bars */}
          <div style={{ marginBottom: '24px' }}>
            <SectionTitle>Land Cover Breakdown</SectionTitle>
            {(Object.keys(CLASS_LABELS) as Array<keyof typeof CLASS_LABELS>).map(key => (
              <BreakdownBar
                key={key}
                label={CLASS_LABELS[key]}
                pct={(ndviData.breakdown as any)[key] ?? 0}
                color={CLASS_COLORS[key]}
              />
            ))}
          </div>

          {/* Satellite scene info */}
          <div style={{ marginBottom: '20px' }}>
            <SectionTitle>Satellite Scene Used</SectionTitle>
            <div style={{
              padding: '14px 16px', borderRadius: '12px',
              background: 'var(--surface2)', border: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column', gap: '8px',
            }}>
              {[
                { label: 'Platform',     value: ndviData.scene.platform },
                { label: 'Scene Date',   value: ndviData.scene.scene_date },
                { label: 'Cloud Cover',  value: `${ndviData.scene.cloud_cover.toFixed(1)}%` },
                { label: 'Scene ID',     value: ndviData.scene.scene_id.slice(0, 30) + '...' },
              ].map(({ label, value }) => (
                <div key={label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{label}</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* NDVI scale legend */}
          <div style={{ marginBottom: '8px' }}>
            <SectionTitle>NDVI Scale Reference</SectionTitle>
            <div style={{
              height: '12px', borderRadius: '6px',
              background: 'linear-gradient(to right, #8B4513, #D2B48C, #FFFFE0, #90EE90, #006400)',
              marginBottom: '6px',
            }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              {['-1  Water', '0  Barren', '0.4  Moderate', '1  Dense'].map(t => (
                <span key={t} style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t}</span>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
