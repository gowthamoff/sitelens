import { useRef, useEffect, useState } from 'react';
import { useAnalysis } from '../../context/AnalysisContext';
import * as turf from '@turf/turf';
import { Spinner, EmptyState } from '../../components/ui/ScoreRing';
import { MapPin, Home, Bus, Star, Leaf, Link, AlertTriangle, Zap, Loader2, Swords, GitMerge, PieChart } from 'lucide-react';

// Tabs
import { FootfallTab } from './tabs/FootfallTab';
import { CompetitorTab } from './tabs/CompetitorTab';
import { ProximityTab } from './tabs/ProximityTab';
import { LandUseTab } from './tabs/LandUseTab';
import { TransportTab } from './tabs/TransportTab';
import { AmenityTab } from './tabs/AmenityTab';
import { EnvironmentTab } from './tabs/EnvironmentTab';
import { ConnectivityTab } from './tabs/ConnectivityTab';
import { RiskTab } from './tabs/RiskTab';
import { NdviTab } from './tabs/NdviTab';
import { CannibalizationTab } from './tabs/CannibalizationTab';
import { DemandMixTab } from './tabs/DemandMixTab';

const TABS = [
  { id: 'demand-mix',      label: 'Demand Mix',     icon: PieChart  },
  { id: 'footfall',        label: 'Footfall',       icon: MapPin    },
  { id: 'competitor',      label: 'Competitors',    icon: Swords    },
  { id: 'cannibalization', label: 'Cannibalize',    icon: GitMerge  },
  { id: 'landuse',         label: 'Land Use',       icon: Home      },
  { id: 'transport',       label: 'Transport',      icon: Bus       },
  { id: 'amenity',         label: 'Score',          icon: Star      },
  { id: 'environment',     label: 'Environment',    icon: Leaf      },
  { id: 'connectivity',    label: 'Connectivity',   icon: Link      },
];

