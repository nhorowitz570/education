'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MarkGrid } from './footer';
import s from './site.module.css';

// Hands the email to the request page so the form there opens pre-filled.
export function Finale() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  return (
    <section className={s.finale} aria-labelledby="finale-title">
      <MarkGrid />
      <h2 id="finale-title" className={`${s.display} ${s.finaleTitle} ${s.rv}`} data-reveal>
        Want your own?
      </h2>
      <p className={`${s.lede} ${s.rv}`} data-reveal style={{ '--d': 1 } as React.CSSProperties}>
        Fieldwork is private for now. Tell me you&rsquo;re interested and
        you&rsquo;ll be first in line if it opens up.
      </p>
      <form
        className={`${s.finaleForm} ${s.rv}`}
        data-reveal
        style={{ '--d': 2 } as React.CSSProperties}
        onSubmit={(e) => {
          e.preventDefault();
          const q = email.trim();
          router.push('/request-access' + (q ? `?email=${encodeURIComponent(q)}` : ''));
        }}
      >
        <label className="sr-only" htmlFor="finale-email">
          Email
        </label>
        <input
          id="finale-email"
          className={s.input}
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className={`${s.btn} ${s.primary}`} type="submit">
          Request access
        </button>
      </form>
      <p className={s.small} style={{ fontWeight: 400 }}>
        One email if there&rsquo;s news. Nothing else.
      </p>
    </section>
  );
}
