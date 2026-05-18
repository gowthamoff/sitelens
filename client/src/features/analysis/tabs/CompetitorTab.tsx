import { useState, useCallback, useEffect } from 'react';
import { useAnalysis } from '../../../context/AnalysisContext';
import { SectionTitle, Card, CardRow } from '../../../components/ui/Basic';
import { fmtDist } from '../../../utils/formatters';
import { API_BASE } from '../../../config/constants';
import type { CompetitorItem, CompetitorGap, HeadToHeadContext } from '../../../types/analysis';
import {
  Swords, MapPin, AlertTriangle, TrendingUp, Zap, Navigation,
  ChevronDown, ChevronUp, X, ShieldAlert, Search, Loader2, Shield, Lightbulb, Info,
} from 'lucide-react';

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const BUSINESS_TYPES = [
  { value: 'restaurant', label: '🍽 Restaurant' },
  { value: 'pharmacy', label: '💊 Pharmacy' },
  { value: 'grocery', label: '🛒 Grocery' },
  { value: 'clinic', label: '🏥 Clinic' },
  { value: 'fitness', label: '💪 Fitness' },
  { value: 'bank', label: '🏦 Bank' },
  { value: 'hotel', label: '🏨 Hotel' },
  { value: 'education', label: '🎓 Education' },
  { value: 'tea', label: '☕ Tea / Cafe' },
];

const ROAD_COLORS: Record<string, string> = {
  'National Highway': '#ff7b72',
  'State Highway': '#ffa657',
  'District Road': '#e3b341',
  'Local Road': '#7ee787',
  'Residential Street': 'var(--text-dim)',
  'Service Lane': 'var(--text-dim)',
};

const STRATEGIC_COLOR = '#818cf8'; // Indigo for "Strategic Moat"
const STRATEGIC_BG = 'rgba(129, 140, 248, 0.08)';

/* ─── Sub-components ─────────────────────────────────────────────────────────── */

