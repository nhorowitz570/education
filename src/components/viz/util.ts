'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Tone } from '@/lib/viz/schema';
import { reducedMotion } from '@/lib/client/motion';

// Specs come from a model: every accessor below tolerates missing or
// malformed data so a renderer never throws.
export const arr = <T>(x: T[] | null | undefined): T[] => (Array.isArray(x) ? x : []);
export const str = (x: unknown): string => (typeof x === 'string' ? x : x == null ? '' : String(x));
export const num = (x: unknown, d = 0): number =>
  typeof x === 'number' && Number.isFinite(x) ? x : d;
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const TONES = new Set(['default', 'accent', 'positive', 'negative', 'muted']);
export const toneOf = (t: unknown): Tone => (TONES.has(t as string) ? (t as Tone) : 'default');
export const tc = (t: unknown) => `tone-${toneOf(t)}`;

// ---------- Numbers ----------
const MINUS = '−';
const nf = (max: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: max });
const NF = [nf(0), nf(1), nf(2)];
const PREFIX = /^[$€£¥]$/;

/** Plain magnitude with separators; ≥1M collapses to 1.2M / 3.4B. */
function magnitude(a: number, compact = false): string {
  if (a >= 1e9) return NF[1].format(a / 1e9) + 'B';
  if (a >= 1e6) return NF[1].format(a / 1e6) + 'M';
  if (compact && a >= 1e4) return NF[0].format(a / 1e3) + 'k';
  if (compact && a >= 1e3) return NF[1].format(a / 1e3) + 'k';
  return NF[a >= 100 ? 0 : a >= 10 ? 1 : 2].format(a);
}

/** "$" (and €£¥) prefix, "%" suffix, anything else suffixed with a thin space. */
export function fmt(v: number, unit = '', opts: { compact?: boolean; sign?: boolean } = {}): string {
  if (!Number.isFinite(v)) return '—';
  const u = str(unit).trim();
  const sign = v < 0 ? MINUS : opts.sign && v > 0 ? '+' : '';
  const m = magnitude(Math.abs(v), opts.compact);
  if (PREFIX.test(u)) return `${sign}${u}${m}`;
  if (u === '%') return `${sign}${m}%`;
  return u ? `${sign}${m} ${u}` : `${sign}${m}`;
}

/** Accounting style for statements: negatives in parentheses. */
export function fmtAcct(v: number, unit = ''): string {
  if (!Number.isFinite(v)) return '—';
  const s = fmt(Math.abs(v), unit);
  return v < 0 ? `(${s})` : s;
}

/** Evenly spaced "nice" ticks covering [lo, hi]. Never divides by zero. */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (lo > hi) [lo, hi] = [hi, lo];
  if (lo === hi) {
    const pad = Math.abs(lo) * 0.1 || 1;
    lo -= pad;
    hi += pad;
  }
  const raw = (hi - lo) / count;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw;
  const start = Math.floor(lo / step + 1e-9) * step;
  const end = Math.ceil(hi / step - 1e-9) * step;
  const out: number[] = [];
  for (let t = start; t <= end + step * 1e-6 && out.length < 12; t += step)
    out.push(Math.round(t / step) * step);
  return out;
}

// ---------- Curves ----------
/** Monotone cubic (Fritsch–Carlson) through points sorted by x. */
export function monotonePath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${pts[0].x},${pts[0].y}`;
  const f = (v: number) => Math.round(v * 100) / 100;
  if (n === 2) return `M${f(pts[0].x)},${f(pts[0].y)}L${f(pts[1].x)},${f(pts[1].y)}`;
  const dx: number[] = [],
    s: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x || 1e-6;
    s[i] = (pts[i + 1].y - pts[i].y) / dx[i];
  }
  const m: number[] = [s[0]];
  for (let i = 1; i < n - 1; i++) {
    if (s[i - 1] * s[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * dx[i] + dx[i - 1],
        w2 = dx[i] + 2 * dx[i - 1];
      m[i] = (w1 + w2) / (w1 / s[i - 1] + w2 / s[i]);
    }
  }
  m[n - 1] = s[n - 2];
  let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${f(pts[i].x + h)},${f(pts[i].y + m[i] * h)} ${f(pts[i + 1].x - h)},${f(
      pts[i + 1].y - m[i + 1] * h,
    )} ${f(pts[i + 1].x)},${f(pts[i + 1].y)}`;
  }
  return d;
}

// ---------- Measuring ----------
const useIso = typeof window === 'undefined' ? useEffect : useLayoutEffect;

// Text is measured for layout, so wait for web fonts (capped at 1s).
let fontsReady = typeof document === 'undefined' || !document.fonts;
const fontsLoaded =
  typeof document !== 'undefined' && document.fonts
    ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1000))]).then(() => {
        fontsReady = true;
      })
    : Promise.resolve();

/** Content width of an element, tracked with ResizeObserver (0 until mounted and fonts load). */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useIso(() => {
    const el = ref.current;
    if (!el) return;
    let live = true;
    const measure = () => live && setW(Math.floor(el.getBoundingClientRect().width));
    if (fontsReady) measure();
    else fontsLoaded.then(measure);
    const ro = new ResizeObserver(([e]) => fontsReady && setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => {
      live = false;
      ro.disconnect();
    };
  }, []);
  return [ref, w] as const;
}

let ctx: CanvasRenderingContext2D | null | undefined;
let family = '';
/** Approximate rendered text width for layout (canvas; char-count fallback). */
export function textWidth(text: string, size = 13, weight = 400): number {
  if (typeof document !== 'undefined' && ctx === undefined) {
    ctx = document.createElement('canvas').getContext('2d');
    family = getComputedStyle(document.body).fontFamily || 'sans-serif';
  }
  if (!ctx) return text.length * size * 0.52;
  ctx.font = `${weight} ${size}px ${family}`;
  return ctx.measureText(text).width;
}

/** Truncate to fit `max` px, adding an ellipsis. */
export function fit(text: string, max: number, size = 13, weight = 400): string {
  if (textWidth(text, size, weight) <= max) return text;
  let lo = 0,
    hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (textWidth(text.slice(0, mid) + '…', size, weight) <= max) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo).trimEnd() + '…';
}

// ---------- Motion ----------
export { reducedMotion };

/** Tween a number toward `target` over ~180ms; jumps when motion is reduced. */
export function useTween(target: number, ms = 180): number {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    if (!Number.isFinite(target) || !Number.isFinite(start) || reducedMotion() || start === target) {
      from.current = target;
      setV(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms),
        e = 1 - (1 - p) ** 3;
      const cur = start + (target - start) * e;
      from.current = cur;
      setV(cur);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/** Place label boxes greedily, trying candidates in order; returns chosen index per item. */
export type Box = { x: number; y: number; w: number; h: number };
export const overlaps = (a: Box, b: Box, pad = 2) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
