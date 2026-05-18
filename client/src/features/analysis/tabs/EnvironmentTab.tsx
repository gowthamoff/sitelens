
import { useAnalysis } from '../../../context/AnalysisContext';
import { Card, CardRow, SectionTitle } from '../../../components/ui/Basic';
import { DoughnutChart } from '../../../components/ui/Charts';
import { StatStrip, StatTile } from '../../../components/ui/Stats';
import { fmt, fmtDist, fmtArea } from '../../../utils/formatters';

export function EnvironmentTab() {
  const { analysisData } = useAnalysis();
  if (!analysisData) return null;

  const d = analysisData.environment;
  const s = d.summary || {};

  const waterCov = Math.min(100, s.water_coverage_pct ?? 0);
  const greenCov = Math.min(100 - waterCov, s.green_coverage_pct ?? 0);
  const otherCov = Math.max(0, 100 - waterCov - greenCov);

  const chartData = {
    labels: ["Water", "Green", "Other"],
    datasets: [{
      data: [waterCov, greenCov, otherCov],
      backgroundColor: ["#4fc3f7", "#7ee787", "#30363d"],
      borderWidth: 2, borderColor: "#161b22",
    }],
  };

  return (
    <>
      <StatStrip>
        <StatTile value={`${waterCov}%`} label="Water Cover" color="#4fc3f7" />
        <StatTile value={`${greenCov}%`} label="Green Cover" color="#7ee787" />
        <StatTile value={fmtArea(s.total_green_area_m2)} label="Green Area" color="#ffa657" />
      </StatStrip>

      <div style={{ marginBottom: '20px' }}>
        <SectionTitle>Water Coverage vs Green Space</SectionTitle>
        <DoughnutChart data={chartData} size="160px" options={{ cutout: "60%" }} />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <SectionTitle>Water Bodies</SectionTitle>
        <Card>
          {(d.water_bodies || []).length > 0 ? d.water_bodies.map((r, i) => (
            <CardRow key={i} label={r.water_type} value={fmtArea(r.area_m2)} />
          )) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>None found</p>
          )}
        </Card>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <SectionTitle>Green Spaces</SectionTitle>
        <Card>
          {(d.green_spaces || []).length > 0 ? d.green_spaces.map((r, i) => (
            <CardRow key={i} label={r.green_type} value={fmtArea(r.area_m2)} />
          )) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>None found</p>
          )}
        </Card>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <SectionTitle>Nearest Waterways</SectionTitle>
        <Card>
          {(d.nearby_waterways || []).length > 0 ? d.nearby_waterways.slice(0, 5).map((r, i) => (
            <CardRow key={i} label={r.name || r.waterway || "Unnamed"} value={fmtDist(r.distance_m)} />
          )) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>None found</p>
          )}
        </Card>
      </div>
    </>
  );
}