function StatBox({ num, label, color }: { num: number | string; label: string; color?: string }) {
  return (
    <div style={{
      flex: 1, textAlign: 'center', padding: '10px 6px',
      background: 'var(--surface2)', borderRadius: '10px', border: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: '18px', fontWeight: 900, color: color || 'var(--text)', lineHeight: 1 }}>{num}</div>
      <div style={{ fontSize: '9px', color: 'var(--text-dim)', marginTop: '3px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
    </div>
  );
}

function CompetitorRow({
  item, isSelected, isMobile, onSelect, onNavigate,
}: {
  item: CompetitorItem; isSelected: boolean; isMobile: boolean;
  onSelect: () => void; onNavigate: () => void;
}) {
  const roadColor = ROAD_COLORS[item.road_label] || 'var(--text-dim)';
  const subLabel = item.sub_type || '';

  return (
    <div
      onClick={onSelect}
      style={{
        padding: '10px 12px',
        borderRadius: '10px',
        cursor: 'pointer',
        border: `1px solid ${isSelected ? 'rgba(79,156,249,0.4)' : item.has_barrier ? 'rgba(129,140,248,0.2)' : 'var(--border)'}`,
        background: isSelected ? 'rgba(79,156,249,0.08)' : item.has_barrier ? 'rgba(129,140,248,0.04)' : 'var(--surface2)',
        transition: 'all 0.18s',
        borderLeft: item.has_barrier ? `3px solid ${STRATEGIC_COLOR}` : `3px solid ${isSelected ? 'var(--accent)' : 'transparent'}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Navigate button */}
        <div
          onClick={(e) => { e.stopPropagation(); onNavigate(); }}
          title="Show on map"
          style={{
            width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
            background: isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.2s',
          }}
        >
          <Navigation size={10} style={{ color: isSelected ? '#fff' : 'var(--text-dim)', transform: 'rotate(45deg)' }} />
        </div>

        {/* Name + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{
              fontSize: '13px', fontWeight: isSelected ? 700 : 500,
              color: isSelected ? 'var(--accent)' : 'var(--text)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%',
            }}>
              {item.has_barrier && <Shield size={12} style={{ color: STRATEGIC_COLOR, marginRight: '4px', verticalAlign: 'middle' }} />}
              {item.name}
            </span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffa657', flexShrink: 0 }}>
              {fmtDist(item.distance_m)}
            </span>
          </div>

          {/* Sub-label row: type, road, rating, open status */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
            {subLabel && (
              <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'capitalize' }}>{subLabel}</span>
            )}
            {item.road_label && (
              <span style={{ fontSize: '10px', fontWeight: 600, color: roadColor }}>· {item.road_label}</span>
            )}

            {/* ⭐ Google Rating */}
            {item.rating != null && (
              <span style={{
                fontSize: '10px', fontWeight: 700,
                color: item.rating >= 4.0 ? '#7ee787' : item.rating >= 3.0 ? '#ffa657' : '#ff7b72',
                display: 'flex', alignItems: 'center', gap: '2px',
              }}>
                ★ {item.rating.toFixed(1)}
                {item.review_count != null && (
                  <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>({item.review_count.toLocaleString()})</span>
                )}
              </span>
            )}

            {/* 🟢 Open Now badge */}
            {item.open_now != null && (
              <span style={{
                fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '8px',
                background: item.open_now ? 'rgba(126,231,135,0.15)' : 'rgba(255,123,114,0.12)',
                color: item.open_now ? '#7ee787' : '#ff7b72',
                border: `1px solid ${item.open_now ? 'rgba(126,231,135,0.3)' : 'rgba(255,123,114,0.2)'}`,
              }}>
                {item.open_now ? 'Open' : 'Closed'}
              </span>
            )}

            {/* 🔵 Source badge */}
            {item.source && item.source !== 'osm' && (
              <span style={{
                fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '8px',
                background: item.source === 'google' ? 'rgba(79,156,249,0.12)' : 'rgba(126,231,135,0.08)',
                color: item.source === 'google' ? '#4f9cf9' : '#7ee787',
                border: `1px solid ${item.source === 'google' ? 'rgba(79,156,249,0.25)' : 'rgba(126,231,135,0.2)'}`,
              }}>
                {item.source === 'google' ? 'G' : 'G+'}
              </span>
            )}
          </div>
        </div>
      </div>

      {item.has_barrier && isSelected && (
        <div style={{
          marginTop: '8px', padding: '6px 10px', borderRadius: '8px',
          background: STRATEGIC_BG, fontSize: '11px', color: STRATEGIC_COLOR,
          display: 'flex', gap: '8px', border: `1px solid rgba(129, 140, 248, 0.15)`
        }}>
          <Shield size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>Strategic Moat: A railway/river/highway protects your side of the catchment from this competitor.</span>
        </div>
      )}
    </div>
  );
}

function InsightCard({ insight }: { insight: { type: 'warning' | 'info' | 'opportunity', title: string, text: string } }) {
  const colors = {
    warning: '#ffa657',
    info: 'var(--accent)',
    opportunity: '#7ee787'
  };
  const icons = {
    warning: <AlertTriangle size={14} />,
    info: <Info size={14} />,
    opportunity: <Lightbulb size={14} />
  };
  const color = colors[insight.type];

  return (
    <div style={{
      padding: '10px 12px',
      borderRadius: '10px',
      background: `color-mix(in srgb, ${color} 8%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
      borderLeft: `3px solid ${color}`,
      marginBottom: '6px'
    }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {icons[insight.type]} {insight.title}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.4 }}>
        {insight.text}
      </div>
    </div>
  );
}

function GapRow({
  gap, isMobile, isSelected, onNavigate,
}: {
  gap: CompetitorGap; isMobile: boolean; isSelected: boolean; onNavigate: () => void;
}) {
  const narrative = getGapNarrative('restaurant', gap.source_type); // will be overridden per businessType

  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: '12px',
        cursor: 'pointer',
        border: `1px solid ${isSelected ? 'rgba(126,231,135,0.5)' : 'rgba(126,231,135,0.18)'}`,
        background: isSelected ? 'rgba(126,231,135,0.10)' : 'rgba(126,231,135,0.04)',
        transition: 'all 0.18s',
        borderLeft: `3px solid ${isSelected ? '#7ee787' : 'rgba(126,231,135,0.35)'}`,
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start',
      }}
    >
      {/* Category icon */}
      <div style={{
        width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
        background: isSelected ? 'rgba(126,231,135,0.2)' : 'rgba(126,231,135,0.10)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
        border: '1px solid rgba(126,231,135,0.2)',
      }}>
        {gap.source_icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontSize: '13px', fontWeight: 700,
            color: isSelected ? '#7ee787' : 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%',
          }}>
            {gap.name}
          </span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#7ee787', flexShrink: 0 }}>
            {fmtDist(gap.distance_from_site_m)}
          </span>
        </div>

        {/* Gap badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '5px' }}>
          <span style={{
            fontSize: '9px', fontWeight: 800, padding: '2px 7px', borderRadius: '10px',
            background: 'rgba(126,231,135,0.15)', color: '#7ee787',
            border: '1px solid rgba(126,231,135,0.3)',
            textTransform: 'uppercase', letterSpacing: '0.5px',
          }}>
            0 competitors nearby
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'capitalize' }}>
            {gap.source_type.replace(/_/g, ' ')}
          </span>
        </div>

        {/* Navigate button */}
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate(); }}
          style={{
            marginTop: '8px',
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: '5px 10px', borderRadius: '8px', border: 'none',
            background: isSelected ? 'rgba(126,231,135,0.18)' : 'rgba(126,231,135,0.1)',
            color: '#7ee787', fontSize: '11px', fontWeight: 700,
            cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          <Navigation size={10} style={{ transform: 'rotate(45deg)' }} />
          View on Map
          <span style={{ fontSize: '11px', marginLeft: '1px' }}>→</span>
        </button>
      </div>
    </div>
  );
}

