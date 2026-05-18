
import { useAnalysis } from '../../../context/AnalysisContext';
import { Card, CardRow, SectionTitle } from '../../../components/ui/Basic';
import { ScoreRing } from '../../../components/ui/ScoreRing';
import { BarChart } from '../../../components/ui/Charts';
import { StatStrip, StatTile } from '../../../components/ui/Stats';
import { fmt, fmtDist } from '../../../utils/formatters';

export function TransportTab() {
  const { analysisData } = useAnalysis();
  if (!analysisData) return null;

  const d = analysisData.transport;
  const roads = d.road_types || [];
  const t = d.transit || {};
  const ws = d.walkability_score || 0;

  const wsColor = ws >= 70 ? "#7ee787" : ws >= 40 ? "#ffa657" : "#ff7b72";

  const topRoads = roads.slice(0, 6);
  const chartLabels = topRoads.map((r) => r.road_type);
  const chartVals = topRoads.map((r) => (parseFloat(r.total_length_m.toString()) / 1000).toFixed(2));

  const chartData = {
    labels: chartLabels,
    datasets: [{ data: chartVals, backgroundColor: "#4f9cf9", borderRadius: 4 }],
  };

  return (
    <>
      <StatStrip>
        <StatTile value={fmt(t.bus_stops)} label="Bus Stops" color="#4f9cf9" />
        <StatTile value={fmt(t.rail_stops)} label="Rail Stops" color="#7ee787" />
        <StatTile value={fmtDist(d.total_road_length_m)} label="Road Length" color="#ffa657" />
      </StatStrip>

      <div style={{ marginBottom: '20px' }}>
        <SectionTitle>Walkability Score</SectionTitle>
        <ScoreRing score={ws} label="/ 100" color={wsColor} />
        <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
          Pedestrian friendliness based on intersections and transit proximity.
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <SectionTitle>Road Types (km)</SectionTitle>
        <BarChart data={chartData} size="160px" />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <SectionTitle>Road Breakdown</SectionTitle>
        <Card>
          {roads.length > 0 ? roads.slice(0, 8).map((r, i) => (
            <CardRow key={i} label={r.road_type} value={`${(parseFloat(r.total_length_m.toString()) / 1000).toFixed(2)} km`} />
          )) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No road data</p>
          )}
        </Card>
      </div>
    </>
  );
}
