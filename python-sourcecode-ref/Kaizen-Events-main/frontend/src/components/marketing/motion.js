import React, { useEffect, useRef, useState } from 'react';
import { motion, useInView, animate, useReducedMotion } from 'framer-motion';

/* Shared easing + variants for the marketing pages (framer-motion) */
export const EASE = [0.22, 1, 0.36, 1];

export const cardVariant = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};

/* Single element that fades + slides up when scrolled into view.
   Uses the useInView hook + controlled `animate` (instead of whileInView) so it
   fires reliably under React.StrictMode's double-mount on the dev server. */
export const MReveal = ({ children, className = '', delay = 0, y = 34, as = 'div', amount = 0.2 }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { amount });
  const Tag = motion[as] || motion.div;
  return (
    <Tag
      ref={ref}
      className={className}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 0.65, delay, ease: EASE }}
    >
      {children}
    </Tag>
  );
};

/* Container that staggers its <MItem> children into view.
   Drives the stagger via a controlled `animate` label keyed off useInView.
   Pass `immediate` for above-the-fold blocks (e.g. the hero) so they play on
   page load instead of waiting for a scroll. */
export const MStagger = ({ children, className = '', stagger = 0.09, amount = 0.15, delayChildren = 0, immediate = false }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { amount });
  const show = immediate || inView;
  return (
    <motion.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={show ? 'show' : 'hidden'}
      variants={{ hidden: {}, show: { transition: { staggerChildren: stagger, delayChildren } } }}
    >
      {children}
    </motion.div>
  );
};

/* Generic in-view reveal with custom from/to states (e.g. scale/x slides).
   Same StrictMode-safe useInView pattern as MReveal. */
export const MShow = ({ children, className = '', from, to, transition, amount = 0.25, as = 'div', immediate = false }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { amount });
  const Tag = motion[as] || motion.div;
  const show = immediate || inView;
  return (
    <Tag ref={ref} className={className} initial={from} animate={show ? to : from} transition={transition}>
      {children}
    </Tag>
  );
};

/* SplitText — reveals a heading word-by-word (by="word", default) or
   letter-by-letter (by="char"), each unit rising + fading in sequence when the
   heading scrolls into view. Re-runs on every entry.

   Pass `text` + `wordClassName` for a single-style heading, or `segments`
   ([{ text, className }]) for mixed colors (e.g. the hero's accent span). Each
   animated unit carries its own className so a gradient text-clip stays visible
   (a transformed child breaks a parent's background-clip). */
export const SplitText = ({
  text,
  segments,
  className = '',
  wordClassName = '',
  as = 'h2',
  by = 'word',
  stagger = 0.06,
  amount = 0.4,
  delay = 0,
  duration = 0.6,
  y = '0.6em',
}) => {
  const ref = useRef(null);
  const inView = useInView(ref, { amount });
  const reduce = useReducedMotion();
  const Tag = motion[as] || motion.h2;

  const segs = segments && segments.length
    ? segments
    : [{ text: String(text), className: wordClassName }];

  // Flatten to words (dropping empties from incidental double spaces),
  // each tagged with the className of the segment it came from.
  const words = [];
  segs.forEach((seg) => {
    String(seg.text).split(' ').forEach((w) => {
      if (w.length) words.push({ w, className: seg.className || '' });
    });
  });
  const label = segs.map((s) => s.text).join(' ');

  let idx = 0; // running unit index → drives the entrance stagger + wave phase
  const unit = (content, cls) => {
    const i = idx;
    idx += 1;
    const entranceDelay = inView ? delay + i * stagger : 0;
    return (
      // outer: one-time viewport entrance (fade + rise)
      <motion.span
        aria-hidden="true"
        style={{ display: 'inline-block', willChange: 'transform' }}
        initial={{ y, opacity: 0 }}
        animate={inView ? { y: 0, opacity: 1 } : { y, opacity: 0 }}
        transition={{ duration, ease: EASE, delay: entranceDelay }}
      >
        {/* inner: continuous bob — staggered phase makes a travelling wave */}
        <motion.span
          className={cls}
          style={{ display: 'inline-block', paddingBottom: '0.16em', willChange: 'transform' }}
          animate={reduce ? undefined : { y: ['0%', '-8%', '0%'] }}
          transition={reduce ? undefined : { duration: 3, repeat: Infinity, ease: 'easeInOut', delay: (i % 10) * 0.18 }}
        >
          {content}
        </motion.span>
      </motion.span>
    );
  };

  return (
    <Tag ref={ref} className={className} aria-label={label}>
      {words.map((token, wi) => (
        <React.Fragment key={`${token.w}-${wi}`}>
          {by === 'char' ? (
            // keep each word intact (no mid-word wrapping) while its letters animate
            <span aria-hidden="true" style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
              {Array.from(token.w).map((ch, ci) => (
                <React.Fragment key={ci}>{unit(ch, token.className)}</React.Fragment>
              ))}
            </span>
          ) : (
            unit(token.w, token.className)
          )}
          {wi < words.length - 1 ? ' ' : ''}
        </React.Fragment>
      ))}
    </Tag>
  );
};

export const MItem = ({ children, className = '', y = 24, whileHover }) => (
  <motion.div
    className={className}
    variants={{ hidden: { opacity: 0, y }, show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } } }}
    whileHover={whileHover}
  >
    {children}
  </motion.div>
);

/* Animated number that counts up from 0 the first time it scrolls into view.
   Handles values like "500+", "3 Lakh+", "200+", "₹48.2L". */
export const CountUp = ({ value, className = '' }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { amount: 0.6 });

  const str = String(value);
  const match = str.match(/^([^\d]*)([\d,]*\.?\d+)(.*)$/);
  const prefix = match ? match[1] : '';
  const numStr = match ? match[2].replace(/,/g, '') : '0';
  const suffix = match ? match[3] : '';
  const target = parseFloat(numStr) || 0;
  const decimals = numStr.includes('.') ? numStr.split('.')[1].length : 0;
  const fmt = (v) => v.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  const [disp, setDisp] = useState(`${prefix}${fmt(0)}${suffix}`);

  useEffect(() => {
    if (!inView) {
      setDisp(`${prefix}${fmt(0)}${suffix}`);
      return undefined;
    }
    const controls = animate(0, target, {
      duration: 1.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisp(`${prefix}${fmt(v)}${suffix}`),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView]);

  return <span ref={ref} className={className}>{disp}</span>;
};
