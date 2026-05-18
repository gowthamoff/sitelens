
import { useAnalysis } from '../../../context/AnalysisContext';
import { Card, CardRow, SectionTitle } from '../../../components/ui/Basic';
import { DoughnutChart } from '../../../components/ui/Charts';
import { BarWithCategory } from '../../../components/ui/Stats';
import { fmt, fmtArea } from '../../../utils/formatters';
import { getLanduseColor } from '../../../config/constants';

export function LandUseTab() {
  const { analysisData } = useAnalysis();
  if (!analysisData) return null;

  const { breakdown, buildings } = analysisData.landuse;
  const b = buildings || {};

  const labels  = breakdown.map((r) => r.category);
  const vals    = breakdown.map((r) => parseFloat(r.area_m2.toString()));
  const colors  = breakdown.map((r, i) => getLanduseColor(r.category, i));

  const chartData = {
    labels,
    datasets: [{ data: vals, backgroundColor: colors, borderWidth: 2, borderColor: '#161b22' }],
  };

  return (
    <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{ marginBottom: '24px' }}>
        <SectionTitle>Land Use Composition</SectionTitle>
        <Card style={{ padding: '20px' }}>
          <DoughnutChart data={chartData} options={{
            plugins: {
              tooltip: {
                callbacks: { label: (c: any) => ` ${c.label}: ${fmtArea(c.parsed)}` },
              },
            },
          }} size="240px" />

          <div style={{ marginTop: '20px' }}>
            {breakdown.slice(0, 8).map((r, i) => (
              <BarWithCategory
                key={i}
                name={r.category}
                value={`${parseFloat(r.pct.toString()).toFixed(1)}%`}
                pct={r.pct}
                bgProps={getLanduseColor(r.category, i)}
              />
            ))}
          </div>
        </Card>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <SectionTitle>Building Footprint</SectionTitle>
        <Card>
          <CardRow label="Building Count" value={fmt(b.building_count)} subtext="Total structures detected in area" />
          <CardRow label="Total Footprint" value={fmtArea(b.total_footprint_m2)} subtext="Ground area covered by buildings" />
          <CardRow label="Avg Footprint" value={fmtArea(b.avg_footprint_m2)} subtext="Typical ground size of structures" />
          <CardRow label="Coverage" value={fmt(b.coverage_pct, "%")} subtext="Percentage of land built upon" />
        </Card>
      </div>
    </div>
  );
}
