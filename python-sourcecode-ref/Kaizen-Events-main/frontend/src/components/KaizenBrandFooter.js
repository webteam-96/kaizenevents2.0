import React from 'react';

// Kaizen Events branding band shown under every public registration form.
// Rendered from PublicRegistration itself rather than stored in a form's config, so it
// appears on every form automatically — existing ones included — with nothing for an
// organiser to configure or accidentally delete.
//
// Deliberately a short horizontal band, not a hero block: it sits at the end of a form the
// visitor is trying to finish, so it has to read as a footer rather than take a screen of
// its own. Pinned to the viewport so the CTA is visible without scrolling to the end.
const CONTACT_URL = 'https://kaizenevents.live/contact';

const NAVY = '#091D40';   // brand navy, same value the marketing site and events listing use
const GOLD = '#CC9C4C';

const KaizenBrandFooter = () => (
  // z-30 keeps the band under the form's own dropdowns and dialogs (z-50), which must be able
  // to open over it. The caller reserves matching bottom padding so no field hides behind it.
  <footer
    className="fixed bottom-0 left-0 right-0 z-30 w-full shadow-[0_-2px_12px_rgba(0,0,0,0.18)]"
    style={{ backgroundColor: NAVY }}
  >
    {/* Wide container so the mark and the CTA sit at opposite edges rather than bunching in
        the middle. items-center keeps the logo chip, heading and button on one optical line. */}
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-6">
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        {/* Logo sits on white — the mark is dark navy and would disappear on this background */}
        <span className="bg-white rounded-md px-2.5 py-1.5 shrink-0 inline-flex items-center">
          <img
            src="/kaizen-events-logo.png"
            alt="Kaizen Events"
            className="h-9 sm:h-11 w-auto"
            loading="lazy"
          />
        </span>
        <p className="font-serif text-white text-sm sm:text-lg font-bold leading-snug text-center sm:text-left">
          Want to Host an Event with Kaizen Events?
        </p>
      </div>

      {/* New tab on purpose: this sits below a part-filled registration form, and navigating
          away in the same tab would throw away whatever the registrant has already typed. */}
      <a
        href={CONTACT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 px-6 py-3 text-[11px] sm:text-xs font-bold tracking-[0.12em] uppercase rounded-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#091D40]"
        style={{ backgroundColor: GOLD, color: NAVY }}
      >
        Get in Touch
      </a>
    </div>
  </footer>
);

export default KaizenBrandFooter;
