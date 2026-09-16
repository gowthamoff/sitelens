import { useState, useEffect, useRef } from 'react';
import { AuthProvider } from './context/AuthContext';
import { AuthGate } from './features/auth/AuthGate';
import { AnalysisProvider, useAnalysis } from './context/AnalysisContext';
import { Header } from './components/layout/Header';
import { MapContainer } from './components/map/MapContainer';
import { AnalysisPanel } from './features/analysis/AnalysisPanel';
import { HelpModal } from './components/ui/HelpModal';
import './index.css';

function MainLayout() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [panelHeight, setPanelHeight] = useState(window.innerHeight * 0.32);
  const { panelWidth, setPanelWidth, isMobile, setIsMobile, analysisData, isLoading, activeTab, analysisType, sitePin, drawnPolygon } = useAnalysis();
  const isResizing = useRef(false);
  const touchStartY = useRef(0);
  const touchStartH = useRef(0);
  const touchStartTime = useRef(0);

  // Auto-expand panel when analysis data arrives
  useEffect(() => {
    if (isMobile && analysisData && !isLoading) {
      setPanelHeight(h => Math.max(h, window.innerHeight * 0.40));
    }
  }, [analysisData, isMobile, isLoading]);

  useEffect(() => {
    if (isMobile) {
      document.documentElement.style.setProperty('--panel-h', `${panelHeight}px`);
    } else {
      document.documentElement.style.setProperty('--panel-h', `0px`);
    }
    // Notify MapContainer so it can re-apply camera padding
    window.dispatchEvent(new Event('panel:resize'));
  }, [panelHeight, isMobile]);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        const minW = window.innerWidth * 0.3;
        const maxW = window.innerWidth * 0.7;
        if (panelWidth < minW) setPanelWidth(minW);
        if (panelWidth > maxW) setPanelWidth(maxW);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      if (isMobile) {
        const newHeight = window.innerHeight - e.clientY;
        const minH = window.innerHeight * 0.18;
        const maxH = window.innerHeight * 0.88;
        if (newHeight >= minH && newHeight <= maxH) setPanelHeight(newHeight);
      } else {
        const newWidth = window.innerWidth - e.clientX;
        const minPanelW = window.innerWidth * 0.3;
        const minMapW = window.innerWidth * 0.3;
        const maxPanelW = window.innerWidth - minMapW;
        if (newWidth >= minPanelW && newWidth <= maxPanelW) {
          document.documentElement.style.setProperty('--panel-w', `${newWidth}px`);
        }
      }
    };

    const handleMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
        if (!isMobile) {
          const currentW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-w'));
          if (!isNaN(currentW)) setPanelWidth(currentW);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    if (!isMobile) document.documentElement.style.setProperty('--panel-w', `${panelWidth}px`);

    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [panelWidth, isMobile]);

  const handleMouseDown = () => {
    isResizing.current = true;
    document.body.style.cursor = isMobile ? 'row-resize' : 'ew-resize';
    document.body.style.userSelect = 'none';
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartH.current = panelHeight;
    touchStartTime.current = Date.now();
    isResizing.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isResizing.current) return;
    const dy = touchStartY.current - e.touches[0].clientY;
    const newH = Math.min(
      Math.max(touchStartH.current + dy, window.innerHeight * 0.18),
      window.innerHeight * 0.88
    );
    setPanelHeight(newH);
  };

  const handleTouchEnd = (e: React.TouchEvent) => { 
    if (!isResizing.current) return;
    isResizing.current = false; 

    // Calculate swipe velocity
    const touchEndY = e.changedTouches[0].clientY;
    const dy = touchEndY - touchStartY.current;
    const dt = Date.now() - touchStartTime.current;
    const velocity = dy / dt; // Negative if dragged UP, Positive if dragged DOWN

    const snaps = [0.18, 0.40, 0.50, 0.88].map(p => p * window.innerHeight);
    const [minH, mid1, mid2, maxH] = snaps;

    let targetH = panelHeight;

    if (Math.abs(velocity) > 0.4) {
      if (velocity < 0) {
        // Swiped UP - find the next snap point higher than current
        targetH = snaps.find(s => s > panelHeight + 10) || maxH;
      } else {
        // Swiped DOWN - find the next snap point lower than current
        targetH = [...snaps].reverse().find(s => s < panelHeight - 10) || minH;
      }
    } else {
      // Slow drop — snap to nearest
      const dists = snaps.map(s => ({ h: s, d: Math.abs(panelHeight - s) }));
      dists.sort((a,b) => a.d - b.d);
      targetH = dists[0].h;
    }

    setPanelHeight(targetH);
  };

  return (
    <div id="app" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div id="main" style={{ 
        display: 'flex', flex: 1, position: 'relative', overflow: 'hidden',
        flexDirection: isMobile ? 'column' : 'row',
        padding: isMobile ? '0' : '8px', 
        gap: isMobile ? '0' : '8px',
        background: '#0d1117'
      }}>
        <div style={{ 
          flex: 1, position: 'relative', 
          borderRadius: isMobile ? '0' : '16px', 
          overflow: 'hidden',
          border: isMobile ? 'none' : '1px solid var(--border)'
        }}>
          <MapContainer />
          
          {/* Top-Left Floating Container (Title + Search) */}
          <div style={{
            position: 'absolute', top: isMobile ? 12 : 20, left: isMobile ? 12 : 20, zIndex: 100,
            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '12px',
            maxWidth: 'calc(100% - 40px)', pointerEvents: 'none'
          }}>
            {/* Application Title Pill */}
            <div style={{
              background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)',
              WebkitBackdropFilter: 'var(--glass-blur)',
              border: '1px solid var(--glass-border)', borderRadius: '24px',
              padding: '6px 16px 6px 6px', boxShadow: 'var(--shadow)',
              display: 'flex', flexDirection: 'row', gap: '10px',
              alignItems: 'center', transition: 'all 0.3s ease',
              pointerEvents: 'auto', flexShrink: 0
            }}>
            <img 
              src="/logo.png" 
              alt="SiteLens Logo" 
              style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'contain' }} 
            />
            <div style={{
              fontWeight: 800, fontSize: isMobile ? '14px' : '16px', letterSpacing: '-0.5px',
              color: '#f0f6fc',
              fontFamily: '"Inter", sans-serif',
              whiteSpace: 'nowrap'
            }}>
              SiteLens
              {isMobile && activeTab && (
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                  <span style={{ margin: '0 6px', opacity: 0.5 }}>/</span>
                  {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                </span>
              )}
            </div>

            {/* Guide inline — desktop only */}
            {!isMobile && (() => {
              const hasInput = analysisType === 'radius' ? !!sitePin : !!drawnPolygon;
              if (!hasInput) {
                return (
                  <>
                    <div style={{ width: '1px', height: '16px', background: 'var(--border)', margin: '0 2px' }} />
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)', flexShrink: 0, animation: 'pulse-marker 1.5s infinite' }} />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>
                      {analysisType === 'radius' ? 'Click on map to drop pin' : 'Click points to draw polygon'}
                    </span>
                  </>
                );
              }
              return null;
            })()}
            
            <div style={{ width: '1px', height: '16px', background: 'var(--border)', margin: '0 2px' }} />
            
            <button
              onClick={() => setHelpOpen(true)}
              title="Help & Guides"
              style={{
                width: '26px', height: '26px', borderRadius: '50%',
                background: 'var(--surface2)', border: '1px solid var(--border)',
                color: 'var(--text-dim)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s', flexShrink: 0
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)'; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            </button>
            </div>

            {/* Portal target for GeoSearch */}
            <div id="search-portal-target" style={{ pointerEvents: 'auto', position: 'relative' }}></div>
          </div>
        </div>

        {/* Mobile-only guide pill — shifted down to avoid search bar overlap */}
        {isMobile && (() => {
          const hasInput = analysisType === 'radius' ? !!sitePin : !!drawnPolygon;
          if (hasInput) return null;
          return (
            <div style={{
              position: 'absolute', top: 120, left: '50%', transform: 'translateX(-50%)',
              zIndex: 100, display: 'flex', alignItems: 'center', gap: '8px',
              background: 'rgba(22,27,34,0.88)', backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid var(--glass-border)', borderRadius: '20px',
              padding: '6px 16px', boxShadow: 'var(--shadow)',
              whiteSpace: 'nowrap',
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)', flexShrink: 0, animation: 'pulse-marker 1.5s infinite' }} />
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', letterSpacing: '0.3px' }}>
                {analysisType === 'radius' ? 'Tap on map to drop pin' : 'Tap to draw · Double-tap to finish'}
              </span>
            </div>
          );
        })()}

        {/* Analysis panel — relative in the flex-column on mobile, side panel on desktop */}
        <div style={{
          position: 'relative',
          height: isMobile ? `${panelHeight}px` : '100%',
          width: isMobile ? '100%' : 'var(--panel-w)',
          zIndex: 500,
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          transition: isResizing.current ? 'none' : 'height 0.25s ease',
          background: isMobile ? 'var(--glass-bg)' : 'transparent',
          backdropFilter: isMobile ? 'var(--glass-blur)' : 'none',
          WebkitBackdropFilter: isMobile ? 'var(--glass-blur)' : 'none',
          borderRadius: isMobile ? '24px 24px 0 0' : '16px',
          boxShadow: isMobile ? '0 -10px 40px rgba(0,0,0,0.4)' : 'none',
          borderTop: isMobile ? '1px solid var(--glass-border)' : 'none',
          overflow: isMobile ? 'hidden' : 'visible',
          flexShrink: 0,
        }}>
          {/* Drag handle */}
          <div
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
              width: isMobile ? '100%' : '12px',
              height: isMobile ? '30px' : '100%',
              cursor: isMobile ? 'row-resize' : 'col-resize',
              position: isMobile ? 'static' : 'absolute',
              top: isMobile ? 'auto' : 0,
              left: isMobile ? 0 : -6,
              zIndex: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              borderTop: 'none',
              touchAction: 'none',
            }}
          >
            <div style={{
              width: isMobile ? '36px' : '4px',
              height: isMobile ? '4px' : '40px',
              background: 'rgba(255,255,255,0.2)',
              borderRadius: '4px',
            }} />
          </div>

          <div style={{
            flex: 1,
            overflow: 'hidden',
            background: isMobile ? 'transparent' : 'var(--surface)',
            border: isMobile ? 'none' : '1px solid var(--border)',
            borderRadius: isMobile ? '0' : '16px',
          }}>
            <AnalysisPanel />
          </div>
        </div>
      </div>

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <AnalysisProvider>
          <MainLayout />
        </AnalysisProvider>
      </AuthGate>
    </AuthProvider>
  );
}

export default App;
