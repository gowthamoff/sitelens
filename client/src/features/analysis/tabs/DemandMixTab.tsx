import { useState, useEffect } from 'react';
import { useAnalysis } from '../../../context/AnalysisContext';
import { SectionTitle } from '../../../components/ui/Basic';
import type { DemandMixPct } from '../../../types/analysis';
import { Coffee, Loader2, Clock, Info, MapPin, X } from 'lucide-react';

/* ─── Colors & labels ──────────────────────────────────────── */
const MIX_COLORS = {
  office:      '#3b82f6',
  residential: '#22c55e',
  college:     '#f97316',
  transit:     '#818cf8',
};
const MIX_LABELS = {
  office:      'Office',
  residential: 'Residential',
  college:     'Education',
  transit:     'Transit',
};

/* ─── Info modal ───────────────────────────────────────────── */
import { createPortal } from 'react-dom';

function InfoModal({ mix, onClose }: { mix: DemandMixPct; onClose: () => void }) {
  const content = (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      {/* Backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }} />
      {/* Card */}
      <div
        style={{
          position: 'relative', zIndex: 1,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '20px', padding: '24px',
          maxWidth: '520px', width: '100%',
          maxHeight: '80vh', overflowY: 'auto',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column', gap: '20px',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>
              How Demand Mix is Calculated
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
              Based on OSM building footprints and land-use polygons within 500 m of the site.
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '4px', borderRadius: '6px', flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        {/* Percentage calculation */}
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>How percentages are calculated</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {([
              { color: '#3b82f6', label: 'Office / Commercial', formula: 'Buildings tagged office, commercial, retail + landuse commercial/retail' },
              { color: '#22c55e', label: 'Residential',         formula: 'Buildings tagged residential, apartments, house, dormitory + landuse residential' },
              { color: '#f97316', label: 'Education', formula: 'Amenities: college, university, school' },
              { color: '#818cf8', label: 'Transit',             formula: 'Each stop (bus, rail, metro) = 2 000 m² proxy for demand influence' },
            ] as const).map(z => (
              <div key={z.label} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: z.color, flexShrink: 0, marginTop: '3px' }} />
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{z.label}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.4 }}>{z.formula}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--text-muted)' }}>Formula:</strong> Zone % = (Zone area m²) ÷ (Total area m²) × 100. Polygons are clipped to the 500 m buffer before measurement.
          </div>
        </div>

        {/* Profile classification */}
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>Profile classification</div>
          {[
            { profile: 'office_dominant',      threshold: 'Office ≥ 30%',      example: 'MG Road, BKC, Connaught Place' },
            { profile: 'residential_dominant', threshold: 'Residential ≥ 30%', example: 'Madipakkam, HSR Phase 2, Malad West' },
            { profile: 'college_dominant',     threshold: 'Education ≥ 30%',   example: 'University campuses, Koramangala near IIMB' },
            { profile: 'transit_dominant',     threshold: 'Transit ≥ 20%',     example: 'Near major railway/metro stations' },
            { profile: 'mixed',                threshold: 'No zone > 30%',     example: 'Varied urban areas' },
          ].map(p => (
            <div key={p.profile} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '11px' }}>
              <span style={{ background: 'rgba(79,156,249,0.1)', color: 'var(--accent)', padding: '2px 7px', borderRadius: '5px', fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' }}>
                {p.threshold}
              </span>
              <span style={{ color: 'var(--text-dim)', lineHeight: 1.4 }}>→ {p.example}</span>
            </div>
          ))}
        </div>

        {/* Peak windows section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>How peak windows are predicted</div>
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
            Each zone unlocks time windows once it crosses a share threshold. All active windows are merged and deduplicated.
          </div>
          {PEAK_RULES.map(rule => {
            const pct = mix[rule.key];
            const active = pct >= rule.threshold;
            return (
              <div key={rule.key} style={{
                background: active ? `${rule.color}08` : 'rgba(255,255,255,0.02)',
                border: `1px solid ${active ? rule.color + '25' : 'rgba(255,255,255,0.05)'}`,
                borderRadius: '10px', padding: '10px 12px',
                opacity: active ? 1 : 0.5,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: rule.color, flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', fontWeight: 700, color: active ? 'var(--text)' : 'var(--text-dim)', flex: 1 }}>{rule.label}</span>
                  <span style={{ fontSize: '11px', color: active ? rule.color : 'var(--text-dim)', fontWeight: 700 }}>{pct}% {active ? `≥ ${rule.threshold}% ✓` : `< ${rule.threshold}% —`}</span>
                </div>
                {rule.windows.map((w, wi) => (
                  <div key={wi} style={{ display: 'flex', gap: '8px', marginBottom: '3px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: active ? rule.color : 'var(--text-dim)', fontFamily: 'monospace', flexShrink: 0, background: active ? `${rule.color}12` : 'transparent', padding: '1px 5px', borderRadius: '4px' }}>{w.time}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-dim)', lineHeight: 1.4 }}>{w.reason}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

/* ─── Donut chart ──────────────────────────────────────────── */
function DemandDonut({ mix, onInfoClick }: { mix: DemandMixPct; onInfoClick?: () => void }) {
  const keys = ['office', 'residential', 'college', 'transit'] as const;
  const R = 44, cx = 56, cy = 56, stroke = 12;
  const circ = 2 * Math.PI * R;
  let offset = 0;
  const segments = keys.map(k => {
    const pct = mix[k] / 100;
    const seg = { key: k, pct, offset, len: circ * pct };
    offset += circ * pct;
    return seg;
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
      <svg width="112" height="112" viewBox="0 0 112 112" style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
        {segments.map(s => s.pct > 0 && (
          <circle
            key={s.key}
            cx={cx} cy={cy} r={R} fill="none"
            stroke={MIX_COLORS[s.key]}
            strokeWidth={stroke}
            strokeDasharray={`${s.len} ${circ - s.len}`}
            strokeDashoffset={circ / 4 - s.offset}
            style={{ transition: 'stroke-dasharray 0.8s ease' }}
          />
        ))}
        <text x={cx} y={cy - 5} textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--text-dim)">MIX</text>
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize="8" fill="var(--text-dim)">500m zone</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '120px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '2px' }}>
          <span style={{ fontSize: '10px', color: 'var(--text-dim)', flex: 1 }}>% calculated from OSM area</span>
          {onInfoClick && (
            <button onClick={onInfoClick} title="How percentages are calculated" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '2px' }}>
              <Info size={11} />
            </button>
          )}
        </div>
        {keys.map(k => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: MIX_COLORS[k], flexShrink: 0 }} />
            <span style={{ fontSize: '12px', color: 'var(--text)', flex: 1 }}>{MIX_LABELS[k]}</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: MIX_COLORS[k] }}>{mix[k]}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Peak logic reference ─────────────────────────────────── */
const PEAK_RULES = [
  {
    key:       'office' as const,
    color:     '#3b82f6',
    label:     'Office / Commercial',
    threshold: 25,
    windows:   [
      { time: '10:30–11:30 AM', reason: 'Office break — employees step out for chai' },
      { time: '4–5 PM',         reason: 'Afternoon break before wind-down' },
    ],
    note: 'Steady weekday demand; drops sharply on weekends.',
  },
  {
    key:       'residential' as const,
    color:     '#22c55e',
    label:     'Residential',
    threshold: 25,
    windows:   [
      { time: '6–8 AM',  reason: 'Breakfast chai — morning ritual before commute' },
      { time: '6–9 PM',  reason: 'Evening social — families and groups return home' },
    ],
    note: 'Weekend mornings also spike; loyalty is high in residential zones.',
  },
  {
    key:       'college' as const,
    color:     '#f97316',
    label:     'Education',
    threshold: 25,
    windows:   [
      { time: '1–2 PM',  reason: 'Lunch break — students leave campus together' },
      { time: '4–7 PM',  reason: 'Post-class hangout — peak group order size' },
    ],
    note: 'High footfall, price-sensitive crowd. Strong on exam-free weekdays.',
  },
  {
    key:       'transit' as const,
    color:     '#818cf8',
    label:     'Transit Nodes',
    threshold: 20,
    windows:   [
      { time: '7–10 AM', reason: 'Morning commute — grab-and-go orders dominate' },
      { time: '5–8 PM',  reason: 'Return commute — impulse chai on the way home' },
    ],
    note: 'Highest ticket velocity; low dwell time. Optimize for speed of service.',
  },
];

/* ─── Main Tab ─────────────────────────────────────────────── */
export function DemandMixTab() {
  const { sitePin, isMobile, demandMixData, demandMixLoading, demandMixError, runDemandMix } = useAnalysis();
  const [showModal, setShowModal] = useState(false);
  // No auto-fetch — demand mix is triggered by the Analyse button via runAnalysis(),
  // matching the uniform flow of every other tab.

  // No pin placed yet
  if (!sitePin) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-dim)' }}>
        <MapPin size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)' }}>No site selected</div>
        <div style={{ fontSize: '12px', marginTop: '6px', lineHeight: 1.5 }}>
          Click the map to place a site pin,<br />then this tab will analyse the 500 m demand zone.
        </div>
      </div>
    );
  }

  // Pin placed but Analyse not yet clicked
  if (!demandMixData && !demandMixLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-dim)' }}>
        <MapPin size={32} style={{ margin: '0 auto 12px', display: 'block', color: '#6366f1', opacity: 0.8 }} />
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)' }}>No site selected</div>
        <div style={{ fontSize: '12px', marginTop: '6px', lineHeight: 1.5 }}>
          Click the map to place a site pin,<br />then this tab will analyse the 500 m demand zone.
        </div>
        <div style={{
          marginTop: '16px', display: 'inline-flex', alignItems: 'center', gap: '6px',
          fontSize: '11px', color: 'var(--accent)', fontFamily: 'monospace',
          background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: '8px', padding: '6px 12px',
        }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#6366f1', flexShrink: 0, display: 'inline-block' }} />
          {sitePin.lat.toFixed(4)}, {sitePin.lng.toFixed(4)} — click Analyse ↓
        </div>
      </div>
    );
  }

  if (demandMixLoading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
      <Loader2 size={28} style={{ color: 'var(--accent)', animation: 'dmSpin 1s linear infinite' }} />
    </div>
  );

  if (demandMixError) return (
    <div style={{ background: 'rgba(255,123,114,0.08)', border: '1px solid rgba(255,123,114,0.25)', borderRadius: '10px', padding: '14px', fontSize: '12px', color: '#ff7b72' }}>
      {demandMixError}
    </div>
  );

  if (!demandMixData) return null;

  const { mix_pct, profile, peak_pattern, raw_areas_m2 } = demandMixData;
  const total = raw_areas_m2.office_m2 + raw_areas_m2.residential_m2 + raw_areas_m2.college_m2 + raw_areas_m2.transit_m2;
  const profileLabel = profile.replace('_dominant', ' dominant').replace(/_/g, ' ');

  return (
    <>
      <style>{`
        @keyframes dmFade { from { opacity:0; transform:translateY(-4px) } to { opacity:1; transform:translateY(0) } }
        @keyframes dmSpin { to { transform: rotate(360deg); } }
      `}</style>

      {/* ── Mix card ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(79,156,249,0.08), rgba(129,140,248,0.06))',
        border: '1px solid rgba(79,156,249,0.2)', borderRadius: '18px',
        padding: isMobile ? '16px' : '20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Coffee size={16} color="var(--accent)" />
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', textTransform: 'capitalize' }}>
            {profileLabel}
          </span>
          <button onClick={() => setShowModal(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '2px 4px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}>
            <Info size={13} />
          </button>
          <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginLeft: 'auto' }}>
            {total > 0 ? `${Math.round(total / 1000)} k m²` : 'No data'}
          </span>
        </div>
        {total > 0 ? <DemandDonut mix={mix_pct} onInfoClick={() => setShowModal(true)} /> : (
          <div style={{ fontSize: '12px', color: 'var(--text-dim)', textAlign: 'center', padding: '16px 0' }}>
            No OSM building / land-use data in this radius.<br />
            <span style={{ fontSize: '11px' }}>Known gap — not a code issue.</span>
          </div>
        )}
      </div>

      {/* ── Peak Trading Windows ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{ flex: 1 }}>
            <SectionTitle><Clock size={12} /> Peak Trading Windows</SectionTitle>
          </div>
          <button onClick={() => setShowModal(true)} title="How peak windows are calculated" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '4px', borderRadius: '6px', display: 'flex', alignItems: 'center' }}>
            <Info size={13} />
          </button>
        </div>

        {/* Active peak list */}
        <div style={{
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: '14px', overflow: 'hidden',
        }}>
          {peak_pattern.map((p, i) => {
            const rule = PEAK_RULES.find(r => r.windows.some(w => p.startsWith(w.time)));
            const dotColor = rule?.color ?? '#f97316';
            return (
              <div key={i} style={{
                padding: '12px 16px',
                borderBottom: i < peak_pattern.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                display: 'flex', alignItems: 'center', gap: '10px',
              }}>
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                  background: dotColor, boxShadow: `0 0 6px ${dotColor}60`,
                }} />
                <span style={{ fontSize: '13px', color: 'var(--text)', flex: 1 }}>{p}</span>
                {rule && (
                  <span style={{
                    fontSize: '10px', fontWeight: 600,
                    color: rule.color, background: `${rule.color}12`,
                    padding: '2px 7px', borderRadius: '5px', flexShrink: 0,
                  }}>
                    {rule.label.split(' ')[0]}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Area breakdown ── */}
      {total > 0 && (
        <div style={{
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: '12px', padding: '14px 16px',
        }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '10px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            Area Breakdown (500 m radius)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {([
              ['office',      'Office/Commercial'] as const,
              ['residential', 'Residential']       as const,
              ['college',     'Education']          as const,
              ['transit',     'Transit nodes']      as const,
            ]).map(([k, label]) => (
              <div key={k} style={{
                background: MIX_COLORS[k] + '10',
                border: `1px solid ${MIX_COLORS[k]}25`,
                borderRadius: '8px', padding: '8px 10px',
              }}>
                <div style={{ fontSize: '10px', color: MIX_COLORS[k], fontWeight: 700, marginBottom: '2px' }}>{label}</div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)' }}>
                  {k === 'transit'
                    ? `${(raw_areas_m2.transit_m2 / 2000) | 0} stops`
                    : `${Math.round((raw_areas_m2 as any)[`${k}_m2`] / 1000)} k m²`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showModal && <InfoModal mix={mix_pct} onClose={() => setShowModal(false)} />}
    </>
  );
}
