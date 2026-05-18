
import { useAnalysis } from '../../../context/AnalysisContext';
import { SectionTitle } from '../../../components/ui/Basic';
import { ScoreRing } from '../../../components/ui/ScoreRing';
import { RadarChart } from '../../../components/ui/Charts';
import { BarWithCategory } from '../../../components/ui/Stats';

const COLORS: Record<string, string> = { A: "#7ee787", B: "#4f9cf9", C: "#ffa657", D: "#ff7b72" };

export function AmenityTab() {
  const { analysisData } = useAnalysis();
  if (!analysisData) return null;

  const d = analysisData.amenity;
  const gradeColor = COLORS[d.grade] || "#8b949e";
  const cats = d.breakdown || [];

  const chartData = {
    labels: cats.map((c) => c.key),
    datasets: [{
      label: "Score", data: cats.map((c) => c.score),
      backgroundColor: "rgba(79,156,249,0.15)",
      borderColor: "#4f9cf9", pointBackgroundColor: "#4f9cf9",
    }],
  };

  return (
    <>
      <div style={{ marginBottom: '20px' }}>
        <SectionTitle>Amenity Score</SectionTitle>
        <ScoreRing score={d.total_score} maxScore={100} label={`Grade ${d.grade}`} color={gradeColor} />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <SectionTitle>Category Breakdown</SectionTitle>
        <RadarChart data={chartData} size="200px" />
        
        {cats.map((c, i) => {
          const pct = (c.score / 20) * 100;
          return (
            <BarWithCategory 
              key={i} 
              name={c.key} 
              value={`${c.count} found · ${c.score} pts`} 
              pct={pct} 
              bgProps="linear-gradient(90deg,#4f9cf9,#7ee787)" 
            />
          );
        })}
      </div>
    </>
  );
}
