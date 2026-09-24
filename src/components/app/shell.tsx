'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ViewTransition, type ReactNode } from 'react';
import { Icon } from '@/components/icons';
import { Mark } from '@/components/entry/mark';
import { useApp } from './provider';
import { InstallControl } from '@/components/pwa';
import { TutorDock, TUTOR_TOGGLE } from '@/components/tutor/chat';
import { Aperture } from '@/components/tutor/aperture';

export const NAV = [
  { href: '/', label: 'Today', icon: 'today' },
  { href: '/learn', label: 'Learn', icon: 'learn' },
  { href: '/practice', label: 'Practice', icon: 'practice' },
  { href: '/mastery', label: 'Mastery', icon: 'mastery' },
  // Wide screens only; phones reach it from Mastery, Today and each session's end.
  { href: '/notebook', label: 'Notebook', icon: 'notebook', rail: true },
  { href: '/venture', label: 'Venture', icon: 'venture' },
  // Wide screens only; phones reach it from Mastery and Today.
  { href: '/insights', label: 'Insights', icon: 'insights', rail: true },
  // Phones reach Life from Today, keeping the tab bar to five.
  { href: '/life', label: 'Life', icon: 'life', rail: true },
] as const;

const active = (path: string, href: string) => (href === '/' ? path === '/' : path.startsWith(href));

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { w } = useApp();
  // A running session is a focused space: no navigation competes with it.
  const focus = path.startsWith('/session/') || /^\/practice\/[^/]+/.test(path) || path === '/dev/preview/session';
  const initials = (w.state.plan?.profile.name || 'You')
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className={'app' + (focus ? ' focus' : '') + (path === '/' ? ' on-today' : '')}>
        {!focus && (
          <nav className="rail" aria-label="Main">
            <Link href="/" className="rail-mark" aria-label="Today">
              <Mark size={30} />
              <span className="rail-word">Fieldwork</span>
            </Link>
            <div className="rail-items">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={'rail-item' + (n.href === '/life' ? ' secondary' : '')}
                  aria-current={active(path, n.href) ? 'page' : undefined}
                >
                  <Icon name={n.icon} size={21} />
                  <span>{n.label}</span>
                </Link>
              ))}
            </div>
            <Link href="/you" className="rail-you" aria-label="You and settings" aria-current={path.startsWith('/you') ? 'page' : undefined}>
              <span className="rail-initials">{initials}</span>
              <span className="rail-who">
                <b>{w.state.plan?.profile.name || 'You'}</b>
                <span>Settings and memory</span>
              </span>
            </Link>
          </nav>
        )}
        <main id="main" tabIndex={-1} className="main">
          {!focus && (w.error || !w.online || w.pending > 0) && (
            <div className="banner" role="status">
              <span className="row-inline">
                <i className="dot" />
                {w.error ||
                  (!w.online
                    ? 'Offline. Saved sessions and logging still work.'
                    : `${w.pending} change${w.pending === 1 ? '' : 's'} waiting to sync.`)}
              </span>
              {w.online && (w.pending > 0 || w.error) && (
                <button className="btn small ghost" onClick={() => void w.sync()}>
                  Retry
                </button>
              )}
            </div>
          )}
          <ViewTransition name="page">{children}</ViewTransition>
        </main>
        {!focus && (
          <nav className="tabbar" aria-label="Main">
            {NAV.filter((n) => !('rail' in n)).map((n) => (
              <Link key={n.href} href={n.href} aria-current={active(path, n.href) ? 'page' : undefined}>
                <Icon name={n.icon} size={22} />
                <span>{n.label}</span>
              </Link>
            ))}
            <button type="button" className="tab-tutor" onClick={() => window.dispatchEvent(new Event(TUTOR_TOGGLE))}>
              <Aperture size={22} />
              <span>Tutor</span>
            </button>
          </nav>
        )}
      </div>
      {!focus && <InstallControl pending={w.pending} />}
      {!focus && <TutorDock page={path} />}
    </>
  );
}
