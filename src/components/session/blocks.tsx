'use client';
import { useRef, type ReactNode } from 'react';
import { Markdown, Paragraph, splitParagraphs } from '@/components/ui';
import { Visual, VisualSkeleton } from '@/components/viz/visual';
import { vizSchema } from '@/lib/viz/schema';
import type { Block } from '@/lib/learning/run';

// Renders tutor output. While streaming, finished paragraphs render normally
// and the paragraph being written reveals new text chunk by chunk with a
// short fade, so the page builds itself without a typing effect.
export function Blocks({ blocks, streaming = false }: { blocks: Block[]; streaming?: boolean }) {
  return (
    <div className="blocks">
      {blocks.map((b, i) => {
        const last = i === blocks.length - 1,
          open = streaming && last;
        if (b.type === 'text')
          return open ? <StreamingText key={i} md={b.md || ''} /> : <Markdown key={i} src={b.md || ''} className="prose block" />;
        if (b.type === 'callout')
          return (
            <div key={i} className={'callout block' + (open ? ' streaming' : '')}>
              {open ? <StreamingText md={b.md || ''} /> : <Markdown src={b.md || ''} className="prose" />}
            </div>
          );
        // A visual is drawn once its spec is complete and valid; until then a
        // placeholder holds its place so the layout does not jump.
        const parsed = !open && b.visual ? vizSchema.safeParse(b.visual) : null;
        return (
          <div key={i} className="block visual-block">
            {parsed?.success ? (
              <Visual spec={parsed.data} />
            ) : open || !b.visual ? (
              <VisualSkeleton type={(b.visual as { type?: string } | undefined)?.type} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function StreamingText({ md }: { md: string }) {
  const paragraphs = splitParagraphs(md);
  const done = paragraphs.slice(0, -1),
    current = paragraphs.at(-1) || '';
  return (
    <div className="prose block streaming">
      {done.map((p, i) => (
        <Paragraph key={i} src={p} />
      ))}
      {current && <FreshParagraph key={done.length} src={current} />}
    </div>
  );
}

// Text written in the last ~700ms is wrapped in spans that fade in once.
function FreshParagraph({ src }: { src: string }) {
  const marks = useRef<{ at: number; t: number }[]>([]);
  const visible = visibleLength(src);
  const now = performance.now();
  if (!marks.current.length) marks.current.push({ at: 0, t: now });
  const lastMark = marks.current.at(-1);
  if (!lastMark || visible > lastMark.at) marks.current.push({ at: visible, t: now });
  // Older chunks settle into plain text.
  while (marks.current.length > 1 && now - marks.current[1].t > 700) marks.current.shift();
  const boundaries = marks.current.map((m) => m.at);
  // The first boundary is where settled text ends; chunks after it are fresh.
  const settled = marks.current.length > 1 ? boundaries[0] : visible;
  return <p>{renderFresh(src, settled, boundaries)}</p>;
}

// Minimal inline markdown (bold, italic, code). Used both to measure the
// visible text and to render it, so chunk boundaries always line up.
type InlineNode = { text: string; style: 'b' | 'i' | 'code' | null };
function parseInline(src: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*\n]+)\*|`([^`]+)`)/g;
  let last = 0,
    m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) nodes.push({ text: src.slice(last, m.index), style: null });
    nodes.push(m[2] ? { text: m[2], style: 'b' } : m[3] ? { text: m[3], style: 'i' } : { text: m[4], style: 'code' });
    last = m.index + m[0].length;
  }
  // Unclosed markers mid-stream are hidden rather than shown as symbols.
  if (last < src.length) nodes.push({ text: src.slice(last).replace(/\*\*|`|\*(?=\S)/g, ''), style: null });
  return nodes;
}
function visibleLength(src: string) {
  return parseInline(src).reduce((n, x) => n + x.text.length, 0);
}
function renderFresh(src: string, settled: number, boundaries: number[]): ReactNode[] {
  const nodes = parseInline(src);
  const out: ReactNode[] = [];
  let offset = 0;
  nodes.forEach((n, ni) => {
    const start = offset,
      end = offset + n.text.length;
    offset = end;
    const cuts = [start, ...boundaries.filter((b) => b > start && b < end && b >= settled), end];
    if (settled > start && settled < end && !cuts.includes(settled)) cuts.splice(1, 0, settled);
    cuts.sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i],
        b = cuts[i + 1];
      if (b <= a) continue;
      const text = n.text.slice(a - start, b - start);
      const styled =
        n.style === 'b' ? <strong>{text}</strong> : n.style === 'i' ? <em>{text}</em> : n.style === 'code' ? <code>{text}</code> : text;
      out.push(
        a >= settled ? (
          <span className="fresh" key={'f' + a}>
            {styled}
          </span>
        ) : (
          <span key={`s${ni}-${i}`}>{styled}</span>
        ),
      );
    }
  });
  return out;
}
