(async () => {
  const request = indexedDB.open('fieldwork-private-v1', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('data');
  const db = await new Promise((res, rej) => {
    request.onsuccess = () => res(request.result);
    request.onerror = rej;
  });
  function get(key) {
    return new Promise((res) => {
      const r = db.transaction('data').objectStore('data').get(key);
      r.onsuccess = () => res(r.result);
    });
  }
  const owner = await get('owner');
  if (!owner || owner === 'preview') {
    document.querySelector('#status').textContent =
      'Open your account online once to save lessons for offline use.';
    return;
  }
  const state = await get('state');
  const keys = await new Promise((res) => {
    const r = db.transaction('data').objectStore('data').getAllKeys();
    r.onsuccess = () => res(r.result);
  });
  for (const key of keys.filter((k) => String(k).startsWith('lesson:'))) {
    const lesson = await get(key),
      article = document.createElement('article'),
      h = document.createElement('h2'),
      p = document.createElement('p'),
      source = document.createElement('p');
    h.textContent = lesson.title;
    p.textContent = lesson.scenario + '\n\n' + lesson.explanation;
    source.textContent =
      'Saved source: ' + lesson.sources.map((s) => s.title).join(', ');
    article.append(h, p, source);
    document.querySelector('#lessons').append(article);
  }
  const form = document.querySelector('#checkin');
  form.hidden = false;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = new FormData(form),
      now = new Date(),
      date = new Intl.DateTimeFormat('en-CA', {
        timeZone: state?.plan?.schedule?.timezone || 'America/Los_Angeles',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(now),
      command = {
        type: 'record',
        eventId: crypto.randomUUID(),
        record: {
          id: 'checkin:' + date,
          kind: 'checkin',
          data: {
            date,
            energy: Number(data.get('energy')),
            minutes: Number(data.get('minutes')),
            mood: 'Not recorded',
          },
          updated_at: now.toISOString(),
        },
      };
    const tx = db.transaction('data', 'readwrite');
    const store = tx.objectStore('data');
    const ownerCheck = store.get('owner');
    ownerCheck.onsuccess = () => {
      if (ownerCheck.result !== owner) {
        tx.abort();
        return;
      }
      const queued = store.get('queue');
      queued.onsuccess = () =>
        store.put([...(queued.result || []), command], 'queue');
    };
    tx.onabort = () => {
      form.hidden = true;
      document.querySelector('#lessons').replaceChildren();
      document.querySelector('#status').textContent =
        'Your account changed. Reopen Fieldwork online before saving.';
    };
    tx.oncomplete = () =>
      (document.querySelector('#status').textContent =
        'Saved on this device. It will sync when you open Fieldwork online.');
  };
  document.addEventListener('visibilitychange', async () => {
    if (
      document.visibilityState === 'visible' &&
      (await get('owner')) !== owner
    ) {
      form.hidden = true;
      document.querySelector('#lessons').replaceChildren();
      document.querySelector('#status').textContent =
        'Your account changed. Reopen Fieldwork online to continue.';
    }
  });
})().catch(() => {
  document.querySelector('#status').textContent =
    'Local storage is unavailable. Reconnect to continue.';
});
