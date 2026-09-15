'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * One panel, three visuals.
 *
 * The three sub-features under a chapter act as tabs. The panel above
 * cross-fades to the active one, advances on a timer, pauses while hovered,
 * and any tab can be picked directly. A thin progress bar on the active tab
 * shows how long until the next. Reduced-motion disables auto-advance.
 */

const INTERVAL_MS = 6500;

export interface FeatureTab {
  icon: ReactNode;
  title: string;
  body: string;
}

export function FeatureTabs({ tabs, visuals }: { tabs: FeatureTab[]; visuals: ReactNode[] }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [cycle, setCycle] = useState(0);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    if (paused || reduced.current) return;
    const id = window.setTimeout(() => {
      setActive((i) => (i + 1) % tabs.length);
      setCycle((c) => c + 1);
    }, INTERVAL_MS);
    return () => window.clearTimeout(id);
  }, [active, paused, cycle, tabs.length]);

  return (
    <div
      className="ftabs"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="ftabs-panel">
        {visuals.map((visual, i) => (
          <div key={i} className={`ftabs-slide${i === active ? ' is-active' : ''}`} aria-hidden={i !== active}>
            {visual}
          </div>
        ))}
      </div>

      <div className="ftabs-list" role="tablist">
        {tabs.map((tab, i) => (
          <button
            key={tab.title}
            role="tab"
            type="button"
            aria-selected={i === active}
            className={`ftab${i === active ? ' is-active' : ''}`}
            onClick={() => {
              setActive(i);
              setCycle((c) => c + 1);
            }}
          >
            <span className="ftab-bar" aria-hidden="true">
              <span
                key={`${i}-${cycle}`}
                className="ftab-bar-fill"
                style={{ animationDuration: `${INTERVAL_MS}ms`, animationPlayState: paused ? 'paused' : 'running' }}
              />
            </span>
            <span className="ftab-icon" aria-hidden="true">{tab.icon}</span>
            <span className="ftab-title">{tab.title}</span>
            <span className="ftab-body">{tab.body}</span>
            <span className="ftab-more">
              Learn more
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
