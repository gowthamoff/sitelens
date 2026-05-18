
import { 
  Chart as ChartJS, 
  ArcElement, Tooltip, Legend, 
  CategoryScale, LinearScale, BarElement, RadialLinearScale, PointElement, LineElement 
} from 'chart.js';
import { Doughnut, Bar, Radar } from 'react-chartjs-2';

ChartJS.register(
  ArcElement, Tooltip, Legend, 
  CategoryScale, LinearScale, BarElement, RadialLinearScale, PointElement, LineElement
);

export function DoughnutChart({ data, options, size = '220px' }: { data: any, options?: any, size?: string }) {
  return (
    <div style={{ position: 'relative', height: size, margin: '16px 0', padding: '0 8px' }}>
      <Doughnut data={data} options={{
        responsive: true,
        maintainAspectRatio: false,
        cutout: "75%",
        spacing: 4,
        plugins: {
          legend: { 
            position: "right", 
            align: "center",
            labels: { 
              color: "#f0f6fc", 
              usePointStyle: true,
              pointStyle: "circle",
              padding: 12,
              font: { size: 11, weight: "500", family: "'Inter', sans-serif" }, 
              boxWidth: 8,
              boxHeight: 8
            },
          },
          tooltip: {
            backgroundColor: 'rgba(22, 27, 34, 0.95)',
            borderColor: '#30363d',
            borderWidth: 1,
            titleColor: '#f0f6fc',
            bodyColor: '#8b949e',
            padding: 10,
            cornerRadius: 8,
            displayColors: true,
          }
        },
        ...options
      }} />
    </div>
  );
}

export function BarChart({ data, options, size = '160px' }: { data: any, options?: any, size?: string }) {
  return (
    <div style={{ position: 'relative', height: size, margin: '8px 0' }}>
      <Bar data={data} options={{
        responsive: true, maintainAspectRatio: false, indexAxis: "y",
        barThickness: 12,
        maxBarThickness: 20,
        plugins: { legend: { display: false } },
        scales: {
          x: { 
            min: 0,
            max: 100,
            ticks: { color: "#8b949e", font: { size: 10 } }, 
            grid: { color: "#30363d" } 
          },
          y: { ticks: { color: "#e6edf3", font: { size: 11 } }, grid: { display: false } },
        },
        ...options
      }} />
    </div>
  );
}

export function RadarChart({ data, options, size = '200px' }: { data: any, options?: any, size?: string }) {
  return (
    <div style={{ position: 'relative', height: size, margin: '8px 0' }}>
      <Radar data={data} options={{
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            ticks: { color: "#8b949e", backdropColor: "transparent", font: { size: 10 } },
            grid: { color: "#30363d" },
            angleLines: { color: "#30363d" },
            pointLabels: { color: "#e6edf3", font: { size: 11 } },
          },
        },
        ...options
      }} />
    </div>
  );
}
