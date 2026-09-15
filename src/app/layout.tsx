import type { Metadata, Viewport } from 'next';
import { Inter, Geist_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import '../styles/global.css';

/**
 * Root layout.
 *
 * Fonts are loaded through next/font so they are self-hosted and subset at
 * build time — no third-party CSS request on first paint. The CSS variables
 * they expose are what tokens.css binds --font-sans and --font-mono to.
 */

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Sherlock — Give Your Inbox a Browser',
    template: '%s · Sherlock',
  },
  description:
    "Forward an email. Sherlock investigates the web, finds what you're entitled to, builds the evidence, and helps you act.",
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: 'Sherlock — Give Your Inbox a Browser',
    description:
      "Forward an email. Sherlock investigates the web, finds what you're entitled to, builds the evidence, and helps you act.",
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#131315' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
