'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { Icon } from '@/components/icons';
import { Conversation } from './conversation';
import type { PracticeView } from '@/lib/server/practice';

export function PracticeRoom({ id }: { id: string }) {
  const [practice, setPractice] = useState<PracticeView | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    void api<{ practice: PracticeView }>(`/api/practice/${id}`)
      .then((r) => setPractice(r.practice))
      .catch((e) => setError((e as Error).message));
  }, [id]);
  return (
    <div className="room">
      <header className="room-top">
        <Link href="/practice" className="btn icon ghost" aria-label="Back to practice">
          <Icon name="back" size={20} />
        </Link>
        <p className="session-title">{practice?.title || ''}</p>
        <span />
      </header>
      <div className="room-body">
        {error ? (
          <p className="conversation-error">{error}</p>
        ) : practice ? (
          <Conversation initial={practice} />
        ) : (
          <div className="skeleton line" style={{ width: '40%', margin: '48px auto' }} />
        )}
      </div>
    </div>
  );
}
