'use client';
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';
import { reducedMotion } from '@/lib/client/motion';

export function Button({
  children,
  onClick,
  kind = '',
  disabled = false,
  busy = false,
  type = 'button',
  label,
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: string;
  disabled?: boolean;
  busy?: boolean;
  type?: 'button' | 'submit';
  label?: string;
}) {
  return (
    <button
      type={type}
      className={'btn ' + kind.replace('secondary', '')}
      onClick={onClick}
      disabled={disabled || busy}
      data-busy={busy || undefined}
      aria-label={label}
      aria-busy={busy || undefined}
    >
      {children}
    </button>
  );
}

// Bottom sheet on phones, dialog on larger screens. Only a tap that both
// starts and ends on the backdrop closes it, so dragging a text selection or
// tapping padding inside a form never loses input.
export function Sheet({
  title,
  subtitle,
  children,
  onClose,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    downOnBackdrop = useRef(false),
    drag = useRef<{ id: number; y: number; t: number; dy: number; v: number } | null>(null);
  const titleId = useRef('sheet-' + Math.random().toString(36).slice(2)).current;
  // On phones a sheet follows the finger from its grip or header and is let
  // go with a flick or a long pull; anything less springs back.
  const phone = () => window.matchMedia('(max-width: 699px)').matches;
  function dragStart(e: React.PointerEvent<HTMLDialogElement>) {
    const el = ref.current;
    const target = e.target as HTMLElement;
    if (!el || !phone() || el.scrollTop > 0 || !target.closest('.sheet-grip, .sheet-head') || target.closest('button, a, input')) return;
    drag.current = { id: e.pointerId, y: e.clientY, t: e.timeStamp, dy: 0, v: 0 };
    el.setPointerCapture(e.pointerId);
    el.style.transition = 'none';
  }
  function dragMove(e: React.PointerEvent<HTMLDialogElement>) {
    const d = drag.current,
      el = ref.current;
    if (!d || !el || e.pointerId !== d.id) return;
    const raw = e.clientY - d.y;
    // Pulling up resists, like a rubber band.
    const dy = raw < 0 ? -Math.sqrt(-raw) * 2 : raw;
    d.v = (dy - d.dy) / Math.max(1, e.timeStamp - d.t);
    d.t = e.timeStamp;
    d.dy = dy;
    el.style.transform = `translateY(${dy}px)`;
  }
  function dragEnd(e: React.PointerEvent<HTMLDialogElement>) {
    const d = drag.current,
      el = ref.current;
    if (!d || !el || e.pointerId !== d.id) return;
    drag.current = null;
    if (d.dy > 140 || (d.dy > 24 && d.v > 0.55)) {
      el.style.transition = 'transform 220ms cubic-bezier(0.4, 0, 1, 1)';
      el.style.transform = 'translateY(100%)';
      setTimeout(onClose, 200);
    } else {
      el.style.transition = 'transform 460ms cubic-bezier(0.2, 1.3, 0.35, 1)';
      el.style.transform = '';
      setTimeout(() => el && (el.style.transition = ''), 480);
    }
  }
  useEffect(() => {
    const el = ref.current,
      previous = document.activeElement as HTMLElement | null;
    el?.showModal();
    return () => {
      el?.close();
      previous?.focus?.();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
        dragStart(e);
      }}
      onPointerMove={dragMove}
      onPointerUp={dragEnd}
      onPointerCancel={dragEnd}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) onClose();
        downOnBackdrop.current = false;
      }}
    >
      <div className="sheet-grip" aria-hidden="true" />
      <div className="sheet-head">
        <div>
          <h2 className="heading" id={titleId}>
            {title}
          </h2>
          {subtitle && <p className="label" style={{ marginTop: 4 }}>{subtitle}</p>}
        </div>
        <button className="btn icon small ghost" onClick={onClose} aria-label="Close">
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="sheet-body">{children}</div>
      {footer && <div className="sheet-foot">{footer}</div>}
    </dialog>
  );
}
// Kept for screens that still use the old name.
export const Modal = ({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) => (
  <Sheet title={title} onClose={onClose}>
    {children}
  </Sheet>
);

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <i />
    </button>
  );
}

