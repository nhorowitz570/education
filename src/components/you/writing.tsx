'use client';
import { Sheet } from '@/components/ui';
import { useApp } from '@/components/app/provider';
import { WRITING, type Writing } from '@/lib/learning/voice';

// Each style gets a small stage that shows its character in motion: the
// selected one plays, the rest play on hover.
function Stage({ k }: { k: Writing }) {
  if (k === 'candid')
    return (
      <span className="ws-stage ws-candid" aria-hidden="true">
        <b className="ws-bang">!</b>
        <span className="ws-talk">real talk</span>
        <span className="ws-bleep">#@%!</span>
      </span>
    );
  if (k === 'concise')
    return (
      <span className="ws-stage ws-concise" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
    );
  if (k === 'formal')
    return (
      <span className="ws-stage ws-formal" aria-hidden="true">
        <span className="ws-thus">Thus,</span>
        <svg viewBox="0 0 80 10" className="ws-pen">
          <path d="M2 6 C 20 2, 40 9, 78 4" />
        </svg>
      </span>
    );
  if (k === 'warm')
    return (
      <span className="ws-stage ws-warm" aria-hidden="true">
        <i className="ws-sun" />
        <i className="ws-ring" />
      </span>
    );
  return (
    <span className="ws-stage ws-balanced" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

export function WritingPicker({ value, onChange }: { value: Writing; onChange: (w: Writing) => void }) {
  return (
    <div className="ws">
      <div className="ws-grid" role="radiogroup" aria-label="Writing style">
        {(Object.keys(WRITING) as Writing[]).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={value === k}
            className={'ws-card' + (value === k ? ' is-on' : '')}
            onClick={() => onChange(k)}
          >
            <Stage k={k} />
            <span className="ws-name">{WRITING[k].label}</span>
            <span className="ws-note">{WRITING[k].note}</span>
          </button>
        ))}
      </div>
      <figure className="ws-sample" key={value}>
        <figcaption className="eyebrow">Sounds like</figcaption>
        <blockquote>{WRITING[value].sample}</blockquote>
      </figure>
    </div>
  );
}

export function WritingSheet({ onClose }: { onClose: () => void }) {
  const { prefs, setPrefs } = useApp();
  return (
    <Sheet
      title="Writing style"
      subtitle="How your tutor talks to you in lessons, feedback and chat. It changes the tone and length, never what’s true."
      onClose={onClose}
    >
      <WritingPicker value={prefs.writing} onChange={(v) => setPrefs('writing', v)} />
    </Sheet>
  );
}
