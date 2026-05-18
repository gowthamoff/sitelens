import type { ReactNode, CSSProperties } from 'react';

export function Card({ children, style }: { children: ReactNode, style?: CSSProperties }) {
  return (
    <div className="card" style={{
      background: 'var(--surface2)',
      backdropFilter: 'var(--glass-blur)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      padding: '16px 18px',
      marginBottom: '12px',
      boxShadow: 'var(--shadow)',
      ...style
    }}>
      {children}
    </div>
  );
}

export function CardRow({ label, value, subtext }: { label: ReactNode; value: ReactNode; subtext?: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: subtext ? 'flex-start' : 'center',
      padding: '8px 0',
      borderBottom: '1px solid var(--border)',
      fontSize: '13px'
    }} className="card-row">
      <div style={{ display: 'flex', flexDirection: 'column', paddingRight: '12px' }}>
        <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
        {subtext && <span style={{ color: 'var(--text-dim)', fontSize: '10px', marginTop: '2px', lineHeight: 1.3 }}>{subtext}</span>}
      </div>
      <span style={{ fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', marginTop: subtext ? '1px' : 0 }}>{value}</span>
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div style={{
      fontSize: '10px',
      fontWeight: 700,
      letterSpacing: '1.2px',
      textTransform: 'uppercase',
      color: 'var(--text-dim)',
      marginBottom: '12px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    }}>
      <div style={{ width: '2px', height: '12px', background: 'var(--accent)', borderRadius: '1px' }}></div>
      {children}
    </div>
  );
}

export function Pill({ children, variant = 'blue' }: { children: ReactNode; variant?: 'green' | 'blue' | 'orange' | 'red' }) {
  const bgMap = {
    green: 'rgba(126, 231, 135, 0.1)',
    blue: 'rgba(79, 156, 249, 0.1)',
    orange: 'rgba(255, 166, 87, 0.1)',
    red: 'rgba(255, 123, 114, 0.1)'
  };
  const colorMap = {
    green: 'var(--accent2)',
    blue: 'var(--accent)',
    orange: 'var(--accent3)',
    red: 'var(--accent4)'
  };

  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: 600,
      background: bgMap[variant],
      color: colorMap[variant],
      border: `1px solid ${colorMap[variant]}33`
    }}>
      {children}
    </span>
  );
}
