'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

/**
 * Client-only mount for the Lightfall shader.
 *
 * A server component cannot use next/dynamic with ssr: false, so this thin
 * client wrapper does it. It also honours reduced motion by pausing the
 * render loop, and stays transparent until the WebGL canvas is ready so the
 * section's own dark ground shows in the meantime.
 */
const Lightfall = dynamic(() => import('./Lightfall'), { ssr: false });

export function LightfallBg() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  return (
    <Lightfall
      colors={['#A6C8FF', '#5227FF', '#FF9FFC']}
      backgroundColor="#0A29FF"
      speed={0.5}
      streakCount={2}
      streakWidth={1}
      streakLength={1}
      glow={1}
      density={0.6}
      twinkle={1}
      zoom={3}
      backgroundGlow={0.5}
      opacity={1}
      mouseInteraction
      mouseStrength={0.5}
      mouseRadius={1}
      paused={reduced}
    />
  );
}
