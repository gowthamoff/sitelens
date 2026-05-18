import type { ReactNode } from 'react';
import { MapPin } from 'lucide-react';

interface ScoreRingProps {
  score: number;
  maxScore?: number;
  label?: string;
  color: string;
}

export function ScoreRing({ score, maxScore = 100, label, color }: ScoreRingProps) {
  const percentage = Math.min(Math.max((score / maxScore) * 100, 0), 100);
  const dashoffset = Math.PI * 100 * (1 - percentage / 100);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 16px' }}>
      <div style={{ position: 'relative', width: '120px', height: '120px' }}>
        <svg viewBox="0 0 120 120" width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
          <circle 
            cx="60" cy="60" r="50" 
            fill="none" stroke="var(--border)" strokeWidth="10" 
          />
          <circle 
            cx="60" cy="60" r="50" 
            fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={Math.PI * 100}
            strokeDashoffset={dashoffset}
            style={{ transition: 'stroke-dashoffset 1s ease' }}
          />
        </svg>
        <div style={{ 
          position: 'absolute', inset: 0, 
          display: 'flex', flexDirection: 'column', 
          alignItems: 'center', justifyContent: 'center' 
        }}>
          <span style={{ fontSize: '28px', fontWeight: 700, lineHeight: 1, color }}>{score}</span>
          {label && <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{label}</span>}
        </div>
      </div>
    </div>
  );
}

export function Spinner() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '40px 0' }}>
      <div style={{
        width: '36px', height: '36px',
        border: '3px solid var(--border)',
        borderTopColor: 'var(--accent)',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite'
      }} />
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Running spatial analysis…</p>
    </div>
  );
}

export function EmptyState({ 
  icon = <MapPin size={40} className="empty-icon" />, 
  title = "No site selected", 
  description = "Click anywhere on the map to pin a location, then press Analyse Site." 
}: {
  icon?: ReactNode; title?: string; description?: ReactNode;
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '300px', gap: '12px', color: 'var(--text-muted)', textAlign: 'center'
    }}>
      <style>{`
        .empty-icon { opacity: 0.5; color: var(--text-muted); margin-bottom: 8px; }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'center' }}>{icon}</div>
      <h3 style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)' }}>{title}</h3>
      <p style={{ fontSize: '13px', maxWidth: '240px', lineHeight: 1.5 }}>
        {description}
      </p>
    </div>
  );
}
