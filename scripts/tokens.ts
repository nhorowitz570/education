// Exports the web design tokens for the native apps. tokens.css stays the
// source of truth; this reads its dark (reference) and light blocks and writes
//   design/tokens/fieldwork.tokens.json   (W3C design-token format)
//   design/tokens/FieldworkTokens.swift   (SwiftUI, light/dark aware)
// Usage: npx tsx scripts/tokens.ts        (tests check the files are current)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

type Rgba = { r: number; g: number; b: number; a: number };
export type Tokens = {
  color: Record<string, { dark: Rgba; light: Rgba }>;
  radius: Record<string, number>;
  duration: Record<string, number>;
  easing: Record<string, [number, number, number, number]>;
  size: Record<string, number>;
  font: Record<string, string>;
};

const block = (css: string, selector: string) => {
  const i = css.indexOf(selector);
  if (i < 0) throw new Error(`No ${selector} block in tokens.css`);
  const open = css.indexOf('{', i);
  let depth = 1,
    j = open + 1;
  while (depth && j < css.length) depth += css[j] === '{' ? 1 : css[j] === '}' ? -1 : 0, j++;
  return Object.fromEntries([...css.slice(open + 1, j - 1).matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
};

function rgba(v: string): Rgba | null {
  const hex = v.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const f = v.match(/^rgba?\(([^)]+)\)$/);
  if (f) {
    const [r, g, b, a = '1'] = f[1].split(',').map((x) => x.trim());
    return { r: +r, g: +g, b: +b, a: +a };
  }
  return null;
}

export function parse(css: string): Tokens {
  const dark = block(css, ':root {'),
    light = block(css, ":root[data-theme='light'] {");
  const t: Tokens = { color: {}, radius: {}, duration: {}, easing: {}, size: {}, font: {} };
  for (const [k, v] of Object.entries(dark)) {
    const d = rgba(v);
    if (d) {
      const l = rgba(light[k] || v)!;
      t.color[k] = { dark: d, light: l };
    } else if (k.startsWith('r-') || k === 'r') t.radius[k] = parseFloat(v);
    else if (k.startsWith('t-') || k === 't') t.duration[k] = parseFloat(v);
    else if (v.startsWith('cubic-bezier')) t.easing[k] = v.match(/[\d.]+/g)!.map(Number) as Tokens['easing'][string];
    else if (/^\d+px$/.test(v)) t.size[k] = parseFloat(v);
  }
  t.font = { sans: 'Instrument Sans', serif: 'Newsreader', hyperlegible: 'Atkinson Hyperlegible', dyslexic: 'OpenDyslexic' };
  return t;
}

const camel = (k: string) => k.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase()).replace(/^(\d)/, '_$1');
const hex = (c: Rgba) => '#' + [c.r, c.g, c.b].map((x) => x.toString(16).padStart(2, '0')).join('') + (c.a < 1 ? Math.round(c.a * 255).toString(16).padStart(2, '0') : '');
const unit = (n: number) => +(n / 255).toFixed(4);

export function json(t: Tokens) {
  const color = Object.fromEntries(
    Object.entries(t.color).map(([k, c]) => [k, { $type: 'color', $value: hex(c.dark), $extensions: { 'app.fieldwork.light': hex(c.light) } }]),
  );
  return (
    JSON.stringify(
      {
        $description: 'Generated from src/styles/tokens.css by scripts/tokens.ts. Dark is the reference; light is in $extensions.',
        color,
        radius: Object.fromEntries(Object.entries(t.radius).map(([k, v]) => [k, { $type: 'dimension', $value: `${v}px` }])),
        size: Object.fromEntries(Object.entries(t.size).map(([k, v]) => [k, { $type: 'dimension', $value: `${v}px` }])),
        duration: Object.fromEntries(Object.entries(t.duration).map(([k, v]) => [k, { $type: 'duration', $value: `${v}ms` }])),
        easing: Object.fromEntries(Object.entries(t.easing).map(([k, v]) => [k, { $type: 'cubicBezier', $value: v }])),
        font: Object.fromEntries(Object.entries(t.font).map(([k, v]) => [k, { $type: 'fontFamily', $value: v }])),
      },
      null,
      2,
    ) + '\n'
  );
}

export function swift(t: Tokens) {
  const color = (c: Rgba) => `.init(red: ${unit(c.r)}, green: ${unit(c.g)}, blue: ${unit(c.b)}, opacity: ${c.a})`;
  const lines = [
    '// Generated from src/styles/tokens.css by scripts/tokens.ts. Do not edit.',
    '// Dark is the reference; light is tuned separately rather than inverted.',
    'import SwiftUI',
    '',
    'public enum FW {',
    '  public enum Palette {',
    ...Object.entries(t.color).map(([k, c]) => `    public static let ${camel(k)} = Color.adaptive(light: ${color(c.light)}, dark: ${color(c.dark)})`),
    '  }',
    '  public enum Radius {',
    ...Object.entries(t.radius).map(([k, v]) => `    public static let ${camel(k === 'r' ? 'base' : k.slice(2))}: CGFloat = ${v}`),
    '  }',
    '  public enum Size {',
    ...Object.entries(t.size).map(([k, v]) => `    public static let ${camel(k)}: CGFloat = ${v}`),
    '  }',
    '  public enum Motion {',
    ...Object.entries(t.duration).map(([k, v]) => `    public static let ${camel(k === 't' ? 'base' : k.slice(2))}: Double = ${v / 1000}`),
    ...Object.entries(t.easing).map(([k, [a, b, c, d]]) => `    public static let ${camel(k)} = UnitCurve.bezier(startControlPoint: UnitPoint(x: ${a}, y: ${b}), endControlPoint: UnitPoint(x: ${c}, y: ${d}))`),
    '  }',
    '  public enum Font {',
    ...Object.entries(t.font).map(([k, v]) => `    public static let ${camel(k)} = "${v}"`),
    '  }',
    '}',
    '',
    'extension Color {',
    '  static func adaptive(light: Color, dark: Color) -> Color {',
    '    #if canImport(UIKit)',
    '    Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light) })',
    '    #else',
    '    Color(NSColor(name: nil) { $0.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? NSColor(dark) : NSColor(light) })',
    '    #endif',
    '  }',
    '}',
    '',
  ];
  return lines.join('\n');
}

export const OUT = join(process.cwd(), 'design/tokens');
export function build() {
  const t = parse(readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8'));
  return { 'fieldwork.tokens.json': json(t), 'FieldworkTokens.swift': swift(t) };
}

if (process.argv[1]?.endsWith('tokens.ts')) {
  mkdirSync(OUT, { recursive: true });
  for (const [name, body] of Object.entries(build())) writeFileSync(join(OUT, name), body);
  console.log('Wrote design/tokens.');
}
