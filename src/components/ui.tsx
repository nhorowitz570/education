'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';

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
    downOnBackdrop = useRef(false);
  const titleId = useRef('sheet-' + Math.random().toString(36).slice(2)).current;
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
      }}
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

// One line in a settings index: a label, its current state, and a way in.
export function IndexRow({
  icon,
  title,
  detail,
  badge,
  onClick,
  children,
}: {
  icon: string;
  title: string;
  detail?: ReactNode;
  badge?: ReactNode;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const body = (
    <>
      <span className="row-glyph">
        <Icon name={icon} size={18} />
      </span>
      <div className="grow">
        <p>{title}</p>
        {detail && <p className="sub">{detail}</p>}
      </div>
      {badge}
      {children}
      {onClick && <Icon name="chevron" size={18} />}
    </>
  );
  return onClick ? (
    <button type="button" className="row index-row" onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="row index-row">{body}</div>
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
type Inline = string | { t: 'b' | 'i' | 'code'; c: Inline[] | string };
function inline(src: string): Inline[] {
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
function renderInline(parts: Inline[], key = ''): ReactNode[] {
  return parts.map((p, i) =>
    typeof p === 'string' ? (
      p
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
export function Paragraph({ src }: { src: string }) {
  const lines = src.split('\n');
  if (lines.every((l) => /^\s*[-*•]\s+/.test(l)))
    return (
      <ul>
        {lines.map((l, i) => (
          <li key={i}>{renderInline(inline(l.replace(/^\s*[-*•]\s+/, '')))}</li>
        ))}
      </ul>
    );
  if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l)))
    return (
      <ol>
        {lines.map((l, i) => (
          <li key={i}>{renderInline(inline(l.replace(/^\s*\d+[.)]\s+/, '')))}</li>
        ))}
      </ol>
    );
  if (lines.every((l) => /^\s*>/.test(l)))
    return <blockquote>{renderInline(inline(lines.map((l) => l.replace(/^\s*>\s?/, '')).join(' ')))}</blockquote>;
  // Headings are outside the contract; show them as emphasis, not structure.
  const text = lines.map((l) => l.replace(/^#{1,6}\s+/, '')).join('\n');
  return <p>{renderInline(inline(text))}</p>;
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
