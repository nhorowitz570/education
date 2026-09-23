import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Mark } from '@/components/entry/mark';
import { Markdown } from '@/components/ui';
import { Visual } from '@/components/viz/visual';
import { LEVEL_LABEL } from '@/lib/notebook';
import { shareCard } from '@/lib/server/shares';
import './card.css';

// A single idea from someone's Notebook, shared by link. Public, unindexed,
// and gone as soon as its owner turns the link off.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const share = await shareCard(token);
  if (!share) return { title: 'Fieldwork', robots: { index: false, follow: false } };
  const { card } = share;
  const description = card.summary || `An idea from ${card.name ? card.name + '’s' : 'a'} Fieldwork notebook.`;
  return {
    title: `${card.title} · Fieldwork`,
    description,
    robots: { index: false, follow: false },
    openGraph: { title: card.title, description, images: [{ url: `/c/${token}/image`, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title: card.title, description, images: [`/c/${token}/image`] },
  };
}

export default async function SharedCard({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = await shareCard(token, true);
  if (!share) notFound();
  const { card } = share;
  return (
    <main className={'shared-card t-' + card.track}>
      <article className="sc-card">
        <p className="eyebrow sc-eyebrow">
          <i className="dot" aria-hidden="true" /> {card.trackTitle}
          {card.level && card.track !== 'explore' ? ` · ${LEVEL_LABEL[card.level] || card.level}` : ''}
        </p>
        <h1 className="sc-title">{card.title}</h1>
        {card.summary && <p className="sc-summary">{card.summary}</p>}
        {card.words && (
          <figure className="sc-words">
            <blockquote>{card.words}</blockquote>
            <figcaption className="label">{card.name ? `${card.name}, in their own words` : 'In the learner’s own words'}</figcaption>
          </figure>
        )}
        {card.explanation && <Markdown src={card.explanation} />}
        {card.visual && (
          <div className="sc-visual">
            <Visual spec={card.visual} animate={false} />
          </div>
        )}
      </article>
      <footer className="sc-foot">
        <Link href="/welcome" className="sc-brand">
          <Mark size={24} /> Fieldwork
        </Link>
        <span className="label">A private tutor that learns how you learn.</span>
      </footer>
    </main>
  );
}
