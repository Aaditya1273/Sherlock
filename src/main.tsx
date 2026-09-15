import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { getConvexUrl } from '@convex-dev/self-static-hosting';
import { App } from './App';
import './styles/global.css';

/**
 * Convex client.
 *
 * VITE_CONVEX_URL during local development; in production the URL is derived
 * from the deployment serving the page, so the frontend and backend ship as
 * one thing on convex.site.
 */
const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL ?? getConvexUrl());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <App />
    </ConvexProvider>
  </StrictMode>
);
