import { useAnalysis } from '../../../context/AnalysisContext';
import { Card, CardRow, SectionTitle } from '../../../components/ui/Basic';
import { fmt, fmtDist } from '../../../utils/formatters';
import { CheckCircle2 } from 'lucide-react';

export function RiskTab() {
  const { analysisData } = useAnalysis();
  if (!analysisData) return null;

  const d = analysisData.risk;
  const rs = d.risk_score || 0;
  const rColor = d.risk_level === "Low" ? "#7ee787" : d.risk_level === "Moderate" ? "#ffa657" : "#ff7b72";

  return (
    <>
      <div style={{ marginBottom: '20px' }}>
        <SectionTitle>Risk Assessment</SectionTitle>
        <Card style={{ textAlign: 'center', padding: '16px' }}>
          <div style={{ fontSize: '36px', fontWeight: 700, color: rColor }}>{rs}</div>
          <div style={{ fontSize: '13px', color: rColor, marginTop: '4px' }}>
            <span style={{ 
              display: 'inline-block', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
              background: `${rColor}22`, color: rColor 
            }}>
              {d.risk_level} Risk
            </span>
          </div>
          <div style={{ margin: '16px 0 12px' }}>
            <div style={{ 
              height: '12px', borderRadius: '6px', 
              background: 'linear-gradient(to right, #7ee787, #ffa657, #ff7b72)', 
              position: 'relative', overflow: 'hidden' 
            }}>
              <div style={{ 
                position: 'absolute', top: '-3px', width: '4px', height: '18px', 
                background: 'white', borderRadius: '2px', transition: 'left 1s ease', 
                boxShadow: '0 0 6px rgba(0, 0, 0, 0.6)', left: `calc(${rs}% - 2px)` 
              }}></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              <span>Low</span><span>Moderate</span><span>High</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '12px', lineHeight: 1.4 }}>
              Combined risk factors including proximity to industrial hazards, natural risk zones, and energy infrastructure.
            </div>
          </div>
        </Card>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <SectionTitle>Industrial / Hazard Zones</SectionTitle>
        <Card>
          {(d.industrial_risks || []).length > 0 ? d.industrial_risks.map((r, i) => (
            <CardRow key={i} label={r.risk_type} value={`${fmtDist(r.nearest_m)} · ${fmt(r.count)} zones`} />
          )) : (
            <p style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No industrial hazards found <CheckCircle2 size={14} style={{ marginLeft: 6 }} />
            </p>
          )}
        </Card>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <SectionTitle>Power Infrastructure</SectionTitle>
        <Card>
          {(d.power_infrastructure || []).length > 0 ? d.power_infrastructure.map((r, i) => (
            <CardRow key={i} label={r.power_type} value={fmt(r.count)} />
          )) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>None</p>
          )}
        </Card>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <SectionTitle>Emergency Services</SectionTitle>
        <Card>
          {(d.emergency_services || []).length > 0 ? d.emergency_services.map((r, i) => (
            <CardRow key={i} label={r.name || r.type || 'Emergency'} value={fmtDist(r.distance_m)} />
          )) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>None in radius</p>
          )}
        </Card>
      </div>
    </>
  );
}
