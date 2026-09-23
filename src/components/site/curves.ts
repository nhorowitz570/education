// Chart geometry for the public pages. Paths are computed at render time so
// the marketing charts ship as plain SVG, with no charting code on the client.

type Point = readonly [number, number];
// One decimal is plenty for SVG, and keeps server and browser output identical.
const round = (n: number) => Math.round(n * 10) / 10;

// Catmull-Rom through every point, emitted as cubic Béziers: the line passes
// through the data exactly but never turns a sharp corner.
export function smoothPath(points: readonly Point[]) {
  const f = (n: number) => n.toFixed(1);
  let d = `M${f(points[0][0])} ${f(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i],
      p1 = points[i],
      p2 = points[i + 1],
      p3 = points[i + 2] ?? p2;
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

export function areaPath(points: readonly Point[], floor: number) {
  const last = points[points.length - 1];
  return `${smoothPath(points)}L${last[0].toFixed(1)} ${floor}L${points[0][0].toFixed(1)} ${floor}Z`;
}

// Illustrative recall over 30 days, with and without spaced reviews. A
// power-law decay whose stability grows at each review, lightly blurred so
// the review moments read as rounded peaks rather than a sawtooth.
export function forgettingCurve(width: number, height: number) {
  const DAYS = 30,
    top = 24,
    floor = height - 30,
    x = (d: number) => (d / DAYS) * (width - 8) + 2,
    y = (r: number) => floor - r * (floor - top),
    recall = (t: number, s: number) => (1 + t / (1.6 * s)) ** -1.35,
    reviews = [1, 3.5, 9.5, 24.5],
    stability = [0.7, 2.2, 5.5, 14, 36],
    RISE = 0.55,
    starts = [0, ...reviews.map((r) => r + RISE)],
    decay = (k: number, d: number) => recall(Math.max(0, d - starts[k]), stability[k]);
  const withReview = (d: number) => {
    const k = reviews.filter((r) => d >= r).length;
    if (k && d < reviews[k - 1] + RISE) {
      const r = reviews[k - 1],
        low = decay(k - 1, r),
        u = (d - r) / RISE;
      return low + (1 - low) * u * u * (3 - 2 * u);
    }
    return decay(k, d);
  };
  const step = 0.02,
    n = Math.round(DAYS / step) + 1,
    raw = Array.from({ length: n }, (_, i) => withReview(i * step)),
    sigma = 0.16 / step,
    radius = Math.ceil(sigma * 3),
    kernel = Array.from({ length: radius * 2 + 1 }, (_, j) =>
      Math.exp(-0.5 * ((j - radius) / sigma) ** 2),
    ),
    smooth = raw.map((_, i) => {
      let sum = 0,
        weight = 0;
      kernel.forEach((k, j) => {
        sum += raw[Math.min(n - 1, Math.max(0, i + j - radius))] * k;
        weight += k;
      });
      return sum / weight;
    });
  smooth[0] = 1;
  const points: Point[] = [];
  for (let i = 0; i < n; i += 4) points.push([x(i * step), y(smooth[i])]);
  const peaks = reviews.map((r) => {
    let best = Math.round(r / step);
    for (let i = best; i < Math.min(n, Math.round((r + RISE + 0.6) / step)); i++)
      if (smooth[i] > smooth[best]) best = i;
    return [round(x(best * step)), round(y(smooth[best]))] as Point;
  });
  const plain: Point[] = [];
  for (let d = 0; d <= 2; d += 0.05) plain.push([x(d), y(recall(d, 0.7))]);
  for (let d = 2.25; d <= DAYS; d += 0.25) plain.push([x(d), y(recall(d, 0.7))]);
  return {
    line: smoothPath(points),
    area: areaPath(points, floor),
    plain: smoothPath(plain),
    peaks,
    grid: [0.25, 0.5, 0.75, 1].map(y),
    ticks: [0, 7, 14, 21, 28].map((d) => ({ d, x: x(d) })),
    floor,
    labelWithout: { x: x(19), y: y(recall(19, 0.7)) - 14 },
  };
}

// A learner's estimate on one idea across eight answers.
export const EVIDENCE = [
  { p: 0.12, kind: 'right' },
  { p: 0.3, kind: 'right' },
  { p: 0.47, kind: 'right' },
  { p: 0.4, kind: 'missed' },
  { p: 0.62, kind: 'hint' },
  { p: 0.78, kind: 'right' },
  { p: 0.86, kind: 'right' },
  { p: 0.9, kind: 'right' },
] as const;

export function evidenceChart(width: number, height: number, left = 0, pad = 8) {
  const floor = height - pad,
    top = pad,
    x = (i: number) => left + pad + (i * (width - left - pad * 2)) / (EVIDENCE.length - 1),
    y = (p: number) => floor - p * (floor - top),
    points = EVIDENCE.map((e, i) => [x(i), y(e.p)] as Point);
  return {
    line: smoothPath(points),
    area: areaPath(points, height),
    dots: EVIDENCE.map((e, i) => ({ ...e, x: round(points[i][0]), y: round(points[i][1]) })),
    y,
  };
}
