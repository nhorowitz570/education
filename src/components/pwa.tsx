'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { Button } from './ui';
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
const DISMISSED = 'fieldwork-install-dismissed';
export function InstallControl({ pending }: { pending: number }) {
  const [install, setInstall] = useState<InstallEvent>(),
    [waiting, setWaiting] = useState<ServiceWorker>();
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // Development chunks are not content-hashed; a cache-first worker would
    // serve stale code, so it only runs in production builds.
    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => void r.unregister()));
      return;
    }
    void navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        const watch = (sw: ServiceWorker | null) => {
          sw?.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) setWaiting(sw);
          });
        };
        watch(reg.installing);
        reg.addEventListener('updatefound', () => watch(reg.installing));
      })
      .catch(() => {});
    const onInstall = (e: Event) => {
      e.preventDefault();
      let dismissed = false;
      try {
        dismissed = localStorage.getItem(DISMISSED) === '1';
      } catch {}
      if (!dismissed) setInstall(e as InstallEvent);
    };
    window.addEventListener('beforeinstallprompt', onInstall);
    return () => window.removeEventListener('beforeinstallprompt', onInstall);
  }, []);
  if (waiting)
    return (
      <div className="install" role="status">
        <span>{pending ? 'Update ready after your changes sync.' : 'An update is ready.'}</span>
        <Button
          kind="primary small"
          disabled={pending > 0}
          onClick={() => {
            navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
            waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
          }}
        >
          Reload
        </Button>
      </div>
    );
  if (!install) return null;
  return (
    <div className="install" role="status">
      <span>Install for a full-screen app.</span>
      <Button
        kind="primary small"
        onClick={async () => {
          await install.prompt();
          await install.userChoice;
          setInstall(undefined);
        }}
      >
        Install
      </Button>
      <Button
        kind="ghost small"
        onClick={() => {
          try {
            localStorage.setItem(DISMISSED, '1');
          } catch {}
          setInstall(undefined);
        }}
      >
        Not now
      </Button>
    </div>
  );
}
export async function requestPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window))
    throw new Error(
      'This browser does not support Web Push here. On iPhone, add the app to your Home Screen first.',
    );
  const permission = await Notification.requestPermission();
  if (permission !== 'granted')
    throw new Error(
      'Notifications are not enabled. You can change permission in browser or device settings.',
    );
  const { key } = await api<{ key: string }>('/api/push');
  const normalized = key.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(
    atob(normalized + '='.repeat((4 - (normalized.length % 4)) % 4)),
    (c) => c.charCodeAt(0),
  );
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: bytes,
    }));
  await api('/api/push', sub.toJSON());
}
