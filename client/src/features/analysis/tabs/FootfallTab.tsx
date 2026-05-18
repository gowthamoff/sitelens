import { useState } from 'react';
import { useAnalysis } from '../../../context/AnalysisContext';
import { SectionTitle } from '../../../components/ui/Basic';
import { fmtDist } from '../../../utils/formatters';
import type { FootfallCategoryItem } from '../../../types/analysis';
import {
  Bus, GraduationCap, ShoppingBag, Landmark, Stethoscope,
  Building2, Utensils, Trees, ChevronDown, ChevronUp,
  MapPin, Zap, TrendingUp, Info, Navigation,
} from 'lucide-react';

/* ─── Icon Map ───────────────────────────────────────────── */
const ICONS: Record<string, React.ElementType> = {
  transit:     Bus,
  education:   GraduationCap,
  shopping:    ShoppingBag,
  worship:     Landmark,
  healthcare:  Stethoscope,
  banking:     Landmark,
  government:  Building2,
  food_drink:  Utensils,
  recreation:  Trees,
};

/* ─── Patience Tier Badge ────────────────────────────────── */
function PatienceBadge({ tier, label, color }: { tier: string; label: string; color: string }) {
  const bgColor = color + '18';
  return (
    <span style={{
      fontSize: '10px', fontWeight: 700, padding: '2px 7px',
      borderRadius: '6px', background: bgColor, color,
      letterSpacing: '0.3px', whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {tier === 'peak' && '⚡ '}{label}
    </span>
  );
}

/* ─── Decay Ring Visual ─────────────────────────────────── */
function DecayRing({ nearest, ideal, max }: { nearest: number | null; ideal: number; max: number }) {
  if (nearest === null) return null;
  const pct = nearest <= ideal ? 1.0
    : nearest >= max ? 0.0
    : 1.0 - Math.pow((nearest - ideal) / (max - ideal), 2);
  const radius = 14;
  const circ = 2 * Math.PI * radius;
  const color = pct >= 0.8 ? '#7ee787' : pct >= 0.5 ? '#ffa657' : '#ff7b72';
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" style={{ flexShrink: 0 }}>
      <circle cx="18" cy="18" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
      <circle
        cx="18" cy="18" r={radius} fill="none"
        stroke={color} strokeWidth="4" strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - pct)}
        transform="rotate(-90 18 18)"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
      <text x="18" y="22" textAnchor="middle" fontSize="9" fontWeight="700" fill={color}>
        {Math.round(pct * 100)}%
      </text>
    </svg>
  );
}

