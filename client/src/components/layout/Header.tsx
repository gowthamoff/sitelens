import { HelpCircle } from 'lucide-react';
import { useAnalysis } from '../../context/AnalysisContext';

export function Header({ openHelp }: { openHelp: () => void }) {
  const { sitePin, isMobile } = useAnalysis();

  return (
    <header style={{
      height: 'var(--header-h)',
      background: 'var(--glass-bg)',
      backdropFilter: 'var(--glass-blur)',
      WebkitBackdropFilter: 'var(--glass-blur)',
      borderBottom: '1px solid var(--glass-border)',
      display: 'flex',
      alignItems: 'center',
      gap: isMobile ? '10px' : '20px',
      padding: isMobile ? '0 14px' : '0 20px',
      zIndex: 200,
      flexShrink: 0,
      boxShadow: '0 4px 30px rgba(0, 0, 0, 0.2)',
    }}>
      {/* Logo + App Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', flexShrink: 0 }}>
        <img 
          src="/logo.png" 
          alt="Site Analysis Logo" 
          style={{ width: isMobile ? '28px' : '32px', height: isMobile ? '28px' : '32px', borderRadius: '50%', objectFit: 'contain' }} 
        />
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <span style={{
            fontWeight: 800,
            fontSize: isMobile ? '15px' : '16px',
            letterSpacing: '-0.5px',
            color: '#f0f6fc',
            whiteSpace: 'nowrap',
          }}>
            SiteLens
          </span>
          {!isMobile && (
            <span style={{
              fontSize: '9px',
              fontWeight: 600,
              letterSpacing: '1.5px',
              color: 'var(--text-dim)',
              textTransform: 'uppercase',
              marginTop: '1px',
            }}>
              Geospatial Intelligence
            </span>
          )}
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {/* Coordinates pill */}
      {(!isMobile || sitePin) && (
        <div style={{
          fontSize: isMobile ? '10px' : '11px',
          color: 'var(--text-muted)',
          fontFamily: '"JetBrains Mono", monospace',
          background: 'rgba(0,0,0,0.25)',
          border: '1px solid var(--border)',
          padding: isMobile ? '5px 10px' : '6px 14px',
          borderRadius: '18px',
          letterSpacing: '0.2px',
          flexShrink: 0,
        }}>
          {sitePin ? (
            <span style={{ color: 'var(--accent2)' }}>
              {isMobile
                ? `${sitePin.lat.toFixed(4)}, ${sitePin.lng.toFixed(4)}`
                : `${sitePin.lat.toFixed(5)}, ${sitePin.lng.toFixed(5)}`}
            </span>
          ) : (
            <span style={{ opacity: 0.6 }}>{isMobile ? 'TAP MAP' : 'WAITING FOR INPUT'}</span>
          )}
        </div>
      )}

      {/* Help Button */}
      <button
        id="help-btn"
        onClick={openHelp}
        style={{
          width: isMobile ? '30px' : '32px',
          height: isMobile ? '30px' : '32px',
          borderRadius: '50%',
          background: 'var(--surface2)', border: '1px solid var(--border)',
          color: 'var(--text-muted)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s',
          flexShrink: 0,
        }}
        className="help-btn"
      >
        <style>{`.help-btn:hover { border-color: var(--accent); color: var(--accent); background: var(--surface); }`}</style>
        <HelpCircle size={isMobile ? 14 : 16} />
      </button>
    </header>
  );
}
