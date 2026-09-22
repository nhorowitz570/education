'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/workspace';
import { Button } from './ui';
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export function InstallControl({ pending }: { pending: number }) {
  const [install, setInstall] = useState<InstallEvent>(),
    [waiting, setWaiting] = useState<ServiceWorker>();
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        if (reg.waiting) setWaiting(reg.waiting);
        const watch = (sw: ServiceWorker | null) => {
          sw?.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller)
              setWaiting(sw);
          });
        };
        watch(reg.installing);
        reg.addEventListener('updatefound', () => watch(reg.installing));
      })
      .catch(() => {});
    const onInstall = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener('beforeinstallprompt', onInstall);
    return () => window.removeEventListener('beforeinstallprompt', onInstall);
  }, []);
  return (
    <div className="install-prompt">
      {install && (
        <Button
          kind="secondary"
          onClick={async () => {
            await install.prompt();
            await install.userChoice;
            setInstall(undefined);
          }}
        >
          Install Fieldwork
        </Button>
      )}
      {waiting && (
        <>
          <span>An update is ready. Save your current work first.</span>
          <Button
            kind="secondary"
            disabled={pending > 0}
            onClick={() => {
              waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
              navigator.serviceWorker.addEventListener(
                'controllerchange',
                () => location.reload(),
                { once: true },
              );
            }}
          >
            Reload when ready
          </Button>
        </>
      )}
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
