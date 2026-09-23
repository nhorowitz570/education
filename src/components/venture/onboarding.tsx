'use client';
import { useState } from 'react';
import { Icon } from '@/components/icons';
import { KINDS, type KindId } from '@/lib/venture/engine';
import { Scene } from './scene';
import { Portrait } from './portrait';

type Input = { kind: KindId; name: string; founder: string; loan: boolean };

const NAMES: Record<KindId, string[]> = {
  roastery: ['Ember Roasters', 'Second Crack', 'Northside Coffee', 'Good Bean Co.'],
  studio: ['Fieldnote Studio', 'Kern & Co.', 'Paper Plane', 'Brightline Design'],
  truck: ['Rolling Pin', 'Lunch Club', 'Curbside Kitchen', 'Big Wheel Tacos'],
};
const TEACHES: Record<KindId, string> = {
  roastery: 'Inventory, margins, seasonality and wholesale terms.',
  studio: 'Capacity, hiring and clients who pay 30 to 60 days late.',
  truck: 'Perishable stock, the weather and very thin margins.',
};
const STEPS = ['Title', 'Business', 'Name', 'Funding', 'How it works'] as const;

// The first time Venture opens: a title screen, then four quick choices.
export function Onboarding({ founder, onCreate }: { founder: string; onCreate: (input: Input) => Promise<void> }) {
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<KindId>('roastery');
  const [name, setName] = useState('');
  const [you, setYou] = useState(founder.split(' ')[0] || '');
  const [loan, setLoan] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const k = KINDS[kind];

  if (step === 0)
    return (
      <div className="vo vo-title">
        <div className="px-frame vo-hero">
          <Scene kind="roastery" name="Venture" equipment={1} staff={2} busy={0.7} queue={false} reputation={80} calendar={9} />
        </div>
        <h1 className="px-font vo-logo">Venture</h1>
        <p className="vo-tag">Run a company that remembers every decision. The numbers are real; so are the lessons.</p>
        <button className="px-btn primary big blink" onClick={() => setStep(1)} autoFocus>
          Press start <Icon name="arrow" size={16} />
        </button>
      </div>
    );

  const next = () => setStep((s) => s + 1);
  return (
    <div className="vo">
      <ol className="vo-steps" aria-label="Setting up">
        {STEPS.slice(1).map((s, i) => (
          <li key={s} className={i + 1 < step ? 'done' : i + 1 === step ? 'now' : ''} aria-current={i + 1 === step ? 'step' : undefined}>
            <span className="px-font">{i + 1}</span> {s}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section className="vo-panel" aria-labelledby="vo-h1">
          <h2 id="vo-h1" className="px-font vo-h">Pick your business</h2>
          <div className="vo-kinds" role="radiogroup" aria-label="Business">
            {(Object.keys(KINDS) as KindId[]).map((id) => (
              <button key={id} role="radio" aria-checked={kind === id} className={'px-box vo-kind' + (kind === id ? ' picked' : '')} onClick={() => setKind(id)}>
                <div className="px-frame small">
                  <Scene kind={id} name={KINDS[id].label} equipment={0} staff={0} busy={0.5} queue={false} reputation={60} calendar={5} still />
                </div>
                <b className="px-font">{KINDS[id].label}</b>
                <span className="muted">{KINDS[id].pitch}</span>
                <span className="label">Teaches: {TEACHES[id]}</span>
              </button>
            ))}
          </div>
          <div className="vo-actions">
            <button className="px-btn primary" onClick={next}>
              Choose {k.label.toLowerCase()} <Icon name="arrow" size={16} />
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="vo-panel" aria-labelledby="vo-h2">
          <h2 id="vo-h2" className="px-font vo-h">Name it</h2>
          <label className="vo-field">
            <span>Company name</span>
            <input className="input px-input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={NAMES[kind][0]} autoFocus />
          </label>
          <div className="vo-suggest">
            {NAMES[kind].map((n) => (
              <button key={n} className="chip" onClick={() => setName(n)}>
                {n}
              </button>
            ))}
          </div>
          <label className="vo-field">
            <span>Your name, as the founder</span>
            <input className="input px-input" value={you} maxLength={40} onChange={(e) => setYou(e.target.value)} placeholder="Founder" />
          </label>
          <div className="px-frame vo-preview">
            <Scene kind={kind} name={name || NAMES[kind][0]} equipment={0} staff={0} busy={0.4} queue={false} reputation={50} calendar={new Date().getMonth()} />
          </div>
          <div className="vo-actions">
            <button className="px-btn" onClick={() => setStep(1)}>
              Back
            </button>
            <button
              className="px-btn primary"
              onClick={() => {
                if (!name.trim()) setName(NAMES[kind][0]);
                next();
              }}
            >
              Continue <Icon name="arrow" size={16} />
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="vo-panel" aria-labelledby="vo-h3">
          <h2 id="vo-h3" className="px-font vo-h">How will you fund it?</h2>
          <div className="vo-kinds two" role="radiogroup" aria-label="Funding">
            <button role="radio" aria-checked={!loan} className={'px-box vo-kind' + (!loan ? ' picked' : '')} onClick={() => setLoan(false)}>
              <b className="px-font">Bootstrap</b>
              <span className="vo-money num">${k.startCash.toLocaleString()}</span>
              <span className="muted">Your own savings. No interest, no repayments, less room for mistakes.</span>
            </button>
            <button role="radio" aria-checked={loan} className={'px-box vo-kind' + (loan ? ' picked' : '')} onClick={() => setLoan(true)}>
              <b className="px-font">Savings + bank loan</b>
              <span className="vo-money num">${Math.round(k.startCash * 1.6).toLocaleString()}</span>
              <span className="muted">
                Borrow ${Math.round(k.startCash * 0.6).toLocaleString()} at 9%, repaid over two years. More cushion, and a repayment every month.
              </span>
            </button>
          </div>
          <div className="vo-actions">
            <button className="px-btn" onClick={() => setStep(2)}>
              Back
            </button>
            <button className="px-btn primary" onClick={next}>
              Continue <Icon name="arrow" size={16} />
            </button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="vo-panel" aria-labelledby="vo-h4">
          <h2 id="vo-h4" className="px-font vo-h">How Venture works</h2>
          <div className="vo-rules">
            <div className="px-box">
              <span className="px-font vo-num">1</span>
              <b>Plan, decide, run</b>
              <p className="muted">Each month you set prices, stock, staff and marketing, handle one event, then run the month.</p>
            </div>
            <div className="px-box">
              <span className="px-font vo-num">2</span>
              <b>Real books</b>
              <p className="muted">Revenue counts when it’s earned but arrives on the customer’s terms. Profit and cash will disagree, just as they do in real businesses.</p>
            </div>
            <div className="px-box">
              <span className="px-font vo-num">3</span>
              <b>Learning earns months</b>
              <p className="muted">You start with 3 months. Each session earns 2 more; a review or practice earns 1. What you study unlocks new tools here, and your company can turn up in your lessons.</p>
            </div>
          </div>
          <div className="vo-marta">
            <Portrait size={40} />
            <p>
              I’m Marta, your accountant. I’ll read the books with you at the end of every month. <span className="muted">Everything saves as you go.</span>
            </p>
          </div>
          {error && <p className="vg-error">{error}</p>}
          <div className="vo-actions">
            <button className="px-btn" onClick={() => setStep(3)} disabled={busy}>
              Back
            </button>
            <button
              className="px-btn primary big"
              data-busy={busy || undefined}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await onCreate({ kind, name: name.trim() || NAMES[kind][0], founder: you.trim(), loan });
                } catch (e) {
                  setError((e as Error).message);
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Signing the lease…' : 'Open for business'} <Icon name="arrow" size={16} />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
