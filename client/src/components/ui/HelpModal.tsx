import { Map, Zap } from 'lucide-react';

export function HelpModal({ open, onClose }: { open: boolean, onClose: () => void }) {
  if (!open) return null;

  return (
    <div 
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.7)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '14px', padding: '24px', maxWidth: '480px', width: '90%'
        }}
      >
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', marginBottom: '16px' }}>
          <Map size={18} strokeWidth={2.5} style={{ color: 'var(--accent)' }}/> 
          How to use Site Analysis
        </h2>
        <ol style={{ paddingLeft: '18px', fontSize: '13px', lineHeight: 2, color: 'var(--text-muted)' }}>
          <li><strong>Click</strong> on the map to pin a site location</li>
          <li>Set your <strong>analysis radius</strong> (100 – 10 000 m)</li>
          <li style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            Press <strong style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text)' }}><Zap size={14} fill="currentColor"/> Analyse Site</strong> to run all analyses
          </li>
          <li>Browse results across the <strong>7 tabs</strong> in the right panel</li>
          <li>Use the <strong>Draw</strong> tool (top-right of map) to select & export features</li>
        </ol>
        <button 
          onClick={onClose}
          style={{
            marginTop: '20px', width: '100%', padding: '8px',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: '8px', color: 'var(--text)', cursor: 'pointer',
            fontFamily: 'inherit'
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
