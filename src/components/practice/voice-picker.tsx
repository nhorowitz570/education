'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import { VOICES, type Voice } from '@/lib/practice/harness';

// Every practice voice, each with a few seconds to hear it before choosing.
// The samples are recorded once from the live voice itself (scripts/voice-samples.ts).
export function VoicePicker({ value, onChange }: { value: Voice; onChange: (v: Voice) => void }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<Voice | null>(null);
  useEffect(
    () => () => {
      audio.current?.pause();
    },
    [],
  );
  function play(v: Voice) {
    audio.current?.pause();
    if (playing === v) return setPlaying(null);
    const a = new Audio(`/voices/${v}.m4a`);
    audio.current = a;
    setPlaying(v);
    a.onended = a.onerror = () => setPlaying((p) => (p === v ? null : p));
    void a.play().catch(() => setPlaying(null));
  }
  return (
    <div className="voice-picker" role="radiogroup" aria-label="Voice">
      {(Object.keys(VOICES) as Voice[]).map((v) => (
        <div key={v} className={'voice-option' + (value === v ? ' picked' : '')}>
          <button type="button" role="radio" aria-checked={value === v} className="voice-choose" onClick={() => onChange(v)}>
            <span className="voice-check" aria-hidden="true">
              {value === v && <Icon name="check" size={13} strokeWidth={2.4} />}
            </span>
            <span className="grow">
              <b>{VOICES[v].label}</b>
              <span className="label">{VOICES[v].note}</span>
            </span>
          </button>
          <button
            type="button"
            className={'btn icon small ghost voice-play' + (playing === v ? ' playing' : '')}
            aria-label={playing === v ? `Stop ${VOICES[v].label}` : `Hear ${VOICES[v].label}`}
            onClick={() => play(v)}
          >
            {playing === v ? <span className="voice-bars" aria-hidden="true"><i /><i /><i /></span> : <Icon name="play" size={15} />}
          </button>
        </div>
      ))}
    </div>
  );
}
