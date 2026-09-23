'use client';
import { useEffect, useRef } from 'react';
import type { KindId } from '@/lib/venture/engine';
import {
  BANG,
  COIN,
  CUP,
  FLAKE,
  H,
  HAIR,
  HEART,
  LEAF,
  LEGS,
  MONITOR,
  MOON,
  PERSON,
  PLANT,
  SHIRT,
  SKIN,
  SUN,
  W,
  rect,
  seeded,
  signText,
  sprite,
  text,
  textWidth,
  type Ctx,
} from './pixel';
import { reducedMotion } from '@/lib/client/motion';

export type SceneProps = {
  kind: KindId;
  name: string;
  equipment: number;
  staff: number;
  busy: number; // 0..1, how lively the street is
  queue: boolean; // customers are being turned away
  reputation: number;
  calendar: number; // 0..11 in-game month, for the season
  playing?: boolean; // the month is running: days fly by
  still?: boolean; // a single frame (previews, reduced motion)
  label?: string;
};

type Walker = { x: number; y: number; dir: 1 | -1; speed: number; pal: Record<string, string>; enter: boolean; alpha: number; step: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; kind: 'coin' | 'heart' | 'steam' | 'snow' | 'leaf' | 'petal' };

const GROUND = 112;
const DOOR: Record<KindId, number> = { roastery: 150, studio: 160, truck: 132 };