/* ─── Category Row ─────────────────────────────────────── */
function CategoryRow({ item, index, isLast, isMobile }: {
  item: FootfallCategoryItem; index: number; isLast: boolean; isMobile: boolean;
}) {
  const { selectedPoi, setSelectedPoi } = useAnalysis();
  const [expanded, setExpanded] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const Icon = ICONS[item.key] || MapPin;
  const barPct = (item.score / item.maxPoints) * 100;
  const barColor = item.patienceStatus.color;

  return (
    <div style={{ borderBottom: isLast ? 'none' : '1px solid var(--border)' }}>
      <div style={{ position: 'relative', width: '100%' }}>
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            width: '100%', background: 'none', border: 'none', cursor: 'pointer',
            padding: isMobile ? '12px 12px' : '13px 16px', textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Decay ring */}
            <DecayRing nearest={item.nearest_m} ideal={item.idealDistance} max={item.maxDistance} />

            {/* Icon badge */}
            <div style={{
              width: '32px', height: '32px', borderRadius: '9px', flexShrink: 0,
              background: item.count === 0 ? 'rgba(255,123,114,0.1)' : 'rgba(79,156,249,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: item.count === 0 ? '#ff7b72' : 'var(--accent)',
            }}>
              <Icon size={15} strokeWidth={2} />
            </div>

            {/* Text */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.label}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <PatienceBadge tier={item.patienceStatus.tier} label={item.patienceStatus.label} color={item.patienceStatus.color} />
                  
                  {/* Info Icon with stopPropagation to avoid expanding the row */}
                  <div 
                    onMouseEnter={() => setShowInfo(true)}
                    onMouseLeave={() => setShowInfo(false)}
                    onClick={(e) => { e.stopPropagation(); setShowInfo(!showInfo); }}
                    style={{ color: 'var(--text-dim)', cursor: 'help', padding: '4px', borderRadius: '4px', background: showInfo ? 'var(--surface2)' : 'transparent', transition: 'all 0.2s' }}
                  >
                    <Info size={14} />
                  </div>

                  {expanded ? <ChevronUp size={12} color="var(--text-dim)" /> : <ChevronDown size={12} color="var(--text-dim)" />}
                </div>
              </div>

              {/* Score bar + meta */}
              <div style={{ marginTop: '6px' }}>
                <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', marginBottom: '5px' }}>
                  <div style={{
                    width: `${barPct}%`, height: '100%', borderRadius: '2px',
                    background: barColor, transition: 'width 0.9s ease',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                    {item.count > 0 ? `${item.count} found · nearest ${fmtDist(item.nearest_m!)}` : 'None found in range'}
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: barColor }}>
                    {item.score.toFixed(1)} / {item.maxPoints}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </button>

        {/* Info Tooltip Popup */}
        {showInfo && (
          <div style={{
            position: 'absolute', top: '10px', right: '40px', width: '280px', zIndex: 100,
            background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px',
            boxShadow: 'var(--shadow)', padding: '12px', animation: 'ffFadeIn 0.2s ease',
            pointerEvents: 'none',
          }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <div style={{ width: '20px', height: '20px', borderRadius: '5px', background: 'rgba(79,156,249,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Info size={12} color="var(--accent)" />
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                {item.why}
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '6px' }}>
              {[
                { label: 'Peak', dist: `≤${item.idealDistance}m`, color: '#7ee787' },
                { label: 'Good', dist: `≤${Math.round((item.idealDistance + item.maxDistance) / 2)}m`, color: '#ffa657' },
                { label: 'Max', dist: `${item.maxDistance}m`, color: '#ff7b72' },
              ].map(z => (
                <div key={z.label} style={{ flex: 1, background: `${z.color}08`, borderRadius: '6px', padding: '6px', textAlign: 'center', border: `1px solid ${z.color}15` }}>
                  <div style={{ fontSize: '9px', fontWeight: 700, color: z.color, textTransform: 'uppercase' }}>{z.label}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '2px', fontWeight: 600 }}>{z.dist}</div>
                </div>
              ))}
            </div>
            {/* Arrow */}
            <div style={{ position: 'absolute', top: '10px', right: '-6px', width: '12px', height: '12px', background: 'var(--bg)', borderRight: '1px solid var(--border)', borderTop: '1px solid var(--border)', transform: 'rotate(45deg)' }} />
          </div>
        )}
      </div>

      {/* Expanded Detail (Only POIs) */}
      {expanded && (
        <div style={{ padding: '0 16px 14px 74px', animation: 'ffFadeIn 0.2s ease' }}>
          {/* Top POIs */}
          {item.topPois.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {item.topPois.map((poi, j) => (
                <div 
                  key={j} 
                  onClick={() => {
                    setSelectedPoi(poi);
                    // On mobile, scroll up to map when a POI is clicked
                    if (isMobile) window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    fontSize: '12px', padding: '6px 8px', borderRadius: '6px', cursor: 'pointer',
                    background: selectedPoi === poi ? 'rgba(79,156,249,0.15)' : 'transparent',
                    borderBottom: j < item.topPois.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    transition: 'all 0.2s',
                  }}
                  className="poi-item-hover"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                    <div style={{
                      width: '20px', height: '20px', borderRadius: '50%',
                      background: selectedPoi === poi ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, transition: 'all 0.2s',
                    }} className="poi-nav-btn">
                      <Navigation 
                        size={8} 
                        style={{ 
                          color: selectedPoi === poi ? 'white' : 'var(--text-dim)',
                          transform: 'rotate(45deg)',
                        }} 
                      />
                    </div>
                    <span style={{ color: selectedPoi === poi ? 'var(--accent)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: selectedPoi === poi ? 700 : 400 }}>
                      {poi.name || '(unnamed)'}
                    </span>
                  </div>
                  <span style={{ color: 'var(--text-dim)', fontSize: '11px', whiteSpace: 'nowrap' }}>
                    {fmtDist(poi.distance_m)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: '11px', color: 'var(--text-dim)', margin: 0 }}>
              None found within {item.maxDistance}m
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── (Demand Mix moved to DemandMixTab.tsx) ─────────────────── */

/* ─── Main Component ─────────────────────────────────────── */
export function FootfallTab() {
  const { analysisData, isMobile } = useAnalysis();

  if (!analysisData?.footfall) return null;
  const f = analysisData.footfall;

  return (
    <>
      <style>{`
        @keyframes ffFadeIn { from { opacity:0; transform:translateY(-4px) } to { opacity:1; transform:translateY(0) } }
        @keyframes ffScoreIn { from { stroke-dashoffset: 100%; } }
      `}</style>

      {/* ── Standard footfall content ── */}
      <>

      {/* ── Hero Score Card ── */}
      <div style={{
        background: `linear-gradient(135deg, ${f.grade_color}10, rgba(79,156,249,0.06))`,
        border: `1px solid ${f.grade_color}30`,
        borderRadius: '18px',
        padding: isMobile ? '16px' : '22px',
        display: 'flex',
        alignItems: 'center',
        gap: '18px',
      }}>
        {/* Score circle */}
        <div style={{ position: 'relative', width: '88px', height: '88px', flexShrink: 0 }}>
          <svg width="88" height="88" viewBox="0 0 88 88">
            <circle cx="44" cy="44" r="38" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
            <circle
              cx="44" cy="44" r="38" fill="none"
              stroke={f.grade_color} strokeWidth="7" strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 38}`}
              strokeDashoffset={`${2 * Math.PI * 38 * (1 - f.total_score / 100)}`}
              transform="rotate(-90 44 44)"
              style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)' }}
            />
          </svg>
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: '22px', fontWeight: 900, color: f.grade_color, lineHeight: 1 }}>{f.total_score}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>/ 100</span>
          </div>
        </div>

        {/* Grade + label */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '30px', fontWeight: 900, color: f.grade_color, lineHeight: 1 }}>{f.grade}</span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: f.grade_color }}>{f.grade_label}</span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.5 }}>
            Commercial footfall density score<br />based on {f.breakdown.length} India-specific categories
          </p>
          {/* Score bar */}
          <div style={{ marginTop: '10px', height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px' }}>
            <div style={{
              width: `${f.total_score}%`, height: '100%', background: f.grade_color,
              borderRadius: '3px', transition: 'width 1.3s ease',
            }} />
          </div>
        </div>
      </div>

      {/* ── Top Footfall Drivers ── */}
      {f.top_drivers.length > 0 && (
        <div>
          <SectionTitle><TrendingUp size={12} /> Top Footfall Drivers</SectionTitle>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
            gap: '8px',
          }}>
            {f.top_drivers.map((d, i) => {
              const Icon = ICONS[d.key] || Zap;
              const pct = (d.score / d.maxPoints) * 100;
              return (
                <div key={d.key} style={{
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: '12px', padding: '12px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <div style={{
                      width: '24px', height: '24px', borderRadius: '7px',
                      background: 'rgba(79,156,249,0.12)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon size={12} color="var(--accent)" />
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.label}
                    </span>
                    {i === 0 && <span style={{ fontSize: '10px', marginLeft: 'auto', color: '#ffa657' }}>#{i + 1}</span>}
                  </div>
                  {/* Mini score bar */}
                  <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: '2px', transition: 'width 1s ease' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>Score</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)' }}>{d.score.toFixed(1)} / {d.maxPoints}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Category Breakdown ── */}
      <div>
        <SectionTitle>Category Breakdown</SectionTitle>
        <div style={{
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: '14px', overflow: 'hidden',
        }}>
          {f.breakdown.map((item, i) => (
            <CategoryRow
              key={item.key}
              item={item}
              index={i}
              isLast={i === f.breakdown.length - 1}
              isMobile={isMobile}
            />
          ))}
        </div>
      </div>

      {/* ── Patience Legend ── */}
      <div style={{
        background: 'var(--surface2)', border: '1px solid var(--border)',
        borderRadius: '12px', padding: '14px 16px',
      }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '10px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
          How to Read the Score
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {[
            { color: '#7ee787', label: '⚡ Peak Zone', desc: 'Within ideal walking distance. Full score contribution.' },
            { color: '#ffa657', label: 'Accessible', desc: 'Within acceptable range. Partial score with decay.' },
            { color: '#ff7b72', label: 'Too Far', desc: 'Beyond max useful distance. Zero contribution to score.' },
          ].map(h => (
            <div key={h.label} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: h.color, padding: '2px 6px', background: h.color + '18', borderRadius: '5px', flexShrink: 0, marginTop: '1px' }}>
                {h.label}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.5 }}>{h.desc}</span>
            </div>
          ))}
        </div>
      </div>
      </>
    </>
  );
}
