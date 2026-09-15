'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Feature reel — hands-off.
 *
 * One panel plays a chapter's three visuals in a loop. Nothing to click: the
 * reel advances on its own, the caption strip beneath shows which of the
 * three is on screen with a sliding highlight and a filling progress line,
 * and a small counter keeps the position legible. Hovering pauses it so a
 * reader can dwell. Reduced motion shows the first visual at rest.
 *
 * The transition is a deck shuffle: the outgoing visual lifts, softens and
 * recedes while the next rises from below with a slight tilt — one motion,
 * not a fade.
 */

const INTERVAL_MS = 6500;

export interface FeatureTab {
  icon: ReactNode;
  title: string;
  body: string;
}

export function FeatureReel({ tabs, visuals }: { tabs: FeatureTab[]; visuals: ReactNode[] }) {
  const [active, setActive] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [cycle, setCycle] = useState(0);
  const [inView, setInView] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const node = rootRef.current;
    if (!node) return;
    // Only run the clock while the reel is on screen.
    const io = new IntersectionObserver((entries) => setInView(entries.some((e) => e.isIntersecting)), {
      threshold: 0.25,
    });
    io.observe(node);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (paused || !inView || reduced.current) return;
    const id = window.setTimeout(() => {
      setPrev(active);
      setActive((i) => (i + 1) % tabs.length);
      setCycle((c) => c + 1);
    }, INTERVAL_MS);
    return () => window.clearTimeout(id);
  }, [active, paused, inView, cycle, tabs.length]);

  const running = inView && !paused;

  return (
    <div
      ref={rootRef}
      className="reel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="reel-panel">
        {visuals.map((visual, i) => {
          const state = i === active ? 'is-active' : i === prev ? 'is-leaving' : '';
          return (
            <div key={i} className={`reel-slide ${state}`.trim()} aria-hidden={i !== active}>
              {visual}
            </div>
          );
        })}
        <span className="reel-counter" aria-hidden="true">
          <span key={active} className="reel-counter-n">{String(active + 1).padStart(2, '0')}</span>
          <span className="reel-counter-of">/ {String(tabs.length).padStart(2, '0')}</span>
        </span>
      </div>

      <ol className="reel-captions" aria-label="What this shows">
        <span className="reel-highlight" style={{ transform: `translateX(${active * 100}%)` }} aria-hidden="true" />
        {tabs.map((tab, i) => (
          <li key={tab.title} className={`reel-caption${i === active ? ' is-active' : ''}`} aria-current={i === active}>
            <span className="reel-caption-bar" aria-hidden="true">
              <span
                key={`${i}-${cycle}`}
                className="reel-caption-fill"
                style={{
                  animationDuration: `${INTERVAL_MS}ms`,
                  animationPlayState: running ? 'running' : 'paused',
                }}
              />
            </span>
            <span className="reel-caption-icon" aria-hidden="true">{tab.icon}</span>
            <span className="reel-caption-title">{tab.title}</span>
            <span className="reel-caption-body">{tab.body}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
