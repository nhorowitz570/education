'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Mark } from '@/components/entry/mark';
import s from './site.module.css';

const LINKS = [
  { href: '/how-it-works', label: 'How it works' },
  { href: '/changelog', label: 'Changelog' },
];

export function Nav() {
  const path = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    addEventListener('keydown', close);
    return () => removeEventListener('keydown', close);
  }, [open]);
  const current = (href: string) => (path === href ? 'page' : undefined);
  return (
    <>
      <div ref={sentinel} aria-hidden style={{ position: 'absolute', top: 8, height: 1, width: 1 }} />
      <header
        className={[s.nav, scrolled || open ? s.navScrolled : '', open ? s.menuOpen : ''].join(' ')}
      >
        <div className={s.navInner}>
          <Link className={s.wordmark} href="/welcome">
            <Mark size={26} />
            Fieldwork
          </Link>
          <nav className={s.navLinks} aria-label="Primary">
            {LINKS.map((l) => (
              <Link key={l.href} className={s.navLink} href={l.href} aria-current={current(l.href)}>
                {l.label}
              </Link>
            ))}
            <Link className={s.navLink} href="/login">
              Sign in
            </Link>
            <Link
              className={`${s.btn} ${s.primary} ${s.navCta}`}
              href="/request-access"
              aria-current={current('/request-access')}
            >
              Request access
            </Link>
          </nav>
          <button
            className={s.menuButton}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="site-menu"
            onClick={() => setOpen((o) => !o)}
          >
            <span />
          </button>
        </div>
        <nav id="site-menu" className={s.sheet} aria-label="Menu" inert={!open}>
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={current(l.href)}>
              {l.label}
            </Link>
          ))}
          <Link href="/login">Sign in</Link>
          <Link className={`${s.btn} ${s.primary}`} href="/request-access">
            Request access
          </Link>
        </nav>
      </header>
    </>
  );
}