// A section that stays folded until asked for. Its body mounts on open, so
// anything that animates in (charts, counters) plays when it is seen.
export function Disclosure({
  title,
  teaser,
  children,
  className = '',
  defaultOpen = false,
}: {
  title: string;
  teaser?: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className={('disclosure ' + className).trim()} data-open={open || undefined}>
      <button type="button" className="disclosure-head" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <span className="grow">
          <span className="disclosure-title">{title}</span>
          {teaser && <span className="disclosure-teaser">{teaser}</span>}
        </span>
        <Icon name="down" size={18} className="disclosure-chev" />
      </button>
      {open && (
        <div id={id} className="disclosure-body">
          {children}
        </div>
      )}
    </section>
  );
}

// One line in a settings index: what it is, what it does, its current value
// on the right, and a way in.
export function IndexRow({
  icon,
  title,
  detail,
  value,
  badge,
  onClick,
  disabled,
  children,
}: {
  icon?: string;
  title: string;
  detail?: ReactNode;
  value?: ReactNode;
  badge?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const body = (
    <>
      {icon && (
        <span className="row-glyph">
          <Icon name={icon} size={18} />
        </span>
      )}
      <div className="grow">
        <p>{title}</p>
        {detail && <p className="sub">{detail}</p>}
      </div>
      {badge}
      {value !== undefined && <span className="row-value">{value}</span>}
      {children}
      {onClick && <Icon name="chevron" size={18} className="row-chev" />}
    </>
  );
  return onClick ? (
    <button type="button" className="row index-row" onClick={onClick} disabled={disabled}>
      {body}
    </button>
  ) : (
    <div className={'row index-row' + (disabled ? ' disabled' : '')}>{body}</div>
  );
}

// A group of settings: a name, one line on what it changes, and its rows.
export function SettingsGroup({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section className="you-group" aria-labelledby={id}>
      <div className="you-group-head">
        <h2 className="eyebrow" id={id}>
          {title}
        </h2>
        {note && <p className="label">{note}</p>}
      </div>
      <div className="rows">{children}</div>
    </section>
  );
}

// A labelled choice inside a settings sheet, with the effect spelled out.
export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field setting-field">
      <span>{label}</span>
      {children}
      {hint && <p className="label">{hint}</p>}
    </div>
  );
}

export function Pill({ children }: { children: ReactNode }) {
  return <span className="chip" style={{ pointerEvents: 'none' }}>{children}</span>;
}
export function SectionTitle({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="title">{title}</h1>
        {description && <p className="muted" style={{ marginTop: 8, maxWidth: '60ch' }}>{description}</p>}
      </div>
    </div>
  );
}

export function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const dateLabel = (d: string, withWeekday: boolean | Intl.DateTimeFormatOptions = true) =>
  new Date(d + 'T12:00:00').toLocaleDateString(
    'en-US',
    typeof withWeekday === 'object'
      ? withWeekday
      : withWeekday
        ? { weekday: 'short', month: 'short', day: 'numeric' }
        : { month: 'short', day: 'numeric' },
  );

