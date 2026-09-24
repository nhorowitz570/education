'use client';
import { useEffect, useState } from 'react';
import { inline, Paragraph, renderInline, shape, splitParagraphs } from '@/components/ui';
import { Visual, VisualSkeleton } from '@/components/viz/visual';
import { vizSchema } from '@/lib/viz/schema';
import type { Block } from '@/lib/learning/run';
import { sentences } from '@/lib/stream-text';

// Renders tutor output. While it streams, text appears a finished sentence
// (or list line) at a time, each fading in once as a unit. Holding back the
// sentence still being written means a slow or bursty model never shows as
// stutter, and nothing half-formed (a dangling "**", a broken word) is ever
// on screen. Every block keeps the same element from its first sentence to
// the end, so finishing the stream changes nothing visible: no remount, no
// replayed entrance, no jump.
export function Blocks({ blocks, streaming = false }: { blocks: Block[]; streaming?: boolean }) {
  const live = useLive(streaming);
  return (
    <div className="blocks">
      {blocks.map((b, i) => {
        const open = streaming && i === blocks.length - 1;
        if (b.type === 'text') return <TextBlock key={i} md={b.md || ''} open={open} live={live} className="prose block" />;
        if (b.type === 'callout')
          return (
            <div key={i} className="callout block">
              <TextBlock md={b.md || ''} open={open} live={live} className="prose" />
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

// True from the first streamed snapshot until a moment after the last, so
// the final sentences finish fading before the text settles into plain
// paragraphs (which the known-term decorations need).
function useLive(streaming: boolean) {
  const [live, setLive] = useState(streaming);
  useEffect(() => {
    if (streaming) return setLive(true);
    if (!live) return;
    const t = setTimeout(() => setLive(false), 700);
    return () => clearTimeout(t);
  }, [streaming, live]);
  return live || streaming;
}

function TextBlock({ md, open, live, className }: { md: string; open: boolean; live: boolean; className: string }) {
  const paragraphs = splitParagraphs(md);
  return (
    <div className={className + (open ? ' streaming' : '')}>
      {live
        ? paragraphs.map((p, i) => <LiveParagraph key={i} src={p} writing={open && i === paragraphs.length - 1} />)
        : paragraphs.map((p, i) => <Paragraph key={i} src={p} />)}
    </div>
  );
}

// A paragraph being streamed: only its finished units are shown.
function LiveParagraph({ src, writing }: { src: string; writing: boolean }) {
  const { kind } = shape(src);
  if (kind === 'ul' || kind === 'ol') {
    // A list item is finished once the next line has begun.
    const lines = src.split('\n');
    const done = writing ? lines.slice(0, -1) : lines;
    if (!done.length) return null;
    const List = kind;
    return (
      <List>
        {shape(done.join('\n')).items.map((parts, i) => (
          <li key={i} className="unit">
            {renderInline(parts, `l${i}-`)}
          </li>
        ))}
      </List>
    );
  }
  const text = kind === 'quote' ? src.split('\n').map((l) => l.replace(/^\s*>\s?/, '')).join(' ') : src.replace(/^#{1,6}\s+/gm, '');
  const units = sentences(text, writing);
  if (!units.length) return null;
  const body = units.map((u, i) => (
    <span key={i} className="unit">
      {renderInline(inline(u), `u${i}-`)}
    </span>
  ));
  return kind === 'quote' ? <blockquote>{body}</blockquote> : <p>{body}</p>;
}
