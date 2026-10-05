import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Mounted once near the root (inside <BrowserRouter>, before <Routes>).
 *
 * React Router does NOT reset window scroll on route change by default, so
 * navigating from a long page (e.g. the campaigns list, scrolled half-way down)
 * to a detail/edit page lands the user wherever the previous page was scrolled
 * to. That's almost always wrong — the new page's header is offscreen.
 *
 * This component watches the pathname and forces scroll-to-top whenever the
 * route changes. Works for both client-side navigation (Link / navigate) and
 * external entry into a route (typed URL, browser back/forward).
 *
 * Renders nothing.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // 'auto' = instant; 'smooth' would animate, which feels janky on
    // every navigation. Match the OS-native page-load experience.
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);

  return null;
}
