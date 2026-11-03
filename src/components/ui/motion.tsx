'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Scroll-triggered reveal.
 *
 * Content is server-rendered and visible in the HTML; this only adds the
 * entrance transition once the element approaches the viewport, so the page is
 * readable even if JavaScript never runs. Honors `prefers-reduced-motion`
 * through the `.reveal` rules in globals.css.
 */
export function Reveal({
  children,
  delay = 0,
  variant = 'up',
  className = '',
  as: Tag = 'div',
  once = true,
}: {
  children: React.ReactNode;
  delay?: number;
  variant?: 'up' | 'left' | 'scale';
  className?: string;
  as?: 'div' | 'section' | 'article' | 'li' | 'header' | 'aside';
  once?: boolean;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            if (once) observer.unobserve(entry.target);
          } else if (!once) {
            setVisible(false);
          }
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [once]);

  const variantClass =
    variant === 'left' ? 'reveal reveal-left' : variant === 'scale' ? 'reveal reveal-scale' : 'reveal';

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      data-visible={visible ? 'true' : 'false'}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
      className={`${variantClass} ${className}`}
    >
      {children}
    </Tag>
  );
}

/**
 * Counts a figure up once it scrolls into view. The final value is rendered on
 * the server, so no-JS visitors and search engines see the real number.
 */
export function CountUp({
  value,
  duration = 1400,
  format,
  className = '',
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [display, setDisplay] = useState(value);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reduced || value === 0) {
      setDisplay(value);
      return;
    }

    setDisplay(0);

    const run = () => {
      if (started.current) return;
      started.current = true;
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / duration);
        // easeOutExpo keeps the last few units feeling like they land
        const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        setDisplay(Math.round(value * eased));
        if (progress < 1) requestAnimationFrame(tick);
        else setDisplay(value);
      };
      requestAnimationFrame(tick);
    };

    if (typeof IntersectionObserver === 'undefined') {
      run();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          run();
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, duration]);

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {format ? format(display) : display.toLocaleString('en-US')}
    </span>
  );
}

/** Adds a shadow and tighter background to the public header after the first scroll. */
export function useScrolled(threshold = 12) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);
  return scrolled;
}
