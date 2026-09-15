/**
 * Sherlock mark: a magnifier whose lens is an envelope.
 * Inline SVG so it inherits `currentColor` and needs no network request.
 */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="Sherlock"
      style={{ color: 'var(--accent)' }}
    >
      <circle cx="10.5" cy="10.5" r="7.5" />
      <path d="m16 16 5 5" />
      <rect x="6.75" y="8" width="7.5" height="5.4" rx="1" />
      <path d="m6.75 8.9 3.75 2.5 3.75-2.5" />
    </svg>
  );
}