// Sky colours through a day: night, dawn, day, dusk.
const SKY = [
  { at: 0, top: '#0b1030', bottom: '#1c2350' },
  { at: 0.23, top: '#2b2e6b', bottom: '#f09a7b' },
  { at: 0.32, top: '#5aa7e0', bottom: '#bfe3f2' },
  { at: 0.68, top: '#5aa7e0', bottom: '#cfe8f0' },
  { at: 0.78, top: '#3c3f86', bottom: '#f0875a' },
  { at: 0.88, top: '#0b1030', bottom: '#1c2350' },
  { at: 1, top: '#0b1030', bottom: '#1c2350' },
];
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) => {
  const x = hex(a),
    y = hex(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
};
function sky(phase: number) {
  let i = 0;
  while (i < SKY.length - 2 && SKY[i + 1].at <= phase) i++;
  const a = SKY[i],
    b = SKY[i + 1],
    t = (phase - a.at) / (b.at - a.at || 1);
  return { top: mix(a.top, b.top, t), bottom: mix(a.bottom, b.bottom, t) };
}
const nightness = (phase: number) => (phase < 0.25 || phase > 0.82 ? 1 : phase < 0.32 ? (0.32 - phase) / 0.07 : phase > 0.72 ? (phase - 0.72) / 0.1 : 0);

export function Scene(props: SceneProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  live.current = props;

  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext('2d')!;
    const rand = seeded(props.name + props.kind);
    const accent = SHIRT[Math.floor(rand() * SHIRT.length)];
    const stars = Array.from({ length: 28 }, () => ({ x: rand() * W, y: rand() * 60, p: rand() * 6 }));
    const skyline = Array.from({ length: 14 }, (_, i) => ({ x: i * 20 - 6, w: 16 + rand() * 10, h: 28 + rand() * 40, lit: Array.from({ length: 12 }, () => rand() > 0.55) }));
    const walkers: Walker[] = [];
    const particles: Particle[] = [];
    const reduce = reducedMotion();
    let frame = 0,
      last = 0,
      visible = true,
      stopped = false,
      coinsDue = 0;

    const newWalker = (fromEdge = true): Walker => {
      const dir = rand() > 0.5 ? 1 : -1;
      return {
        x: fromEdge ? (dir === 1 ? -6 : W + 2) : rand() * W,
        y: GROUND - 8 + Math.floor(rand() * 3),
        dir,
        speed: 0.18 + rand() * 0.2,
        pal: {
          h: HAIR[Math.floor(rand() * HAIR.length)],
          s: SKIN[Math.floor(rand() * SKIN.length)],
          t: SHIRT[Math.floor(rand() * SHIRT.length)],
          l: LEGS[Math.floor(rand() * LEGS.length)],
        },
        enter: rand() < 0.35 + live.current.busy * 0.4,
        alpha: 1,
        step: rand() * 10,
      };
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const scale = Math.max(1, Math.ceil((c.clientWidth * dpr) / W));
      c.width = W * scale;
      c.height = H * scale;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.imageSmoothingEnabled = false;
      draw(performance.now());
    };

    function draw(now: number) {
      const p = live.current;
      const clock = new Date();
      const phase = p.playing ? ((now / 1400) % 1 + 0.3) % 1 : p.still ? 0.5 : (clock.getHours() * 60 + clock.getMinutes()) / 1440;
      const night = nightness(phase);
      const sk = sky(phase);
      // Sky, in dithered bands.
      for (let b = 0; b < 8; b++) rect(ctx, 0, b * 11, W, 11, mix(sk.top, sk.bottom, b / 7));
      if (night > 0.3)
        for (const s of stars) if (Math.sin(now / 500 + s.p) > -0.3) rect(ctx, s.x, s.y, 1, 1, `rgba(255,255,230,${night * 0.9})`);
      // Sun or moon along an arc.
      const arc = (phase + 0.75) % 1;
      const sx = arc * (W + 40) - 20,
        sy = 70 - Math.sin(arc * Math.PI) * 58;
      if (night < 0.6) sprite(ctx, SUN, sx - 3, sy - 3, { o: '#ffe39a' });
      else {
        const m = (phase + 0.25) % 1;
        sprite(ctx, MOON, m * (W + 40) - 23, 67 - Math.sin(m * Math.PI) * 58, { m: '#f2efd8', c: '#cfcab0' });
      }
      // Far skyline, with windows lit at night.
      const far = mix('#6b86a8', '#141a36', night);
      for (const b of skyline) {
        rect(ctx, b.x, GROUND - 24 - b.h, b.w, b.h + 24, far);
        if (night > 0.4)
          b.lit.forEach((on, i) => on && rect(ctx, b.x + 3 + (i % 3) * 4, GROUND - 20 - b.h + 6 + Math.floor(i / 3) * 6, 2, 2, '#f7d774'));
      }
      // Neighbouring buildings.
      rect(ctx, 0, 58, 72, GROUND - 58, mix('#8e8a84', '#2a2a36', night));
      rect(ctx, 184, 50, 72, GROUND - 50, mix('#a58a6c', '#2e2a2a', night));
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 3; j++) {
          rect(ctx, 8 + i * 16, 66 + j * 14, 8, 9, night > 0.4 && (i + j) % 3 ? '#f2c46b' : mix('#c9dce8', '#28304a', night));
          rect(ctx, 192 + i * 16, 58 + j * 16, 8, 10, night > 0.4 && (i * j) % 2 ? '#f2c46b' : mix('#c9dce8', '#28304a', night));
        }
      // The business itself.
      if (p.kind === 'roastery') roastery(ctx, p, accent, night, now);
      else if (p.kind === 'studio') studio(ctx, p, accent, night, now);
      else truck(ctx, p, accent, night, now);
      // Pavement and road.
      rect(ctx, 0, GROUND, W, 6, mix('#b7b2a8', '#3d3b44', night));
      rect(ctx, 0, GROUND + 6, W, 1, mix('#8b877e', '#2b2a31', night));
      rect(ctx, 0, GROUND + 7, W, H - GROUND - 7, mix('#4a4d55', '#1d1e25', night));
      for (let x = ((now / 40) % 24) * (p.playing ? 1 : 0) - 24; x < W; x += 24) rect(ctx, x, GROUND + 18, 12, 2, mix('#e6dfa0', '#6d6a4c', night));
      // Street lamps: a pole, an arm, and a pool of light at night.
      for (const lx of [40, 214]) {
        rect(ctx, lx, GROUND - 30, 2, 30, '#2c2d33');
        rect(ctx, lx, GROUND - 31, 7, 2, '#2c2d33');
        rect(ctx, lx + 5, GROUND - 29, 4, 2, night > 0.3 ? '#ffe7a8' : '#6b6b73');
        if (night > 0.3) {
          ctx.globalAlpha = 0.18 * night;
          rect(ctx, lx + 3, GROUND - 32, 8, 6, '#ffdc8c');
          rect(ctx, lx - 3, GROUND - 1, 20, 3, '#ffdc8c');
          rect(ctx, lx, GROUND - 2, 14, 1, '#ffdc8c');
          ctx.globalAlpha = 1;
        }
      }
      // Queue outside when people are being turned away.
      if (p.queue) {
        const door = DOOR[p.kind];
        for (let q = 0; q < 4; q++) {
          const pal = { h: HAIR[q % HAIR.length], s: SKIN[(q + 2) % SKIN.length], t: SHIRT[(q + 3) % SHIRT.length], l: LEGS[q % LEGS.length] };
          sprite(ctx, PERSON.stand, door + 12 + q * 7, GROUND - 8, pal);
          if (Math.floor(now / 400 + q) % 3 === 0) sprite(ctx, BANG, door + 13 + q * 7, GROUND - 14, { r: '#ff5a4a' });
        }
      }
      // Walkers: some go in, the rest pass by.
      const want = Math.round(2 + p.busy * 10 + (p.playing ? 6 : 0));
      if (walkers.length < want && (p.still || rand() < (p.playing ? 0.2 : 0.03))) walkers.push(newWalker(!p.still));
      for (let i = walkers.length - 1; i >= 0; i--) {
        const w = walkers[i];
        if (!p.still) {
          w.x += w.dir * w.speed * (p.playing ? 2.4 : 1);
          w.step += w.speed * (p.playing ? 2.4 : 1);
        }
        const door = DOOR[p.kind];
        if (w.enter && Math.abs(w.x - door) < 1.5) {
          w.alpha -= 0.08;
          if (w.alpha <= 0) {
            walkers.splice(i, 1);
            if (p.playing || rand() < 0.3) coinsDue++;
            continue;
          }
        }
        if (w.x < -10 || w.x > W + 10) {
          walkers.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = w.alpha;
        sprite(ctx, Math.floor(w.step / 4) % 2 ? PERSON.walkA : PERSON.walkB, w.x, w.y, w.pal, w.dir < 0);
        ctx.globalAlpha = 1;
      }
      // Particles: coins from sales, hearts from happy customers, weather.
      if (coinsDue > 0) {
        coinsDue--;
        particles.push({ x: DOOR[p.kind] + 1, y: GROUND - 20, vx: (rand() - 0.5) * 0.3, vy: -0.6, life: 50, kind: 'coin' });
        if (p.reputation > 65 && rand() < 0.4) particles.push({ x: DOOR[p.kind] + 4, y: GROUND - 16, vx: 0.1, vy: -0.3, life: 60, kind: 'heart' });
      }
      const season = p.calendar;
      const weather: Particle['kind'] | null = season === 11 || season <= 1 ? 'snow' : season >= 8 && season <= 10 ? 'leaf' : season >= 2 && season <= 4 ? 'petal' : null;
      if (weather && !p.still && rand() < (weather === 'snow' ? 0.35 : 0.06))
        particles.push({ x: rand() * W, y: -4, vx: weather === 'snow' ? (rand() - 0.5) * 0.2 : 0.3 + rand() * 0.3, vy: 0.25 + rand() * 0.25, life: 600, kind: weather });
      for (let i = particles.length - 1; i >= 0; i--) {
        const q = particles[i];
        if (!p.still) {
          q.x += q.vx;
          q.y += q.vy;
          q.life--;
        }
        if (q.life <= 0 || q.y > H) {
          particles.splice(i, 1);
          continue;
        }
        if (q.kind === 'coin') sprite(ctx, COIN, q.x, q.y, { y: '#ffd24a', o: '#e0a21c' });
        else if (q.kind === 'heart') sprite(ctx, HEART, q.x, q.y, { r: '#ff6b8a' });
        else if (q.kind === 'steam') {
          ctx.globalAlpha = Math.max(0, q.life / 60) * 0.7;
          rect(ctx, q.x, q.y, 2, 2, '#f4f1ea');
          ctx.globalAlpha = 1;
        } else if (q.kind === 'snow') sprite(ctx, FLAKE, q.x, q.y, { w: '#ffffff' });
        else if (q.kind === 'leaf') sprite(ctx, LEAF, q.x, q.y, { o: rand() > 0.5 ? '#e0892c' : '#c4542a' });
        else rect(ctx, q.x, q.y, 2, 1, '#f7b6c8');
      }
      // Steam from the chimney, grill or cups.
      if (!p.still && frame % 6 === 0) {
        const at = p.kind === 'roastery' ? { x: 160, y: 40 } : p.kind === 'truck' ? { x: 151, y: 70 } : null;
        if (at) particles.push({ x: at.x + rand() * 3, y: at.y, vx: (rand() - 0.3) * 0.2, vy: -0.35, life: 60, kind: 'steam' });
      }
      if (p.label) {
        const w = textWidth(p.label) + 8;
        rect(ctx, 4, 4, w, 11, 'rgba(0,0,0,0.55)');
        text(ctx, p.label, 8, 7, '#ffffff');
      }
    }

    const loop = (now: number) => {
      if (stopped) return;
      if (visible && document.visibilityState === 'visible' && now - last > 33) {
        last = now;
        frame++;
        draw(now);
      }
      requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(c);
    const ro = new ResizeObserver(resize);
    ro.observe(c);
    resize();
    if (!props.still && !reduce) requestAnimationFrame(loop);
    else {
      // One settled frame: a few passers-by already on the street.
      for (let i = 0; i < 3 + Math.round(props.busy * 5); i++) walkers.push(newWalker(false));
      draw(0);
    }
    return () => {
      stopped = true;
      io.disconnect();
      ro.disconnect();
    };
    // The scene is rebuilt only when the company itself changes; everything
    // else is read live each frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.kind, props.name, props.still]);

  return <canvas ref={canvas} className="px-scene" role="img" aria-label={sceneLabel(props)} />;
}

function sceneLabel(p: SceneProps) {
  const what = p.kind === 'roastery' ? 'coffee roastery' : p.kind === 'studio' ? 'design studio' : 'food truck';
  return `Pixel-art street with your ${what}, ${p.name}${p.queue ? ', with a queue of customers outside' : ''}.`;
}

// ---------- The three businesses ----------

function sign(ctx: Ctx, name: string, x: number, y: number, w: number, bg: string, fg: string) {
  rect(ctx, x, y, w, 11, bg);
  rect(ctx, x, y + 11, w, 1, 'rgba(0,0,0,0.35)');
  const t = signText(name, w - 6);
  text(ctx, t, x + Math.round((w - textWidth(t)) / 2), y + 3, fg);
}
function staffInside(ctx: Ctx, n: number, x: number, y: number, now: number, seed: number) {
  for (let i = 0; i < Math.min(5, n); i++) {
    const bob = Math.floor(now / 500 + i) % 2;
    sprite(ctx, PERSON.stand, x + i * 7, y - bob, { h: HAIR[(seed + i) % HAIR.length], s: SKIN[(seed + i * 2) % SKIN.length], t: '#f3e3c3', l: '#3a3a3a' });
  }
}

function roastery(ctx: Ctx, p: SceneProps, accent: string, night: number, now: number) {
  const x = 84,
    top = 44;
  // Brick facade.
  rect(ctx, x, top, 88, GROUND - top, mix('#9a4332', '#3b2320', night));
  for (let y = top + 2; y < GROUND; y += 4)
    for (let bx = x + ((y / 4) % 2 ? 0 : 3); bx < x + 88; bx += 6) rect(ctx, bx, y, 5, 1, mix('#7d3326', '#2d1a17', night));
  rect(ctx, x - 2, top - 3, 92, 4, '#2a211d');
  // Chimney.
  rect(ctx, 156, top - 12, 8, 12, '#5a2a20');
  rect(ctx, 155, top - 13, 10, 2, '#2a211d');
  sign(ctx, p.name, x + 10, top + 6, 68, '#1f1a17', '#f3e3c3');
  // Striped awning with a scalloped edge.
  for (let i = 0; i < 88; i += 6) {
    rect(ctx, x + i, top + 22, 3, 7, accent);
    rect(ctx, x + i + 3, top + 22, 3, 7, '#f3e3c3');
  }
  for (let i = 0; i < 88; i += 6) rect(ctx, x + i + 1, top + 29, 4, 1, accent);
  // Window with the roaster inside.
  const glass = mix('#9cc6d6', '#f2c46b', night);
  rect(ctx, x + 6, top + 34, 46, 30, '#2a211d');
  rect(ctx, x + 8, top + 36, 42, 26, glass);
  const drum = 8 + p.equipment * 3;
  rect(ctx, x + 14, top + 60 - drum, drum + 4, drum, '#3a3230');
  rect(ctx, x + 16, top + 62 - drum, drum, drum - 4, '#6b5a50');
  rect(ctx, x + 18 + drum / 2 - 1, top + 58 - drum - 6, 2, 6, '#3a3230');
  if (p.equipment >= 2) rect(ctx, x + 36, top + 46, 10, 14, '#3a3230');
  staffInside(ctx, 1 + p.staff, x + 26, top + 52, now, 1);
  sprite(ctx, CUP, x + 44, top + 55, { w: '#ffffff', c: '#f3e3c3', b: '#6b3a22' });
  // Door.
  rect(ctx, x + 60, top + 36, 18, GROUND - top - 36, '#2a211d');
  rect(ctx, x + 62, top + 38, 14, GROUND - top - 38, mix('#6b3a22', '#3a2014', night));
  rect(ctx, x + 64, top + 41, 10, 10, glass);
  rect(ctx, x + 73, top + 54, 2, 2, '#ffd24a');
  // A chalkboard on the pavement.
  rect(ctx, x + 50, GROUND - 10, 8, 10, '#2c2d33');
  rect(ctx, x + 51, GROUND - 9, 6, 6, '#3f4f45');
}

function studio(ctx: Ctx, p: SceneProps, accent: string, night: number, now: number) {
  const x = 80,
    top = 40;
  rect(ctx, x, top, 96, GROUND - top, mix('#d7dade', '#34363f', night));
  rect(ctx, x, top, 96, 4, '#2c2d33');
  sign(ctx, p.name, x + 14, top + 10, 68, '#ffffff', '#1b1b1f');
  rect(ctx, x + 14, top + 22, 68, 1, accent);
  // Floor-to-ceiling glass.
  const glass = mix('#a9d0dd', '#1d2640', night);
  rect(ctx, x + 6, top + 28, 84, GROUND - top - 28, '#2c2d33');
  rect(ctx, x + 8, top + 30, 80, GROUND - top - 32, glass);
  for (let m = x + 28; m < x + 88; m += 20) rect(ctx, m, top + 30, 1, GROUND - top - 32, '#2c2d33');
  // Desks with screens, one per person.
  const people = 1 + p.staff;
  for (let i = 0; i < Math.min(4, people); i++) {
    const dx = x + 12 + i * 19;
    rect(ctx, dx, GROUND - 16, 14, 2, '#8a6a4a');
    sprite(ctx, MONITOR, dx + 4, GROUND - 23, { k: '#1b1b1f', b: night > 0.4 ? '#7fd3ff' : '#4f8fe4' });
    const bob = Math.floor(now / 600 + i) % 2;
    sprite(ctx, PERSON.stand, dx + 1, GROUND - 14 - bob, { h: HAIR[(i + 3) % HAIR.length], s: SKIN[(i + 1) % SKIN.length], t: accent, l: '#2d3350' });
  }
  sprite(ctx, PLANT, x + 80, GROUND - 16, { g: '#4f9a5a', p: '#b0704a' });
  if (p.equipment >= 1) {
    rect(ctx, x + 70, top + 34, 14, 10, '#f3e3c3');
    rect(ctx, x + 72, top + 36, 10, 6, accent);
  }
  // Door at the right.
  rect(ctx, 158, GROUND - 26, 12, 26, '#2c2d33');
  rect(ctx, 160, GROUND - 24, 8, 24, mix('#bfe0ea', '#2a3552', night));
}

function truck(ctx: Ctx, p: SceneProps, accent: string, night: number, now: number) {
  // A small park behind the truck.
  rect(ctx, 76, 74, 104, GROUND - 74, mix('#5fa865', '#1f3a26', night));
  for (const tx of [84, 164]) {
    rect(ctx, tx + 4, 82, 3, 30, '#6b4a2b');
    rect(ctx, tx, 70, 12, 14, mix('#3f8a4a', '#18301f', night));
    rect(ctx, tx + 2, 66, 8, 4, mix('#3f8a4a', '#18301f', night));
  }
  const trucks = p.equipment >= 2 ? 2 : 1;
  for (let n = 0; n < trucks; n++) {
    const x = n ? 172 : 100,
      y = 82,
      w = n ? 52 : 64;
    rect(ctx, x, y, w, 26, accent);
    rect(ctx, x, y + 20, w, 6, mix('#2c2d33', '#141418', 0.3));
    rect(ctx, x + w - 14, y + 4, 12, 10, mix('#bfe0ea', '#2a3552', night));
    // Serving hatch, awning and the cook.
    rect(ctx, x + 8, y + 5, 30, 12, night > 0.4 ? '#f2c46b' : '#fbe6b0');
    rect(ctx, x + 6, y + 2, 34, 3, '#f3e3c3');
    if (!n) staffInside(ctx, 1 + p.staff, x + 11, y + 7, now, 4);
    rect(ctx, x + 6, y + 17, 34, 2, '#8a6a4a');
    // Wheels.
    for (const wx of [x + 8, x + w - 16]) {
      rect(ctx, wx, y + 24, 8, 6, '#1b1b1f');
      rect(ctx, wx + 3, y + 26, 2, 2, '#9a9aa2');
    }
    if (!n) {
      sign(ctx, p.name, x + 4, y - 14, 56, '#1f1a17', '#ffd24a');
      rect(ctx, 150, y - 8, 3, 8, '#3a3a3a');
      // String lights at night.
      if (night > 0.3) for (let i = 0; i < 9; i++) rect(ctx, x + 2 + i * 7, y - 2 + (i % 2), 2, 2, ['#ffd24a', '#ff6b8a', '#7fd3ff'][i % 3]);
    }
  }
  // Menu board.
  rect(ctx, 86, GROUND - 14, 10, 14, '#2c2d33');
  rect(ctx, 87, GROUND - 13, 8, 8, '#3f4f45');
}
