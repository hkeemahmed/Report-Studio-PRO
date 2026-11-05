export type ChartType = "bar" | "line" | "pie" | "scatter";
export interface ChartSeries { name: string; data: number[] }
export interface ChartSpec { type: ChartType; title: string; labels: string[]; series: ChartSeries[]; xLabel?: string; yLabel?: string }

export const CHART_COLORS = ["#2563eb", "#7c3aed", "#059669", "#d97706", "#dc2626", "#0891b2", "#db2777", "#4b5563"];
const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v)!;
}

/** Render a chart spec to a standalone SVG string (used in the editor and rasterised to PNG for export). */
export function renderChartSVG(spec: ChartSpec, width = 640, height = 380): string {
  const W = width, H = height, pad = { l: 56, r: 20, t: spec.title ? 44 : 20, b: 56 };
  const font = `font-family="Cairo, 'Noto Sans Arabic', Arial, sans-serif"`;
  let body = "";
  const legend = () => spec.series.map((s, i) =>
    `<rect x="${pad.l + i * 120}" y="${H - 18}" width="10" height="10" fill="${CHART_COLORS[i % 8]}"/><text x="${pad.l + i * 120 + 14}" y="${H - 9}" font-size="11" ${font}>${esc(s.name)}</text>`).join("");
  if (spec.type === "pie") {
    const data = spec.series[0]?.data || [];
    const total = data.reduce((a, b) => a + Math.max(0, b), 0) || 1;
    const cx = W / 2 - 60, cy = (H + pad.t) / 2, r = Math.min(W, H - pad.t) / 2 - 30;
    let a0 = -Math.PI / 2;
    data.forEach((v, i) => {
      const a1 = a0 + (Math.max(0, v) / total) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a: number) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
      body += data.length === 1 ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${CHART_COLORS[0]}"/>`
        : `<path d="M${cx},${cy} L${p(a0)} A${r},${r} 0 ${large} 1 ${p(a1)} Z" fill="${CHART_COLORS[i % 8]}" stroke="#fff" stroke-width="2"/>`;
      body += `<rect x="${W - 160}" y="${pad.t + i * 22}" width="12" height="12" fill="${CHART_COLORS[i % 8]}"/><text x="${W - 142}" y="${pad.t + i * 22 + 11}" font-size="12" ${font}>${esc(spec.labels[i] ?? "")} (${Math.round((v / total) * 1000) / 10}%)</text>`;
      a0 = a1;
    });
  } else {
    const all = spec.series.flatMap((s) => s.data).filter((v) => isFinite(v));
    const max = niceMax(Math.max(0, ...all)), min = Math.min(0, ...all);
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    const y = (v: number) => pad.t + ph - ((v - min) / (max - min || 1)) * ph;
    for (let i = 0; i <= 5; i++) {
      const v = min + ((max - min) * i) / 5;
      body += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="#e2e8f0"/><text x="${pad.l - 8}" y="${y(v) + 4}" font-size="11" text-anchor="end" ${font}>${Math.round(v * 100) / 100}</text>`;
    }
    const n = Math.max(1, spec.labels.length);
    const slot = pw / n;
    if (spec.type === "bar") {
      const bw = (slot * 0.7) / Math.max(1, spec.series.length);
      spec.series.forEach((s, si) => s.data.forEach((v, i) => {
        const x = pad.l + i * slot + slot * 0.15 + si * bw;
        body += `<rect x="${x}" y="${Math.min(y(v), y(0))}" width="${bw - 2}" height="${Math.abs(y(0) - y(v))}" fill="${CHART_COLORS[si % 8]}" rx="2"/>`;
      }));
    } else {
      spec.series.forEach((s, si) => {
        const pts = s.data.map((v, i) => [spec.type === "scatter" && spec.labels.every((l) => !isNaN(+l))
          ? pad.l + ((+spec.labels[i] - Math.min(...spec.labels.map(Number))) / ((Math.max(...spec.labels.map(Number)) - Math.min(...spec.labels.map(Number))) || 1)) * pw
          : pad.l + i * slot + slot / 2, y(v)]);
        if (spec.type === "line") body += `<polyline fill="none" stroke="${CHART_COLORS[si % 8]}" stroke-width="2.5" points="${pts.map((p) => p.join(",")).join(" ")}"/>`;
        pts.forEach(([px, py]) => (body += `<circle cx="${px}" cy="${py}" r="${spec.type === "scatter" ? 4.5 : 3.5}" fill="${CHART_COLORS[si % 8]}"/>`));
      });
    }
    spec.labels.forEach((l, i) => (body += `<text x="${pad.l + i * slot + slot / 2}" y="${H - pad.b + 18}" font-size="11" text-anchor="middle" ${font}>${esc(l)}</text>`));
    body += `<line x1="${pad.l}" x2="${pad.l}" y1="${pad.t}" y2="${pad.t + ph}" stroke="#64748b"/><line x1="${pad.l}" x2="${W - pad.r}" y1="${y(0)}" y2="${y(0)}" stroke="#64748b"/>`;
    if (spec.series.length > 1) body += legend();
  }
  const title = spec.title ? `<text x="${W / 2}" y="26" font-size="16" font-weight="700" text-anchor="middle" ${font}>${esc(spec.title)}</text>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#ffffff"/>${title}${body}</svg>`;
}

/** Rasterise an SVG string to a PNG data URI (browser only). */
export async function svgToPng(svg: string, scale = 2): Promise<string> {
  const img = new Image();
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("SVG render failed")); img.src = url; });
  const c = document.createElement("canvas");
  c.width = img.width * scale; c.height = img.height * scale;
  const ctx = c.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0);
  return c.toDataURL("image/png");
}

export function parseCSV(text: string): ChartSpec | null {
  const rows = text.trim().split(/\r?\n/).map((r) => r.split(/[,\t;]/).map((c) => c.trim()));
  if (rows.length < 2 || rows[0].length < 2) return null;
  const [head, ...data] = rows;
  return {
    type: "bar", title: "", labels: data.map((r) => r[0]),
    series: head.slice(1).map((name, i) => ({ name, data: data.map((r) => parseFloat(r[i + 1]) || 0) })),
  };
}