function HeadToHeadModal({ data, competitorName, onClose }: { data: any; competitorName: string; onClose: () => void }) {
  const compCtx: HeadToHeadContext[] = data.competitor?.context || [];
  const siteCtx: HeadToHeadContext[] = data.your_site?.context || [];

  const formatRoad = (ctx: HeadToHeadContext[]) => ctx.find(c => c.context_type === 'road');
  const formatFootfall = (ctx: HeadToHeadContext[]) => ctx.filter(c => c.context_type === 'footfall');
  const formatBarriers = (ctx: HeadToHeadContext[]) => ctx.filter(c => c.context_type === 'barrier');

  // Head-to-Head Insights
  const h2hInsights = [];
  const siteFootfall = formatFootfall(siteCtx);
  const compFootfall = formatFootfall(compCtx);

  const shared = siteFootfall.filter(sf => compFootfall.some(cf => cf.name === sf.name));
  if (shared.length > 0) {
    const source = shared[0];
    const compSource = compFootfall.find(cf => cf.name === source.name);
    if (compSource) {
      const diff = source.distance_m - compSource.distance_m;
      if (diff > 50) {
        h2hInsights.push(`Shadow Alert: ${competitorName} is closer to ${source.name} (${fmtDist(compSource.distance_m)} vs ${fmtDist(source.distance_m)}). They capture walk-in traffic before it reaches your site.`);
      } else if (diff < -50) {
        h2hInsights.push(`Position Advantage: You are closer to ${source.name} than ${competitorName} (${fmtDist(source.distance_m)} vs ${fmtDist(compSource.distance_m)}). You intercept this traffic first.`);
      }
    }
  }

  function ColBlock({ ctx, title, color }: { ctx: HeadToHeadContext[]; title: string; color: string }) {
    const road = formatRoad(ctx);
    const footfall = formatFootfall(ctx);
    const barriers = formatBarriers(ctx);
    return (
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '10px', padding: '12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color, textAlign: 'center', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px', background: `${color}18`, borderRadius: '6px' }}>
          {title}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '4px', fontWeight: 700, textTransform: 'uppercase' }}>Road</div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
          {road ? road.sub_type?.replace(/_/g, ' ') || road.sub_type || 'Unknown' : 'Unknown'}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '4px', fontWeight: 700, textTransform: 'uppercase' }}>Nearby Footfall Sources</div>
        {footfall.length > 0 ? footfall.map((f, i) => (
          <div key={i} style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            {f.name} <span style={{ color: 'var(--text-dim)' }}>· {fmtDist(f.distance_m)}</span>
          </div>
        )) : <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontStyle: 'italic' }}>None in 600m</div>}
        {barriers.length > 0 && (
          <>
            <div style={{ fontSize: '10px', color: STRATEGIC_COLOR, marginTop: '10px', marginBottom: '4px', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Shield size={10} /> Strategic Moats
            </div>
            {barriers.map((b, i) => (
              <div key={i} style={{ fontSize: '11px', color: STRATEGIC_COLOR, padding: '2px 0' }}>{b.name || b.sub_type} · {fmtDist(b.distance_m)}</div>
            ))}
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{
      marginTop: '8px',
      background: 'rgba(22, 27, 34, 0.4)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      border: '1px solid var(--glass-border)',
      borderRadius: '16px',
      padding: '16px',
      width: '100%',
      position: 'relative',
      boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
      animation: 'compFadeIn 0.3s ease',
    }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', marginBottom: '16px' }}>
          <Swords size={14} style={{ color: 'var(--accent)', marginRight: '6px', verticalAlign: 'middle' }} />
          Your Site vs {competitorName}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <ColBlock ctx={siteCtx} title="Your Site" color="var(--accent)" />
          <ColBlock ctx={compCtx} title={competitorName} color="#ffa657" />
        </div>

        {h2hInsights.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            {h2hInsights.map((text, i) => (
              <InsightCard key={i} insight={{ type: 'info', title: 'Flow Insight', text }} />
            ))}
          </div>
        )}
    </div>
  );
}

// Helper for contextual gap insights
function getGapNarrative(businessType: string, sourceType: string): string {
  const t = businessType;
  const s = sourceType;

  if (t === 'pharmacy') {
    if (s === 'hospital' || s === 'clinic') return 'Captive medical audience with zero immediate options.';
    if (s === 'govt_office' || s === 'office') return 'High daily employee footfall with zero nearby wellness/pharmacy options.';
    if (s === 'school' || s === 'college') return 'Large student/staff population with no immediate pharmacy access.';
    return 'Consistent footfall area lacking basic pharmacy coverage.';
  }

  if (t === 'restaurant') {
    if (s === 'hospital') return 'High dwell-time visitors and staff with zero food options nearby.';
    if (s === 'bus_station' || s === 'railway_station') return 'Captive commuter audience looking for quick dining options.';
    if (s === 'college' || s === 'school') return 'Prime student demographic with no immediate food options.';
    if (s === 'cinema' || s === 'stadium') return 'Pre/post-event crowds with nowhere to eat.';
    return 'High footfall generator with no dining options in the immediate vicinity.';
  }

  if (t === 'fitness') {
    if (s === 'govt_office' || s === 'office') return 'Perfect for before/after work sessions; zero gym options for this employee base.';
    if (s === 'college' || s === 'university') return 'Young, active demographic completely unserved in this immediate radius.';
    return 'Area with consistent daily traffic but zero fitness facilities.';
  }

  if (t === 'hotel') {
    if (s === 'hospital') return 'Perfect for medical tourism and visiting families, currently unserved.';
    if (s === 'bus_station' || s === 'railway_station') return 'Ideal for transit passengers needing accommodation.';
    if (s === 'stadium' || s === 'cinema') return 'Event-driven lodging opportunity with zero local competition.';
    return 'Major destination point lacking nearby accommodation.';
  }

  if (t === 'bank') {
    if (s === 'market' || s === 'marketplace') return 'High cash-transaction area with no immediate banking/ATM facilities.';
    if (s === 'govt_office') return 'High administrative footfall needing financial services.';
    return 'Daily commuter/visitor base with no immediate banking options.';
  }

  if (t === 'education') {
    if (s === 'bus_station' || s === 'railway_station') return 'Excellent transit connectivity for students, but zero educational institutes nearby.';
    return `High visibility area currently lacking educational facilities.`;
  }

  if (t === 'clinic') {
    if (s === 'school' || s === 'college') return 'Large student/staff population with no immediate clinical care options.';
    if (s === 'govt_office' || s === 'office') return 'High employee density lacking immediate primary health care.';
    return `Consistent daily footfall with zero immediate clinical options.`;
  }

  // Fallback
  return `Consistent footfall at this ${s.replace('_', ' ')} with zero ${t} options in the immediate vicinity.`;
}

/* ─── Main Component ──────────────────────────────────────────────────────────── */
export function CompetitorTab() {
  const {
    sitePin, radius, isMobile,
    businessType, setBusinessType,
    competitorData, setCompetitorData,
    opportunityData, setOpportunityData,
    selectedCompetitor, setSelectedCompetitor,
    headToHead, setHeadToHead,
    competitorMode, setCompetitorMode,
  } = useAnalysis();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedH2H, setExpandedH2H] = useState(false);
  const [selectedGap, setSelectedGap] = useState<CompetitorGap | null>(null);

  /* ─── Fetch ──────────────────────────────────────────────────────────────── */
  const runCompetitorAnalysis = useCallback(async () => {
    if (!sitePin) { setError('Pin a site on the map first.'); return; }
    setIsLoading(true); setError(null); setCompetitorData(null); setOpportunityData(null);
    setSelectedCompetitor(null); setHeadToHead(null);

    try {
      const base = `${API_BASE}/api/competitors?lng=${sitePin.lng}&lat=${sitePin.lat}&radius=${radius}&business_type=${businessType}`;
      const gapBase = `${API_BASE}/api/competitors/gaps?lng=${sitePin.lng}&lat=${sitePin.lat}&radius=${radius}&business_type=${businessType}`;

      const [compRes, gapRes] = await Promise.all([fetch(base), fetch(gapBase)]);
      if (!compRes.ok || !gapRes.ok) throw new Error('Server error');
      const [compJson, gapJson] = await Promise.all([compRes.json(), gapRes.json()]);

      setCompetitorData(compJson.data);
      setOpportunityData(gapJson.data);

      // Fit map to show all result pins immediately
      const allPts = [
        ...(compJson.data?.list || []).map((c: any) => [c.lng, c.lat] as [number,number]),
        ...(gapJson.data?.gaps  || []).map((g: any) => [g.lng, g.lat] as [number,number]),
      ];
      if (allPts.length > 0) {
        const lngs = allPts.map(p => p[0]);
        const lats  = allPts.map(p => p[1]);
        window.dispatchEvent(new CustomEvent('map:fitBounds', { detail: {
          bounds: [[Math.min(...lngs)-0.003, Math.min(...lats)-0.003],[Math.max(...lngs)+0.003, Math.max(...lats)+0.003]],
          padding: 60,
        }}));
      }
    } catch (e: any) {
      setError(e.message || 'Analysis failed');
    } finally {
      setIsLoading(false);
    }
  }, [sitePin, radius, businessType]);

  const loadHeadToHead = useCallback(async (comp: CompetitorItem) => {
    if (!sitePin) return;
    setHeadToHead(null);
    try {
      const res = await fetch(`${API_BASE}/api/competitors/context?comp_lng=${comp.lng}&comp_lat=${comp.lat}&site_lng=${sitePin.lng}&site_lat=${sitePin.lat}`);
      const json = await res.json();
      setHeadToHead(json.data);
    } catch (_) { }
  }, [sitePin]);

  /* ─── Navigate to competitor on map ─────────────────────────────────────── */
  const navigateTo = useCallback((lng: number, lat: number) => {
    // Dispatch custom event picked up by MapContainer
    window.dispatchEvent(new CustomEvent('competitor:navigate', { detail: { lng, lat } }));
    if (isMobile) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [isMobile]);

  // Listen to map clicks on competitor dots
  useEffect(() => {
    const handler = (e: Event) => {
      const comp = (e as CustomEvent).detail as CompetitorItem;
      setSelectedCompetitor(comp);
      loadHeadToHead(comp);
      // Scroll the panel row into view
      const id = comp.google_id ?? (comp.osm_id != null ? `comp-row-${comp.osm_id}` : null);
      if (id) requestAnimationFrame(() =>
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      );
    };
    window.addEventListener('competitor:selectFromMap', handler);
    return () => window.removeEventListener('competitor:selectFromMap', handler);
  }, [loadHeadToHead, setSelectedCompetitor]);

  // Listen to map clicks on gap dots
  useEffect(() => {
    const handler = (e: Event) => {
      const gap = (e as CustomEvent).detail as CompetitorGap;
      setSelectedGap(gap);
      setCompetitorMode('gaps');
      navigateTo(gap.lng, gap.lat);
      // Scroll gap row into view
      const id = gap.osm_id != null ? `gap-row-${gap.osm_id}` : `gap-row-${gap.name}`;
      requestAnimationFrame(() =>
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      );
    };
    window.addEventListener('gap:selectFromMap', handler);
    return () => window.removeEventListener('gap:selectFromMap', handler);
  }, [navigateTo, setCompetitorMode]);

  const summary = competitorData?.summary;
  const competitors = competitorData?.list || [];
  const gaps = opportunityData?.gaps || [];

  // Generate Insights
  const insights = [];
  if (competitors.length > 0) {
    const density = competitors.length;
    if (density > 30) {
      insights.push({
        type: 'warning',
        title: 'Heavy Saturation',
        text: `${density} competitors within ${fmtDist(radius)}. Average spacing: ${Math.round(radius / (density / 2))}m. This is a highly contested area.`
      });
    }

    const mainRoadCount = competitors.filter(c =>
      ['National Highway', 'Expressway', 'State Highway', 'District Road'].includes(c.road_label)
    ).length;
    const sideStreetCount = density - mainRoadCount;
    if (sideStreetCount > 0 && mainRoadCount > 0) {
      insights.push({
        type: 'info',
        title: 'Market Visibility Split',
        text: `${mainRoadCount} competitors are on highly visible Main Roads (drive-by traffic), while ${sideStreetCount} are on quieter Side Streets (local walk-ins). Decide which type of customer you want to target.`
      });
    }

    const nearest = competitors[0];
    if (nearest && nearest.distance_m < 150) {
      insights.push({
        type: 'warning',
        title: 'Direct Neighbor Threat',
        text: `${nearest.name} is only ${nearest.distance_m}m away. At this distance, you share the exact same customers. You need a strong differentiator.`
      });
    }
  }
  if (gaps.length > 0) {
    const best = gaps[0];
    const narrative = getGapNarrative(businessType, best.source_type);
    insights.push({
      type: 'opportunity',
      title: 'Strongest Gap',
      text: `${best.name} (${best.source_type.replace('_', ' ')}) is ${fmtDist(best.distance_from_site_m)} away with 0 options nearby. ${narrative}`
    });
  }

  /* ─── Render ─────────────────────────────────────────────────────────────── */
  return (
    <>
      <style>{`
        @keyframes compFadeIn { from { opacity:0; transform:translateY(-4px) } to { opacity:1; transform:none } }
        .comp-row-hover:hover { filter: brightness(1.08); }
      `}</style>

      {/* ── Business Type Selector ── */}
      <div>
        <SectionTitle><Search size={12} /> Business Type</SectionTitle>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {BUSINESS_TYPES.map(bt => (
            <button
              key={bt.value}
              onClick={() => setBusinessType(bt.value)}
              style={{
                padding: '6px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                cursor: 'pointer', border: `1px solid ${businessType === bt.value ? 'var(--accent)' : 'var(--border)'}`,
                background: businessType === bt.value ? 'rgba(79,156,249,0.12)' : 'var(--surface2)',
                color: businessType === bt.value ? 'var(--accent)' : 'var(--text-dim)',
                transition: 'all 0.15s',
              }}
            >
              {bt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Run Button ── */}
      <button
        onClick={runCompetitorAnalysis}
        disabled={isLoading || !sitePin}
        style={{
          width: '100%', padding: '12px', borderRadius: '12px', fontSize: '13px', fontWeight: 700,
          cursor: sitePin ? 'pointer' : 'not-allowed', border: 'none',
          background: sitePin ? 'linear-gradient(135deg, rgba(79,156,249,0.15), rgba(79,156,249,0.08))' : 'var(--surface2)',
          color: sitePin ? 'var(--accent)' : 'var(--text-dim)',
          border: '1px solid rgba(79,156,249,0.3)', transition: 'all 0.2s',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        }}
      >
        {isLoading
          ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Analysing…</>
          : <><Swords size={14} /> Run Competitor Analysis</>
        }
      </button>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {error && (
        <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,123,114,0.08)', border: '1px solid rgba(255,123,114,0.2)', fontSize: '12px', color: '#ff7b72' }}>
          {error}
        </div>
      )}

      {/* ── Results ── */}
      {summary && (
        <>
          {/* Summary Stats */}
          <div>
            <SectionTitle><TrendingUp size={12} /> Overview</SectionTitle>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <StatBox num={summary.total_count} label="Total" color="var(--accent)" />
              <StatBox num={summary.nearest_m ? fmtDist(summary.nearest_m) : '—'} label="Nearest" color="#ffa657" />
              <StatBox num={summary.on_main_road} label="Main Road" color="#7ee787" />
              <StatBox num={summary.with_barrier} label="Blocked" color={summary.with_barrier > 0 ? '#ff7b72' : 'var(--text-dim)'} />
              {summary.google_only_added > 0 && (
                <StatBox num={`+${summary.google_only_added}`} label="Google Only" color="#4f9cf9" />
              )}
            </div>
          </div>

          {/* Moat Alert */}
          {summary.with_barrier > 0 && (
            <div style={{ padding: '10px 12px', borderRadius: '10px', background: STRATEGIC_BG, border: '1px solid rgba(129, 140, 248, 0.2)', borderLeft: `3px solid ${STRATEGIC_COLOR}`, fontSize: '11px', color: STRATEGIC_COLOR, display: 'flex', gap: '8px' }}>
              <Shield size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>{summary.with_barrier} competitor(s) are blocked by "Strategic Moats" (rail/river/highways). They are unlikely to capture your local footfall.</span>
            </div>
          )}

          {/* AI Insights Engine */}
          {insights.length > 0 && (
            <div>
              <SectionTitle><Lightbulb size={12} /> Key Insights</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {insights.map((ins, i) => <InsightCard key={i} insight={ins as any} />)}
              </div>
            </div>
          )}

          {/* Mode Tabs */}
          <div style={{ display: 'flex', gap: '4px', padding: '4px', background: 'var(--surface2)', borderRadius: '12px', border: '1px solid var(--border)' }}>
            {[
              { id: 'competitors', label: `Competitors (${summary.total_count})`, icon: Swords },
              { id: 'gaps', label: `Gaps (${gaps.length})`, icon: Zap },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setCompetitorMode(id as any)}
                style={{
                  flex: 1, padding: '8px', borderRadius: '9px', border: 'none', fontSize: '12px', fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.15s',
                  background: competitorMode === id ? 'rgba(79,156,249,0.15)' : 'transparent',
                  color: competitorMode === id ? 'var(--accent)' : 'var(--text-dim)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}
              >
                <Icon size={12} />{label}
              </button>
            ))}
          </div>

          {/* ── Competitor List ── */}
          {competitorMode === 'competitors' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', animation: 'compFadeIn 0.2s ease' }}>
              {competitors.length === 0
                ? <div style={{ textAlign: 'center', padding: '24px', fontSize: '13px', color: 'var(--text-dim)' }}>No named competitors found within {fmtDist(radius)}</div>
                : competitors.map((comp, idx) => {
                   // Stable key: google_id > osm_id > array index
                   const compKey = comp.google_id ?? (comp.osm_id != null ? String(comp.osm_id) : `idx-${idx}`);
                   const selKey  = selectedCompetitor
                     ? (selectedCompetitor.google_id ?? (selectedCompetitor.osm_id != null ? String(selectedCompetitor.osm_id) : null))
                     : null;
                   const isSelected = selKey !== null && compKey === selKey;
                   const compRowId = comp.google_id ?? (comp.osm_id != null ? `comp-row-${comp.osm_id}` : `comp-row-idx-${idx}`);
                   return (
                   <div key={compKey} id={compRowId}>
                     <CompetitorRow
                       item={comp}
                       isSelected={isSelected}
                       isMobile={isMobile}
                       onSelect={() => {
                         const isSame = isSelected;
                         setSelectedCompetitor(isSame ? null : comp);
                         if (!isSame) { loadHeadToHead(comp); navigateTo(comp.lng, comp.lat); }
                       }}
                       onNavigate={() => navigateTo(comp.lng, comp.lat)}
                     />

                     {/* Head-to-Head inline when selected */}
                     {isSelected && headToHead && (
                       <div style={{ marginTop: '4px', padding: '0 4px', animation: 'compFadeIn 0.2s ease' }}>
                         <button
                           onClick={() => setExpandedH2H(v => !v)}
                           style={{
                             width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(255,166,87,0.25)',
                             background: 'rgba(255,166,87,0.06)', cursor: 'pointer', fontSize: '11px', fontWeight: 700,
                             color: '#ffa657', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                           }}
                         >
                           <span><Swords size={11} style={{ marginRight: '6px', verticalAlign: 'middle' }} />Head-to-Head Comparison</span>
                           {expandedH2H ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                         </button>
                         {expandedH2H && <HeadToHeadModal data={headToHead} competitorName={comp.name} onClose={() => setExpandedH2H(false)} />}
                       </div>
                     )}
                   </div>
                  );
                })
              }
            </div>
          )}

          {/* ── Opportunity Gaps ── */}
          {competitorMode === 'gaps' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', animation: 'compFadeIn 0.2s ease' }}>
              {gaps.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', fontSize: '13px', color: 'var(--text-dim)' }}>
                  All major footfall sources within {fmtDist(radius)} already have businesses of your type nearby. Competitive saturation is high.
                </div>
              ) : (
                <>
                  <div style={{
                    fontSize: '11px', color: 'var(--text-dim)', padding: '6px 10px',
                    background: 'rgba(126,231,135,0.06)', borderRadius: '8px',
                    border: '1px solid rgba(126,231,135,0.15)',
                    lineHeight: 1.5,
                  }}>
                    <span style={{ fontWeight: 700, color: '#7ee787' }}>💡 {gaps.length} gap{gaps.length > 1 ? 's' : ''} found</span>
                    {' '}— footfall sources with <strong>0 competitors</strong> within 300m. Click any row or the map marker to explore.
                  </div>
                  {gaps.map((gap, i) => {
                    const gapKey = gap.osm_id ? String(gap.osm_id) : `gap-${i}`;
                    const isSelected = selectedGap
                      ? (gap.osm_id ? String(gap.osm_id) === String(selectedGap.osm_id) : gap.name === selectedGap.name)
                      : false;
                    const gapRowId = gap.osm_id != null ? `gap-row-${gap.osm_id}` : `gap-row-${gap.name}`;
                    return (
                      <div key={gapKey} id={gapRowId}>
                      <GapRow
                        key={gapKey}
                        gap={gap}
                        isMobile={isMobile}
                        isSelected={isSelected}
                        onNavigate={() => {
                          setSelectedGap(gap);
                          navigateTo(gap.lng, gap.lat);
                        }}
                      />
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Empty State ── */}
      {!summary && !isLoading && (
        <div style={{ textAlign: 'center', padding: '32px 16px' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>🗺</div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>Competitor Analysis</div>
          <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.6 }}>
            Select your business type above and run the analysis to discover nearby competitors and opportunity gaps.
          </div>
        </div>
      )}
    </>
  );
}
