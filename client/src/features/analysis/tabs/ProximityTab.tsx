import type { ElementType } from 'react';
import { useState } from 'react';
import { useAnalysis } from '../../../context/AnalysisContext';
import { SectionTitle } from '../../../components/ui/Basic';
import { fmtDist } from '../../../utils/formatters';
import {
  Stethoscope, GraduationCap, ShoppingCart, Utensils,
  Landmark, TreePine, Pill as PillIcon, ShieldAlert,
  MapPin, ChevronDown, ChevronUp, Clock, TrendingUp
} from 'lucide-react';

/* ─── Icons ────────────────────────────────────────────── */
const ICONS: Record<string, ElementType> = {
  "Hospital / Clinic":  Stethoscope,
  "School / Education": GraduationCap,
  "Supermarket / Shop": ShoppingCart,
  "Restaurant / Café":  Utensils,
  "Bank / ATM":         Landmark,
  "Park / Recreation":  TreePine,
  "Pharmacy":           PillIcon,
  "Police / Fire":      ShieldAlert,
};

/* ─── Scoring ───────────────────────────────────────────── */
const WEIGHTS: Record<string, number> = {
  "Hospital / Clinic":  2.0,
  "School / Education": 1.5,
  "Supermarket / Shop": 1.5,
  "Restaurant / Café":  0.8,
  "Bank / ATM":         1.0,
  "Park / Recreation":  1.2,
  "Pharmacy":           1.3,
  "Police / Fire":      1.5,
};

function distScore(m: number, count: number): number {
  if (count === 0) return 0;
  if (m <= 200)  return 100;
  if (m <= 500)  return 85;
  if (m <= 1000) return 65;
  if (m <= 2000) return 45;
  if (m <= 5000) return 20;
  return 5;
}

function accessibilityScore(items: { category: string; count: number; nearest_m: number }[]): number {
  if (!items.length) return 0;
  let ws = 0, wt = 0;
  for (const item of items) {
    const w = WEIGHTS[item.category] ?? 1;
    ws += distScore(item.nearest_m, item.count) * w;
    wt += w;
  }
  return Math.round(ws / wt);
}

function getGrade(score: number) {
  if (score >= 90) return { grade: 'A+', label: 'Exceptional',    color: '#7ee787' };
  if (score >= 80) return { grade: 'A',  label: 'Excellent',      color: '#7ee787' };
  if (score >= 70) return { grade: 'B+', label: 'Very Good',      color: '#a8e6a3' };
  if (score >= 60) return { grade: 'B',  label: 'Good',           color: '#ffa657' };
  if (score >= 50) return { grade: 'C+', label: 'Fair',           color: '#ffa657' };
  if (score >= 40) return { grade: 'C',  label: 'Below Average',  color: '#ff9966' };
  return            { grade: 'D',  label: 'Poor',           color: '#ff7b72' };
}

function walkTime(m: number): string {
  if (m <= 80)   return '<1 min';
  const mins = Math.round(m / 80);
  if (mins <= 20) return `~${mins} min walk`;
  return `~${Math.round(m / 400)} min drive`;
}

function distLabel(m: number, count: number): { text: string; color: string } {
  if (count === 0) return { text: 'None found',     color: '#ff7b72' };
  if (m <= 400)    return { text: 'Walking distance', color: '#7ee787' };
  if (m <= 1200)   return { text: 'Nearby',           color: '#a8e6a3' };
  if (m <= 3000)   return { text: 'Moderate distance', color: '#ffa657' };
  return                   { text: 'Far',             color: '#ff7b72' };
}

function walkBucket(m: number): 'close' | 'moderate' | 'far' {
  if (m <= 400)  return 'close';
  if (m <= 1200) return 'moderate';
  return 'far';
}

