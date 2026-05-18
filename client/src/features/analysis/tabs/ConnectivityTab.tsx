
import { useAnalysis } from '../../../context/AnalysisContext';
import { Card, CardRow, SectionTitle } from '../../../components/ui/Basic';
import { ScoreRing } from '../../../components/ui/ScoreRing';
import { BarChart } from '../../../components/ui/Charts';
import { fmt } from '../../../utils/formatters';

export function ConnectivityTab() {
  const { analysisData } = useAnalysis();
  if (!analysisData) return null;

  const d = analysisData.connectivity;
  const ci = d.connectivity_index || 0;
  
  const gradeColor = d.connectivity_grade === "Excellent" ? "#7ee787"
    : d.connectivity_grade === "Good" ? "#4f9cf9"
    : d.connectivity_grade === "Fair" ? "#ffa657" : "#ff7b72";

  const metrics = [
    { label: "Density Score", val: Math.min(100, d.road_density_km_per_km2 * 10) },
    { label: "Network Size",  val: Math.min(100, d.road_segments / 5) },
    { label: "Intersections", val: Math.min(100, d.intersection_count / 2) },
    { label: "Diversity",     val: Math.min(100, d.road_type_diversity * 10) },
  ];

  const chartData = {
    labels: metrics.map((m) => m.label),
    datasets: [{
      data: metrics.map((m) => Math.round(m.val)),
      backgroundColor: ["#4f9cf9", "#7ee787", "#ffa657", "#d2a8ff"],
      borderRadius: 6,
    }],
  };

  return (
    <>
      <div style={{ marginBottom: '20px' }}>
        <SectionTitle>Connectivity Index</SectionTitle>
        <ScoreRing score={ci} label={d.connectivity_grade} color={gradeColor} />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <SectionTitle>Network Metrics</SectionTitle>
        <Card>
          <CardRow label="Road Segments" value={fmt(d.road_segments)} subtext="Total individual street pieces" />
          <CardRow label="Total Road Length" value={fmt(d.total_road_km, "km")} subtext="Sum of all roads in the area" />
          <CardRow label="Road Density" value={fmt(d.road_density_km_per_km2, "km per sq.km")} subtext="Length of roads packed into 1 square kilometer" />
          <CardRow label="Intersections" value={fmt(d.intersection_count)} subtext="Walkability & connectivity nodes" />
          <CardRow label="Road Type Diversity" value={`${fmt(d.road_type_diversity)} types`} subtext="Mix of different transport modes" />
        </Card>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <SectionTitle>Density Analysis</SectionTitle>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.4 }}>
          Raw physical metrics converted into a <strong>0 to 100 performance score</strong>. This makes it instantly readable whether a site has poor infrastructure (low score) or highly integrated urban connectivity (near 100).
        </div>
        <BarChart data={chartData} size="160px" options={{
           plugins: { legend: { display: false } },
           scales: {
             x: { max: 100, ticks: { color: "#8b949e", font: { size: 10 } }, grid: { display: false } },
             y: { ticks: { color: "#8b949e", font: { size: 10 } }, grid: { color: "#30363d" } },
           },
        }} />
      </div>
    </>
  );
}
