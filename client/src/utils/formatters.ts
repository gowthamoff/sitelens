export function fmt(n: number | string | null | undefined, unit: string = ""): string {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString() + (unit ? " " + unit : "");
}

export function fmtDist(m: number | string | null | undefined): string {
  if (m === null || m === undefined) return "—";
  const num = Number(m);
  return `${(num / 1000).toFixed(2)} km`;
}

export function fmtArea(m2: number | string | null | undefined): string {
  if (m2 === null || m2 === undefined) return "—";
  const num = Number(m2);
  const km2 = num / 1000000;
  return km2 < 0.01 ? `${km2.toFixed(4)} km²` : `${km2.toFixed(2)} km²`;
}
