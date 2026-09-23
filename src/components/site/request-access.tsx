'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { MarkGrid } from './footer';
import s from './site.module.css';

const LEARN_NOW = ['Online courses', 'Books', 'YouTube', 'A coach or tutor', 'I mostly don’t'];
const PAY = ['Yes, if it works', 'Maybe', 'Only if it’s free'];
const LIMIT = 400;

export function RequestAccess() {
  const params = useSearchParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [learn, setLearn] = useState('');
  const [now, setNow] = useState<string[]>([]);
  const [pay, setPay] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ email?: string; learn?: string; form?: string }>({});
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const honey = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const learnRef = useRef<HTMLTextAreaElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Enter an email address I can reply to.';
    if (learn.trim().length < 3) next.learn = 'A few words is plenty.';
    setErrors(next);
    if (next.email) return emailRef.current?.focus();
    if (next.learn) return learnRef.current?.focus();
    setState('busy');
    try {
      const res = await fetch('/api/interest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          learn: learn.trim(),
          learnsWith: now,
          wouldPay: pay,
          website: honey.current?.value ?? '',
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error);
      setState('sent');
    } catch (err) {
      setState('idle');
      setErrors({
        form: err instanceof Error && err.message ? err.message : 'That didn’t go through. Try again in a moment.',
      });
    }
  }

  return (
    <section className={s.request}>
      <div className={s.pitch}>
        <h1 className={`${s.display} ${s.pitchTitle}`}>
          <span className={s.heroLine}>
            <span>Private,</span>
          </span>
          <span className={s.heroLine}>
            <span>for now.</span>
          </span>
        </h1>
        <p className={s.lede} style={{ maxWidth: '23em' }}>
          Fieldwork started as one person&rsquo;s way to keep learning on purpose.
          If it sounds like something you&rsquo;d use, tell me a little about you.
          It helps me decide whether to open it up.
        </p>
        <ol className={`${s.next} ${s.rv}`} data-reveal>
          <li>I read every response myself.</li>
          <li>If there&rsquo;s real interest, I&rsquo;ll open a small group first.</li>
          <li>You&rsquo;ll get one email when that happens. Nothing else.</li>
        </ol>
      </div>

      {state === 'sent' ? (
        <div className={`${s.card} ${s.sent}`} role="status" tabIndex={-1} ref={(el) => el?.focus()}>
          <MarkGrid mint />
          <h2 className={s.sentTitle}>You&rsquo;re on the list.</h2>
          <p>
            Thanks{name.trim() ? `, ${name.trim().split(' ')[0]}` : ''}. If Fieldwork
            opens up, you&rsquo;ll hear about it first at {email.trim()}.
          </p>
          <div className={s.sentActions}>
            <Link className={s.btn} href="/how-it-works">
              See how it works
            </Link>
            <Link className={`${s.btn} ${s.ghost}`} href="/changelog">
              Read the changelog
            </Link>
          </div>
        </div>
      ) : (
        <form className={`${s.card} ${s.form} ${s.rv}`} data-reveal onSubmit={submit} noValidate>
          <div className={s.fields2}>
            <div className={s.fieldBlock}>
              <label className={s.label} htmlFor="ra-name">
                Your name
              </label>
              <input id="ra-name" className={s.control} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </div>
            <div className={`${s.fieldBlock} ${errors.email ? s.invalid : ''}`}>
              <label className={s.label} htmlFor="ra-email">
                Email
              </label>
              <input
                id="ra-email"
                ref={emailRef}
                className={s.control}
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'ra-email-error' : undefined}
                maxLength={200}
              />
              {errors.email && (
                <span id="ra-email-error" className={s.error}>
                  {errors.email}
                </span>
              )}
            </div>
          </div>
          <div className={`${s.fieldBlock} ${errors.learn ? s.invalid : ''}`}>
            <label className={s.label} htmlFor="ra-learn">
              What would you want to learn?
              <span>
                {learn.length} / {LIMIT}
              </span>
            </label>
            <textarea
              id="ra-learn"
              ref={learnRef}
              className={s.control}
              required
              maxLength={LIMIT}
              value={learn}
              onChange={(e) => setLearn(e.target.value)}
              placeholder="Enough finance to run my studio without guessing…"
              aria-invalid={!!errors.learn}
              aria-describedby={errors.learn ? 'ra-learn-error' : undefined}
            />
            {errors.learn && (
              <span id="ra-learn-error" className={s.error}>
                {errors.learn}
              </span>
            )}
          </div>
          <fieldset className={s.fieldBlock} style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className={s.label} style={{ width: '100%', paddingBottom: 10 }}>
              How do you learn today?
              <span>Pick any</span>
            </legend>
            <div className={s.choices}>
              {LEARN_NOW.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={s.chip}
                  aria-pressed={now.includes(c)}
                  onClick={() => setNow((n) => (n.includes(c) ? n.filter((x) => x !== c) : [...n, c]))}
                >
                  {c}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className={s.fieldBlock} style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className={s.label} style={{ width: '100%', paddingBottom: 10 }}>
              Would you pay for this?
              <span>Honest answers help most</span>
            </legend>
            <div className={s.choices}>
              {PAY.map((c) => (
                <button key={c} type="button" className={s.chip} aria-pressed={pay === c} onClick={() => setPay((p) => (p === c ? null : c))}>
                  {c}
                </button>
              ))}
            </div>
          </fieldset>
          <div className={s.honey} aria-hidden>
            <label htmlFor="ra-website">Website</label>
            <input id="ra-website" ref={honey} tabIndex={-1} autoComplete="off" />
          </div>
          <button className={`${s.btn} ${s.primary} ${s.submit}`} type="submit" disabled={state === 'busy'}>
            {state === 'busy' ? 'Sending…' : 'Request access'}
          </button>
          {errors.form ? (
            <p className={s.error} role="alert" style={{ textAlign: 'center', marginTop: -10 }}>
              {errors.form}
            </p>
          ) : (
            <p className={s.fine}>Your answers are only read by me. Nothing is shared or sold.</p>
          )}
        </form>
      )}
    </section>
  );
}
