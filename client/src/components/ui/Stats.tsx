import type { ReactNode } from 'react';

export function StatStrip({ children }: { children: ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '8px',
      marginBottom: '16px'
    }}>
      {children}
    </div>
  );
}

export function StatTile({ value, label, color = "var(--text)" }: { value: ReactNode, label: string, color?: string }) {
  return (
    <div style={{
      background: 'var(--surface2)',
      backdropFilter: 'var(--glass-blur)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      padding: '12px',
      textAlign: 'center',
      boxShadow: 'var(--shadow)'
    }}>
      <div style={{ fontSize: '22px', fontWeight: 800, color, letterSpacing: '-0.5px' }}>{value}</div>
      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-dim)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
    </div>
  );
}

export function BarWithCategory({ name, value, pct, bgProps }: { name: string, value: string, pct: number, bgProps?: string }) {
  return (
    <div style={{ marginBottom: '14px', group: 'true' } as any}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
        <span style={{ color: 'var(--text)', fontWeight: 500, textTransform: 'capitalize' }}>{name}</span>
        <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px' }}>{value}</span>
      </div>
      <div style={{ height: '8px', background: 'var(--surface2)', borderRadius: '4px', padding: '1px', overflow: 'hidden', border: '1px solid var(--border)' }}>
        <div style={{ 
           height: '100%', 
           borderRadius: '3px', 
           transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)', 
           width: `${pct}%`, 
           background: bgProps,
           boxShadow: `0 0 10px ${bgProps?.startsWith('linear') ? '#4f9cf933' : (bgProps + '33')}`
         }}></div>
      </div>
    </div>
  );
}