// ---- Markdown subset for tutor text: paragraphs, **bold**, *italic*,
// `code`, lists, > quotes. Builds React elements; never injects HTML.
export type Inline = string | { t: 'b' | 'i' | 'code'; c: Inline[] | string };
export function inline(src: string): Inline[] {
  const out: Inline[] = [];
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*|_([^_\n]+)_|`([^`]+)`)/g;
  let last = 0,
    m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push(src.slice(last, m.index));
    if (m[2] || m[3]) out.push({ t: 'b', c: inline(m[2] || m[3]) });
    else if (m[4] || m[5]) out.push({ t: 'i', c: inline(m[4] || m[5]) });
    else if (m[6]) out.push({ t: 'code', c: m[6] });
    last = m.index + m[0].length;
  }
  // An unfinished emphasis marker while streaming renders as plain text.
  if (last < src.length) out.push(src.slice(last).replace(/\*\*?$|`$/, ''));
  return out;
}
// Lets a surrounding screen decorate plain runs of text (a lesson marks the
// ideas the learner has met before). Outside such a screen, text is text.
export type Decorate = (text: string, key: string) => ReactNode;
export const DecorateText = createContext<Decorate | null>(null);
function Plain({ text, k }: { text: string; k: string }) {
  const decorate = useContext(DecorateText);
  return <>{decorate ? decorate(text, k) : text}</>;
}
export function renderInline(parts: Inline[], key = ''): ReactNode[] {
  return parts.map((p, i) =>
    typeof p === 'string' ? (
      <Plain key={key + i} text={p} k={key + i} />
    ) : p.t === 'code' ? (
      <code key={key + i}>{p.c as string}</code>
    ) : p.t === 'b' ? (
      <strong key={key + i}>{renderInline(p.c as Inline[], key + i + '-')}</strong>
    ) : (
      <em key={key + i}>{renderInline(p.c as Inline[], key + i + '-')}</em>
    ),
  );
}
export function splitParagraphs(md: string) {
  return md
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}
// A paragraph's shape: a list, a quote, or plain text, as inline parts.
export function shape(src: string): { kind: 'ul' | 'ol' | 'quote' | 'p'; items: Inline[][] } {
  const lines = src.split('\n');
  if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) return { kind: 'ul', items: lines.map((l) => inline(l.replace(/^\s*[-*•]\s+/, ''))) };
  if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) return { kind: 'ol', items: lines.map((l) => inline(l.replace(/^\s*\d+[.)]\s+/, ''))) };
  if (lines.every((l) => /^\s*>/.test(l))) return { kind: 'quote', items: [inline(lines.map((l) => l.replace(/^\s*>\s?/, '')).join(' '))] };
  // Headings are outside the contract; show them as emphasis, not structure.
  return { kind: 'p', items: [inline(lines.map((l) => l.replace(/^#{1,6}\s+/, '')).join('\n'))] };
}
export function Paragraph({ src }: { src: string }) {
  const { kind, items } = shape(src);
  if (kind === 'ul' || kind === 'ol') {
    const List = kind;
    return (
      <List>
        {items.map((parts, i) => (
          <li key={i}>{renderInline(parts)}</li>
        ))}
      </List>
    );
  }
  if (kind === 'quote') return <blockquote>{renderInline(items[0])}</blockquote>;
  return <p>{renderInline(items[0])}</p>;
}
// The plain runs of text Markdown would render, in order: what a decorator
// will be handed, so it can decide ahead of time which run gets what.
export function plainRuns(md: string): string[] {
  const out: string[] = [];
  const walk = (parts: Inline[]) => parts.forEach((p) => (typeof p === 'string' ? out.push(p) : p.t !== 'code' && walk(p.c as Inline[])));
  for (const para of splitParagraphs(md)) shape(para).items.forEach(walk);
  return out;
}
export function Markdown({ src, className = 'prose' }: { src: string; className?: string }) {
  return (
    <div className={className}>
      {splitParagraphs(src).map((p, i) => (
        <Paragraph key={i} src={p} />
      ))}
    </div>
  );
}

// A number that counts up from zero once, after a short delay, so a result
// lands rather than just appearing. Static when motion is reduced.
export function CountUp({ to, delay = 0, ms = 900, format = (n: number) => String(Math.round(n)) }: { to: number; delay?: number; ms?: number; format?: (n: number) => string }) {
  const [v, setV] = useState(to);
  useEffect(() => {
    if (!Number.isFinite(to) || reducedMotion()) return setV(to);
    setV(0);
    let raf = 0;
    const t0 = performance.now() + delay;
    const tick = (now: number) => {
      const p = Math.max(0, Math.min(1, (now - t0) / ms));
      setV(to * (1 - (1 - p) ** 3));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, delay, ms]);
  return <>{format(v)}</>;
}
