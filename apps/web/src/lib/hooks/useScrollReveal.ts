'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Tracks whether the ref'd element has scrolled into view, so a chart can
 * animate in the first time a user reaches it rather than animating on
 * every mount (which would just look like a flash on page load for
 * above-the-fold charts). Fires once, then stops observing — scrolling
 * back past the element doesn't replay the animation.
 */
export function useScrollReveal<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, revealed };
}
