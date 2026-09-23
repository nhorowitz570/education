'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// One observer for every page on the public site. Anything marked
// data-reveal gains data-shown the first time it scrolls into view, and the
// CSS does the rest. Content rendered later (filters, form states) is picked
// up by watching the tree.
export function Motion() {
  const path = usePathname();
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const seen = new WeakSet<Element>();
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.setAttribute('data-shown', '');
          io.unobserve(e.target);
        }),
      { rootMargin: '0px 0px -10% 0px', threshold: 0.12 },
    );
    const scan = () =>
      document.querySelectorAll('[data-reveal]:not([data-shown])').forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        if (reduce) el.setAttribute('data-shown', '');
        else io.observe(el);
      });
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [path]);
  return null;
}
