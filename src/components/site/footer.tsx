import Link from 'next/link';
import { Mark } from '@/components/entry/mark';
import s from './site.module.css';

export function Footer() {
  return (
    <footer className={s.footer}>
      <div className={s.footTop}>
        <div>
          <Link className={s.wordmark} href="/welcome">
            <Mark size={24} />
            Fieldwork
          </Link>
          <p className={s.footAbout}>
            A private learning system, built by one person, for the way people
            actually learn. Accounts are added by hand.
          </p>
        </div>
        <div className={s.footCol}>
          <h2>Product</h2>
          <Link href="/how-it-works">How it works</Link>
          <Link href="/changelog">Changelog</Link>
          <Link href="/request-access">Request access</Link>
        </div>
        <div className={s.footCol}>
          <h2>Account</h2>
          <Link href="/login">Sign in</Link>
          <Link href="/login">Install the app</Link>
        </div>
      </div>
      <div className={s.footBase}>
        <span>© 2026 Fieldwork</span>
        <span>Made for mornings.</span>
      </div>
    </footer>
  );
}

// The closing call to action shared by the long pages.
export function MarkGrid({ mint = false }: { mint?: boolean }) {
  return (
    <div className={`${s.markGrid} ${mint ? s.markMint : ''}`} aria-hidden>
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} data-lit={i === 2 ? '' : undefined} />
      ))}
    </div>
  );
}
