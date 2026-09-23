// A tiny pixel-art renderer for Venture's street scene. Everything is drawn
// with rectangles at a fixed low resolution and scaled up without smoothing,
// so it stays crisp at any size. Sprites are strings: one character per
// pixel, looked up in a palette; '.' is transparent.

export const W = 256,
  H = 144;

export type Ctx = CanvasRenderingContext2D;
export type Palette = Record<string, string>;

export function sprite(ctx: Ctx, rows: string[], x: number, y: number, pal: Palette, flip = false) {
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j];
    for (let i = 0; i < row.length; i++) {
      const c = row[flip ? row.length - 1 - i : i];
      if (c === '.' || c === ' ') continue;
      const color = pal[c];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x) + i, Math.round(y) + j, 1, 1);
    }
  }
}
export const rect = (ctx: Ctx, x: number, y: number, w: number, h: number, color: string) => {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

// ---------- Sprites ----------

// People: head, shirt, legs. Two walking frames and a standing one.
export const PERSON = {
  stand: ['.hh.', 'hhhh', '.ss.', 'tttt', 'tttt', '.tt.', '.ll.', '.l.l'],
  walkA: ['.hh.', 'hhhh', '.ss.', 'tttt', 'tttt', '.tt.', '.ll.', 'l..l'],
  walkB: ['.hh.', 'hhhh', '.ss.', 'tttt', 'tttt', '.tt.', '.ll.', '.ll.'],
};
export const HAIR = ['#2b1d16', '#4a3222', '#a0522d', '#d8b36a', '#1b1b1f', '#7b4a2b', '#c9c3bb'];
export const SKIN = ['#f1c9a5', '#d8a47f', '#b27b57', '#8a5a3c', '#5e3b27'];
export const SHIRT = ['#e46a4f', '#4f8fe4', '#5fbf7a', '#e4c14f', '#a26be4', '#e47fb5', '#3fb8c4', '#f08a3c'];
export const LEGS = ['#2d3350', '#3a3a3a', '#5a4632', '#27405a'];

export const MOON = ['..mmm..', '.mmmmm.', 'mmmcmmm', 'mmmmmcm', 'mcmmmmm', '.mmmmm.', '..mmm..'];
export const SUN = ['..ooo..', '.ooooo.', 'ooooooo', 'ooooooo', 'ooooooo', '.ooooo.', '..ooo..'];
export const CUP = ['.w.w.', '..w..', 'ccccc', 'cbbbc', 'cbbbc', '.ccc.'];
export const COIN = ['.yy.', 'yooy', 'yooy', '.yy.'];
export const HEART = ['r.r', 'rrr', '.r.'];
export const BANG = ['r', 'r', '.', 'r'];
export const FLAKE = ['.w.', 'www', '.w.'];
export const LEAF = ['oo', '.o'];
export const PLANT = ['.gg.', 'gggg', '.gg.', '.pp.', 'pppp'];
export const MONITOR = ['kkkkk', 'kbbbk', 'kbbbk', 'kkkkk', '..k..', '.kkk.'];

// A small bitmap font for signs (3x5), so no web font is needed on canvas.
const GLYPHS: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], N: ['##.', '#.#', '#.#', '#.#', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'], '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'], '2': ['##.', '..#', '.#.', '#..', '###'], '3': ['##.', '..#', '.#.', '..#', '##.'],
  '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '##.', '..#', '##.'], '6': ['.##', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'], '8': ['###', '#.#', '###', '#.#', '###'], '9': ['###', '#.#', '###', '..#', '##.'],
  '&': ['.#.', '#.#', '.#.', '#.#', '.##'], '.': ['...', '...', '...', '...', '.#.'], "'": ['.#.', '.#.', '...', '...', '...'],
  '-': ['...', '...', '###', '...', '...'], ' ': ['...', '...', '...', '...', '...'], '$': ['.##', '##.', '.#.', '.##', '##.'],
  '+': ['...', '.#.', '###', '.#.', '...'],
};
export function textWidth(s: string) {
  return s.length * 4 - 1;
}
export function text(ctx: Ctx, s: string, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  const up = s.toUpperCase();
  for (let n = 0; n < up.length; n++) {
    const g = GLYPHS[up[n]] || GLYPHS[' '];
    for (let j = 0; j < 5; j++)
      for (let i = 0; i < 3; i++) if (g[j][i] === '#') ctx.fillRect(Math.round(x) + n * 4 + i, Math.round(y) + j, 1, 1);
  }
}
// Fit a name onto a sign: drop to initials-ish if it's too long.
export function signText(name: string, max: number) {
  const clean = name.toUpperCase().replace(/[^A-Z0-9&.' $+-]/g, '').trim() || 'OPEN';
  if (textWidth(clean) <= max) return clean;
  const words = clean.split(/\s+/);
  const first = words[0];
  if (textWidth(first) <= max) return first;
  return first.slice(0, Math.max(1, Math.floor((max + 1) / 4)));
}

// Seeded randomness so a company's scene looks the same every visit.
export function seeded(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
