import { Nav } from '@/components/site/nav';
import { Footer } from '@/components/site/footer';
import { Motion } from '@/components/site/motion';
import s from '@/components/site/site.module.css';

// The public site: welcome, how it works, changelog and request access.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={s.site}>
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <Nav />
      <main id="content">{children}</main>
      <Footer />
      <Motion />
      <noscript>
        <style>{'[data-reveal],[data-reveal] *{opacity:1!important;transform:none!important}'}</style>
      </noscript>
    </div>
  );
}