export function AnalysisPanel() {
  const { analysisData, isLoading, error, activeTab, setActiveTab, isMobile, runAnalysis, analysisType, sitePin, drawnPolygon, radius, loadTab, tabLoading, loadedTabs } = useAnalysis();
  const isInputReady = analysisType === 'radius' ? !!sitePin : !!drawnPolygon;

  // Calculate measurement for the header
  let measurementText = 'Select an area';
  if (analysisType === 'radius') {
    measurementText = `${(radius / 1000).toFixed(1)} km radius`;
  } else if (analysisType === 'polygon' && drawnPolygon) {
    const area = turf.area(drawnPolygon);
    measurementText = `${(area / 1000000).toFixed(2)} km² area`;
  }
  const tabsRef  = useRef<HTMLDivElement>(null);
  const [canScrollLeft,  setCanScrollLeft]  = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Track scroll position to show/hide fade indicators
  const checkScroll = () => {
    const el = tabsRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', checkScroll); ro.disconnect(); };
  }, []);

  // Scroll active tab into view when it changes
  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    const activeBtn = el.querySelector('[data-active="true"]') as HTMLElement;
    if (activeBtn) activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeTab]);

  // Auto-load tab data when switching tabs (lazy loading)
  useEffect(() => {
    if (analysisData) {
      loadTab(activeTab);
    }
  }, [activeTab, analysisData]);

  const renderContent = () => {
    // These tabs work standalone — don't need analysisData
    if (activeTab === 'ndvi')            return <NdviTab />;
    if (activeTab === 'cannibalization') return <CannibalizationTab />;
    if (activeTab === 'demand-mix')      return <DemandMixTab />;

    if (isLoading && !analysisData) return <Spinner />;
    if (error && !analysisData) return <EmptyState icon={<AlertTriangle size={40} className="empty-icon" style={{ color: '#ff7b72' }} />} title="Analysis failed" description={error} />;
    if (!analysisData) return <EmptyState />;

    // Tabs whose data is loaded lazily. Show a spinner in two cases:
    //  1. tabLoading[tab] is true  → loadTab() is in flight
    //  2. !loadedTabs.has(tab)     → loadTab() hasn't started yet (between render
    //                                and the useEffect firing one tick later)
    // Without this second guard, the tab component renders with undefined data
    // and crashes before the loading state is even set.
    const LAZY_TABS = ['landuse', 'transport', 'amenity', 'environment', 'connectivity'];
    if (LAZY_TABS.includes(activeTab) && (tabLoading[activeTab] || !loadedTabs.has(activeTab))) {
      return <Spinner />;
    }

    switch (activeTab) {
      case 'footfall':        return <FootfallTab />;
      case 'competitor':      return <CompetitorTab />;
      case 'landuse':         return <LandUseTab />;
      case 'transport':       return <TransportTab />;
      case 'amenity':         return <AmenityTab />;
      case 'environment':     return <EnvironmentTab />;
      case 'connectivity':    return <ConnectivityTab />;
      case 'risk':            return <RiskTab />;
      default:                return null;
    }
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: 'var(--surface)',
      borderLeft: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }} id="panel">



      {/* ── Tab bar with scroll fade ── */}
      <div style={{
        position: 'relative', flexShrink: 0,
        borderBottom: '1px solid var(--border)',
        background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)',
      }}>
        <style>{`
          @keyframes pulseArrowRight {
            0% { transform: translateX(0); opacity: 0.9; }
            50% { transform: translateX(3px); opacity: 0.3; }
            100% { transform: translateX(0); opacity: 0.9; }
          }
          @keyframes pulseArrowLeft {
            0% { transform: translateX(0); opacity: 0.9; }
            50% { transform: translateX(-3px); opacity: 0.3; }
            100% { transform: translateX(0); opacity: 0.9; }
          }
        `}</style>

        {/* Left fade gradient + Animated Arrow */}
        {canScrollLeft && (
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: '48px', zIndex: 2,
            background: 'linear-gradient(to right, var(--glass-bg) 30%, transparent)',
            pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
            paddingLeft: '6px'
          }}>
            <div style={{ color: 'var(--accent)', animation: 'pulseArrowLeft 1.5s infinite ease-in-out' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </div>
          </div>
        )}
        {/* Right fade gradient + Animated Arrow */}
        {canScrollRight && (
          <div style={{
            position: 'absolute', right: 0, top: 0, bottom: 0, width: '48px', zIndex: 2,
            background: 'linear-gradient(to left, var(--glass-bg) 30%, transparent)',
            pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            paddingRight: '6px'
          }}>
            <div style={{ color: 'var(--accent)', animation: 'pulseArrowRight 1.5s infinite ease-in-out' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </div>
          </div>
        )}

        {/* Scrollable tab strip */}
        <div
          ref={tabsRef}
          onWheel={(e) => {
            e.preventDefault();
            tabsRef.current?.scrollBy({ left: e.deltaY * 2, behavior: 'auto' });
          }}
          style={{
            display: 'flex',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch',
            padding: '4px 8px',
            gap: '6px',
          } as React.CSSProperties}
        >
          <style>{`
            #panel .tab-strip::-webkit-scrollbar { display: none; }
            .tab-btn-new { transition: color 0.2s, background 0.15s; }
            .tab-btn-new:hover { color: var(--text) !important; }
          `}</style>
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                data-active={isActive}
                onClick={() => {
                  setActiveTab(tab.id);
                  // Re-center map in visible space above panel whenever a tab is switched
                  requestAnimationFrame(() => {
                    window.dispatchEvent(new Event('panel:resize'));
                    window.dispatchEvent(new Event('map:resize'));
                  });
                }}
                className="tab-btn-new"
                style={{
                  padding: isMobile ? '8px 16px' : '10px 20px',
                  fontSize: isMobile ? '11px' : '12px',
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#fff' : 'var(--text-dim)',
                  background: isActive ? 'rgba(79, 156, 249, 0.12)' : 'transparent',
                  border: isActive ? '1px solid rgba(79, 156, 249, 0.3)' : '1px solid transparent',
                  cursor: 'pointer',
                  position: 'relative', whiteSpace: 'nowrap', flexShrink: 0,
                  textTransform: 'uppercase', letterSpacing: '0.5px',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  borderRadius: '12px',
                  transition: 'all 0.2s ease',
                }}
              >
                <Icon size={isMobile ? 14 : 16} strokeWidth={isActive ? 2.5 : 2} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Panel content */}
      <div style={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        padding: isMobile ? '16px 14px' : '20px',
        scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