/* ─── Component ─────────────────────────────────────────── */
export function ProximityTab() {
  const { analysisData } = useAnalysis();
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (!analysisData) return null;

  const d          = analysisData.proximity ?? [];
  const neighbours = analysisData.neighbours ?? [];
  const score      = accessibilityScore(d);
  const grade      = getGrade(score);

  // Group neighbours by walk bucket
  const close    = d.filter(i => i.count > 0 && walkBucket(i.nearest_m) === 'close');
  const moderate = d.filter(i => i.count > 0 && walkBucket(i.nearest_m) === 'moderate');
  const far      = d.filter(i => i.count > 0 && walkBucket(i.nearest_m) === 'far');
  const missing  = d.filter(i => i.count === 0);

  return (
    <>
      {/* ── Accessibility Score Card ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(79,156,249,0.08), rgba(126,231,135,0.06))',
        border: '1px solid rgba(79,156,249,0.2)',
        borderRadius: '16px',
        padding: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
      }}>
        {/* Score circle */}
        <div style={{ position: 'relative', width: '80px', height: '80px', flexShrink: 0 }}>
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
            <circle
              cx="40" cy="40" r="34" fill="none"
              stroke={grade.color} strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 34}`}
              strokeDashoffset={`${2 * Math.PI * 34 * (1 - score / 100)}`}
              transform="rotate(-90 40 40)"
              style={{ transition: 'stroke-dashoffset 1s ease' }}
            />
          </svg>
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: '20px', fontWeight: 800, color: grade.color, lineHeight: 1 }}>{score}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '1px' }}>/ 100</span>
          </div>
        </div>

        {/* Grade + label */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '28px', fontWeight: 900, color: grade.color, lineHeight: 1 }}>
              {grade.grade}
            </span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: grade.color }}>
              {grade.label}
            </span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.5 }}>
            Accessibility score based on proximity<br />to {d.length} essential categories
          </p>
          {/* Score bar */}
          <div style={{ marginTop: '10px', height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px' }}>
            <div style={{
              width: `${score}%`, height: '100%', background: grade.color,
              borderRadius: '3px', transition: 'width 1.2s ease'
            }} />
          </div>
        </div>
      </div>

      {/* ── Walk-time Breakdown ── */}
      <div>
        <SectionTitle>Walkability Breakdown</SectionTitle>
        <div style={{
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: '14px', overflow: 'hidden',
        }}>
          {/* Proportional bar */}
          {(() => {
            const total = close.length + moderate.length + (far.length + missing.length) || 1;
            const pClose    = (close.length / total) * 100;
            const pModerate = (moderate.length / total) * 100;
            const pFar      = ((far.length + missing.length) / total) * 100;
            return (
              <div style={{ height: '6px', display: 'flex', overflow: 'hidden' }}>
                <div style={{ width: `${pClose}%`, background: '#7ee787', transition: 'width 0.8s ease' }} />
                <div style={{ width: `${pModerate}%`, background: '#ffa657', transition: 'width 0.8s ease' }} />
                <div style={{ width: `${pFar}%`, background: '#ff7b72', transition: 'width 0.8s ease' }} />
              </div>
            );
          })()}

          {/* 3 columns */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
            {[
              { label: 'Walking',     sub: '< 5 min',    items: close,                   color: '#7ee787' },
              { label: 'Short Walk',  sub: '5–15 min',   items: moderate,                color: '#ffa657' },
              { label: 'Drive / Far', sub: '> 15 min',   items: far.concat(missing),     color: '#ff7b72' },
            ].map((b, i) => (
              <div key={b.label} style={{
                padding: '14px 0',
                textAlign: 'center',
                borderRight: i < 2 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{ fontSize: '22px', fontWeight: 800, color: b.color, lineHeight: 1 }}>
                  {b.items.length}
                </div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginTop: '5px' }}>
                  {b.label}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '2px' }}>
                  {b.sub}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Category Detail ── */}
      <div>
        <SectionTitle>Category Summary</SectionTitle>
        <div style={{
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: '12px', overflow: 'hidden',
        }}>
          {d.map((item, i) => {
            const Icon     = ICONS[item.category] || MapPin;
            const label    = distLabel(item.nearest_m, item.count);
            const pct      = item.count === 0 ? 0 : Math.min(item.nearest_m, 5000) / 5000;
            const barWidth = `${(1 - pct) * 100}%`; // invert: close = full bar
            const isOpen   = expandedIdx === i;

            // Named POIs for this category (rough match by amenity/shop type)
            const relatedPOIs = neighbours
              .filter(n => {
                const t = (n.amenity || n.shop || n.leisure || n.tourism || '').toLowerCase();
                const cat = item.category.toLowerCase();
                if (cat.includes('hospital') && (t.includes('hospital') || t.includes('clinic') || t.includes('doctor'))) return true;
                if (cat.includes('school')   && (t.includes('school') || t.includes('university') || t.includes('college'))) return true;
                if (cat.includes('supermarket') && (t.includes('supermarket') || t.includes('shop') || t.includes('convenience'))) return true;
                if (cat.includes('restaurant') && (t.includes('restaurant') || t.includes('cafe') || t.includes('fast_food'))) return true;
                if (cat.includes('bank')     && (t.includes('bank') || t.includes('atm'))) return true;
                if (cat.includes('park')     && (t.includes('park') || t.includes('garden') || t.includes('recreation'))) return true;
                if (cat.includes('pharmacy') && t.includes('pharmacy')) return true;
                if (cat.includes('police')   && (t.includes('police') || t.includes('fire'))) return true;
                return false;
              })
              .slice(0, 4);

            return (
              <div key={i} style={{ borderBottom: i < d.length - 1 ? '1px solid var(--border)' : 'none' }}>
                {/* Main row */}
                <button
                  onClick={() => setExpandedIdx(isOpen ? null : i)}
                  style={{
                    width: '100%', background: 'none', border: 'none',
                    cursor: 'pointer', padding: '12px 14px', textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
                      background: item.count === 0 ? 'rgba(255,123,114,0.1)' : 'rgba(79,156,249,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: item.count === 0 ? '#ff7b72' : 'var(--accent)',
                    }}>
                      <Icon size={16} strokeWidth={2} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                          {item.category}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                            {item.count > 0 ? fmtDist(item.nearest_m) : '—'}
                          </span>
                          {isOpen ? <ChevronUp size={12} color="var(--text-dim)" /> : <ChevronDown size={12} color="var(--text-dim)" />}
                        </div>
                      </div>

                      {/* Distance bar + meta */}
                      <div style={{ marginTop: '6px' }}>
                        <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', marginBottom: '5px' }}>
                          <div style={{
                            width: item.count > 0 ? barWidth : '0%',
                            height: '100%', borderRadius: '2px',
                            background: label.color,
                            transition: 'width 0.8s ease',
                          }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', color: label.color, fontWeight: 600 }}>
                            {label.text}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {item.count > 0 && (
                              <span style={{ fontSize: '10px', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <Clock size={9} /> {walkTime(item.nearest_m)}
                              </span>
                            )}
                            <span style={{
                              fontSize: '10px', padding: '1px 6px', borderRadius: '4px', fontWeight: 600,
                              background: item.count >= 5 ? 'rgba(126,231,135,0.12)' : item.count >= 1 ? 'rgba(79,156,249,0.12)' : 'rgba(255,123,114,0.12)',
                              color:      item.count >= 5 ? '#7ee787'               : item.count >= 1 ? 'var(--accent)'            : '#ff7b72',
                            }}>
                              {item.count} found
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>

                {/* Expanded: nearby POIs for this category */}
                {isOpen && (
                  <div style={{
                    padding: '0 14px 12px 56px',
                    animation: 'fadeIn 0.2s ease',
                  }}>
                    <style>{`@keyframes fadeIn { from { opacity:0;transform:translateY(-4px) } to { opacity:1;transform:translateY(0) } }`}</style>
                    {relatedPOIs.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {relatedPOIs.map((poi, j) => (
                          <div key={j} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            fontSize: '12px', padding: '4px 0',
                            borderBottom: j < relatedPOIs.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                          }}>
                            <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
                              {poi.name || `(${poi.amenity || poi.shop || 'unnamed'})`}
                            </span>
                            <span style={{ color: 'var(--text-dim)', whiteSpace: 'nowrap', fontSize: '11px' }}>
                              {fmtDist(poi.distance_m)} · {walkTime(poi.distance_m)}
                            </span>
                          </div>
                        ))}
                        {item.count > relatedPOIs.length && (
                          <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>
                            +{item.count - relatedPOIs.length} more in radius
                          </span>
                        )}
                      </div>
                    ) : (
                      <p style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                        {item.count > 0
                          ? `${item.count} found — tap category on map to explore`
                          : 'None found within the selected radius'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Nearest Named POIs ── */}
      {neighbours.length > 0 && (
        <div>
          <SectionTitle>
            <TrendingUp size={12} />
            Nearest POIs
          </SectionTitle>
          <div style={{
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: '12px', overflow: 'hidden',
          }}>
            {neighbours.slice(0, 8).map((n, i) => {
              const type = n.amenity || n.shop || n.leisure || n.tourism || 'POI';
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', fontSize: '13px',
                  borderBottom: i < Math.min(neighbours.length, 8) - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                    <MapPin size={12} color="var(--text-dim)" style={{ flexShrink: 0 }} />
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {n.name || `(${type})`}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '1px', textTransform: 'capitalize' }}>
                        {type.replace(/_/g, ' ')}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, marginLeft: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent)' }}>
                      {fmtDist(n.distance_m)}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '3px', marginTop: '1px' }}>
                      <Clock size={9} /> {walkTime(n.distance_m)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
